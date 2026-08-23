#!/usr/bin/env python3
"""build.py <flow.json> <out.html> <source-root>

Inlines the flow data into the bundled page, then checks the graph and refs
against source-root.
"""
# ponytail: one stdlib process builds and checks the page. A second templating
# tool would only duplicate the escaping and file handling below.
import collections, functools, html, json, os, pathlib, sys

if len(sys.argv) != 4:
    # 2, not 1: a broken graph also exits non-zero, and the two are worth telling apart.
    print("usage: build.py <flow.json> <out.html> <source-root>", file=sys.stderr)
    sys.exit(2)

d = pathlib.Path(__file__).resolve().parent
src = pathlib.Path(sys.argv[1])

try:
    data = json.loads(src.read_text())
except (OSError, json.JSONDecodeError) as e:
    sys.exit(f"build.py: cannot read {src}: {e}")

# One diagram is written flat; several arrive under `flows`. The page only ever
# sees the array, so the shorthand is widened here.
if not isinstance(data, dict):
    sys.exit(f"build.py: {src} must hold a JSON object")
nested = isinstance(data.get("flows"), list) and bool(data["flows"])
flows = data["flows"] if nested else [data]

# Shape checked up front: everything below indexes into these without guarding,
# so a malformed file has to fail here rather than as a traceback.
for i, flow in enumerate(flows):
    where = f"flows[{i}]" if nested else "top level"
    if not isinstance(flow, dict):
        sys.exit(f"build.py: {src} needs an object at {where}")
    for key in ("nodes", "edges"):
        if not isinstance(flow.get(key), list):
            sys.exit(f"build.py: {src} needs a {key!r} array at {where}")
    if not flow["nodes"]:
        sys.exit(f"build.py: {src} has no nodes at {where}")
    for j, n in enumerate(flow["nodes"]):
        if not isinstance(n, dict) or not isinstance(n.get("id"), str) or not n["id"]:
            sys.exit(f"build.py: {src} needs a string 'id' at {where}.nodes[{j}]")
    for j, e in enumerate(flow["edges"]):
        ends = [e.get(k) for k in ("from", "to")] if isinstance(e, dict) else []
        if len(ends) != 2 or not all(isinstance(x, str) and x for x in ends):
            sys.exit(f"build.py: {src} needs string 'from' and 'to' at {where}.edges[{j}]")

# The vocabulary SKILL.md documents. Unknown kinds render as a plain step, so
# without this a typo silently paints a success terminal as an ordinary box.
NODE_KINDS = {"start", "step", "decision", "io", "store", "end", "success",
              "fork", "join", "state"}
EDGE_KINDS = {"async", "error", "retry"}
# Emphasis, not evidence: a level renders a node larger so a long flow reads as
# a few phases. It only works by contrast, so H1_SHARE is the point past which
# the top tier has stopped being emphasis and is just a bigger flat cloud. Only
# h1 is counted; h2 is the middle tier and is meant to be the commoner of the two.
LEVELS = {"h1", "h2"}
H1_SHARE = 1 / 3
# Borrowed rather than calibrated for a diagram: ten is McCabe's convention from
# code review, and fifteen sits between the deepest flow that read well here and
# the one that did not. Both warnings carry their number so a wrong band shows.
MAX_VG, MAX_DEPTH = 10, 15

# Enough of src/style.css and src/app.js to work out how tall a laid-out flow
# stands, so the build can say what window opens it whole without one being
# opened. Change --pad-y, --size, ranksep or the fit there and change these with
# them. Width is deliberately not modelled: dagre reserves room for every edge
# spanning more than one rank and spreads the rank to route it, which measured
# between 2% and 39% wider than the nodes alone.
RANKSEP, LABELH, HEADER = 56, 20, 45
FIT_FLOOR, FIT_PAD = 0.7, 0.15
# One row per level, so the four numbers that describe a box stay side by side:
# --pad-y, --pad-x, --size, and the extra a hexagon's point costs.
LEVEL = {None: (8, 12, 14, 1), "h2": (12, 16, 18, 2), "h1": (20, 26, 26, 4)}
# Of the font size. app.js measures a node in the DOM because an arrowhead hides
# under a box that grew past the rect its route aimed at; nothing here is that
# tight, so it estimates the way app.js already estimates an edge label.
CHAR, NOTE_H, REF_H, BORDER = 0.52, 20, 19, 2

# A browser cannot ask the OS for "the" editor, and a reader may not use the one
# the trace was built on, so the page holds every opener and this is only the one
# it starts on. The names match the openers in template.html.
EDITORS = ("vscode", "cursor", "windsurf", "zed", "sublime", "textmate",
           "webstorm", "idea", "copy")


def detect_editor():
    """The terminal this runs in is the one guess worth making. Everything else
    is the reader's pick in the header, which their browser remembers."""
    env = os.environ
    if env.get("ZED_TERM"):
        return "zed"
    if env.get("TERM_PROGRAM") == "vscode":
        bundle = env.get("__CFBundleIdentifier", "").lower()
        return next((n for n in ("cursor", "windsurf") if n in bundle), "vscode")
    return "vscode"


file_links = []


def resolve_file(root, path, line, noun, where, warnings):
    """Checks one path against the source root and says how to open it, or None
    where there is nothing to open. A warned path still reads as what it claimed.
    Refs and links ask exactly this, so they ask it in one place."""
    f = (root / path).resolve()
    # An absolute or ../ path would otherwise be validated against a file outside
    # the subject, and read as if it belonged to it.
    inside = f.is_relative_to(root)
    shown = f"{path}:{line}" if line else path
    if not inside:
        warnings.append((f"{noun} escapes source root", f"{where}: {shown}"))
    elif not f.is_file():
        warnings.append((f"{noun} file missing", f"{where}: {shown}"))
    elif line and int(line) > line_count(f):
        warnings.append((f"{noun} line past end", f"{where}: {shown}"))
    if not (inside and f.is_file()):
        return None
    return {"abs": str(f), "line": int(line) if line else 1}


def resolve_links(owner, where, root, warnings):
    """A link is either a web address, taken as written, or a path in the source
    root, turned into an editor URL so it opens where the code is read."""
    links = owner.get("links")
    if links is None:
        return
    if not isinstance(links, list):
        sys.exit(f"build.py: {src} needs a 'links' array at {where}")
    for k, link in enumerate(links):
        if not isinstance(link, dict) or not (link.get("url") or link.get("path")):
            sys.exit(f"build.py: {src} needs 'url' or 'path' at {where}.links[{k}]")
        if link.get("url"):
            # The page renders a url as an anchor, so a scheme that carries code
            # has no business reaching it.
            if not link["url"].lower().startswith(("http://", "https://")):
                sys.exit(f"build.py: {src} needs an http(s) 'url' at {where}.links[{k}]")
            link.setdefault("label", link["url"])
            continue
        path, line = link["path"], link.get("line")
        # resolve_file counts and opens at this number, so a string or a 0 would
        # crash the build or open at no line at all.
        if line is not None and (not isinstance(line, int) or line < 1):
            sys.exit(f"build.py: {src} needs a positive integer 'line' at {where}.links[{k}]")
        opener = resolve_file(root, path, line, "link", where, warnings)
        link["file"] = f"{path}:{line}" if line else path
        link.setdefault("label", link["file"])
        # An opener is offered for a file that is there to open.
        if opener:
            link.update(opener)
            file_links.append(link["file"])


@functools.lru_cache(maxsize=None)
def line_count(f):
    # Bytes, so an undecodable file costs a warning rather than a crash.
    return len(f.read_bytes().splitlines())


def reach(seeds, adj, field, skip=None):
    """Every id a walk from `seeds` arrives at, following `field` of each edge in
    `adj`. Forwards over `to`, backwards over `from`."""
    seen, queue = set(), list(seeds)
    while queue:
        cur = queue.pop()
        if cur in seen or cur == skip:
            continue
        seen.add(cur)
        queue += [e[field] for e in adj[cur]]
    return seen


def check(flow, root):
    """Graph faults and ref faults are kept apart: a flow may legitimately trace a
    subject with no local source, so a stale ref cannot be worth failing over."""
    nodes, edges = flow["nodes"], flow["edges"]
    by_id = {n["id"]: n for n in nodes}
    outgoing, incoming = collections.defaultdict(list), collections.defaultdict(list)
    for e in edges:
        outgoing[e["from"]].append(e)
        incoming[e["to"]].append(e)

    warnings, bad, seen = [], [], set()
    resolve_links(flow, "flow", root, warnings)
    for node in nodes:
        nid, label = node["id"], node.get("label", "")
        if nid in seen:
            bad.append(("duplicate node id", f"{nid}: {label}"))
        seen.add(nid)
        ref = node.get("ref")
        if ref:
            path, _, line = ref.rpartition(":")
            if not line.isdigit():
                path, line = ref, None
            # The panel shows the ref; with a file behind it, it also opens it.
            opener = resolve_file(root, path, line, "ref", nid, warnings)
            if opener:
                node["refLink"] = dict(opener, path=path, file=ref)
                file_links.append(ref)
        resolve_links(node, nid, root, warnings)
        kind = node.get("kind", "step")
        if kind not in NODE_KINDS:
            bad.append(("unknown node kind", f"{nid}: {kind}"))
        level = node.get("level")
        if level is not None and level not in LEVELS:
            bad.append(("unknown node level", f"{nid}: {level}"))
        # A bar is pinned to its height and shows only its label, so a level set
        # on one is silently nothing. Say so rather than render it unchanged.
        if level is not None and kind in ("fork", "join"):
            bad.append(("level on a bar", f"{nid}: {kind}"))
        if kind == "decision" and len(outgoing[nid]) < 2:
            bad.append((f"decision, {len(outgoing[nid])} way out", f"{nid}: {label}"))
        if kind not in ("end", "success") and not outgoing[nid]:
            bad.append(("path stops, not an end", f"{nid}: {label}"))
        if kind == "start" and incoming[nid]:
            bad.append(("start has an inbound edge", f"{nid}: {label}"))

    top = [n for n in nodes if n.get("level") == "h1"
           and n.get("kind", "step") not in ("fork", "join")]
    if nodes and len(top) > len(nodes) * H1_SHARE:
        warnings.append(("h1 too often to stand out",
                         f"{len(top)} of {len(nodes)} nodes"))

    for e in edges:
        where = f"{e['from']} -> {e['to']}"
        resolve_links(e, where, root, warnings)
        missing = [e[end] for end in ("from", "to") if e[end] not in by_id]
        if missing:
            bad.append(("edge points at a missing id", f"{where}: {', '.join(missing)}"))
        if e.get("kind") and e["kind"] not in EDGE_KINDS:
            bad.append(("unknown edge kind", f"{where}: {e['kind']}"))
        if by_id.get(e["from"], {}).get("kind") == "decision" and not e.get("label"):
            bad.append(("decision edge unlabelled", where))

    seen = reach([n["id"] for n in nodes if n.get("kind") == "start"], outgoing, "to")
    bad += [
        ("unreachable from start", f"{n['id']}: {n.get('label', '')}")
        for n in nodes
        if n["id"] not in seen
    ]

    # And backwards from the terminals: a loop with no exit is reachable from a
    # start and still traps the reader. Dead ends already reported above.
    ends = reach([n["id"] for n in nodes if n.get("kind") in ("end", "success")],
                 incoming, "from")
    bad += [
        ("no path to an end", f"{n['id']}: {n.get('label', '')}")
        for n in nodes
        if n["id"] in seen and n["id"] not in ends and outgoing[n["id"]]
    ]
    return warnings, bad


def node_width(kind, level):
    return (240 if kind == "decision" else 190) + (140 if level == "h1" else 40 if level == "h2" else 0)


def node_height(node):
    kind, level = node.get("kind", "step"), node.get("level")
    if kind in ("fork", "join"):
        return 22
    pad_y, pad_x, font, point = LEVEL[level]
    # A decision is clipped to a hexagon, so its text sits further in.
    room = node_width(kind, level) - 2 * (pad_x + (14 if kind == "decision" else 0))
    wide, lines, run = CHAR * font, 1, 0.0
    for word in (node.get("label") or node["id"]).split():
        step = len(word) * wide + (wide if run else 0)
        if run and run + step > room:
            lines, run = lines + 1, len(word) * wide
        else:
            run += step
    return (2 * pad_y + lines * round(font * 1.5) + BORDER
            + (NOTE_H if node.get("note") else 0) + (REF_H if node.get("ref") else 0)
            + (point * 2 if kind == "decision" else 0))


def window_height(flow, m):
    """The shortest window that opens this flow whole.

    Below it the fit stops at its zoom floor and the page opens cropped, which
    the renderer is built for: it holds the view over the graph and gives the
    reader the minimap and a whole-graph fit. So this is a note, not a limit.
    """
    by = collections.defaultdict(list)
    for node in flow["nodes"]:
        by[m["rank"][node["id"]]].append(node)
    ranks = sorted(by)
    labelled = {e["from"] for e in flow["edges"] if e.get("label")}
    tall = sum(max(node_height(n) for n in by[r]) for r in ranks)
    # dagre parts two ranks further when an edge crossing the gap carries a label.
    tall += sum(RANKSEP + (LABELH if any(n["id"] in labelled for n in by[r]) else 0)
                for r in ranks[:-1])
    need = tall * FIT_FLOOR * (1 + FIT_PAD) + HEADER
    # Rounded up to 50. Against ten laid-out flows the estimate ran from 2% under
    # to 4% over, the drift coming from ranks dagre assigns differently to this
    # walk. Rounding up keeps an under-estimate from reading as "this one fits",
    # and leaves the error on the side of asking for a window bigger than needed.
    return int((need + 49) // 50 * 50)


def measure(flow):
    """Two numbers about the flow itself, rather than the window it opens in.

    V(G) is McCabe with a virtual exit added, so a flow with four terminals does
    not score better than one with a single end. A retry edge counts, because
    going round is a route the reader can take. Depth is the longest path
    without them, which is how dagre ranks and how the panel's backward walk
    already treats them.
    """
    ids = {n["id"] for n in flow["nodes"]}
    # A dangling edge is already reported as a problem. Counting it here would
    # describe the same fault a second time, in a stranger number.
    edges = [e for e in flow["edges"] if e["from"] in ids and e["to"] in ids]
    ends = sum(1 for n in flow["nodes"] if n.get("kind") in ("end", "success"))

    onward = collections.defaultdict(list)
    for e in edges:
        if e.get("kind") != "retry":
            onward[e["from"]].append(e["to"])
    order, seen, open_path, back = [], set(), set(), set()

    def walk(nid):
        seen.add(nid)
        open_path.add(nid)
        for nxt in onward[nid]:
            # An untagged cycle still has to break somewhere, and dagre breaks it
            # at the same edge: the one that closes the walk.
            if nxt in open_path:
                back.add((nid, nxt))
            elif nxt not in seen:
                walk(nxt)
        open_path.discard(nid)
        order.append(nid)

    # Node order, not set order: a set of strings iterates differently per run,
    # which would pick different edges to break and report a different depth.
    for node in flow["nodes"]:
        if node["id"] not in seen:
            walk(node["id"])

    rank, prev = dict.fromkeys(ids, 0), {}
    for nid in reversed(order):
        for nxt in onward[nid]:
            if (nid, nxt) not in back and rank[nid] + 1 > rank[nxt]:
                rank[nxt] = rank[nid] + 1
                prev[nxt] = nid

    # The spine is the longest path itself. Only the nodes on it cost depth, so
    # it is the one list worth showing an author who has to make a flow shorter.
    at = {n["id"]: i for i, n in enumerate(flow["nodes"])}
    spine, cur = [], max(rank, key=lambda k: (rank[k], -at[k]))
    while cur is not None:
        spine.append(cur)
        cur = prev.get(cur)
    spine.reverse()
    return {"v": len(edges) + ends - len(ids) + 1, "depth": max(rank.values()) + 1,
            "rank": rank, "spine": spine}


def cuts(flow, m):
    """Where a flow that is too deep divides, and which of its nodes cost a rank
    without earning one.

    A split is offered at a node every path already crosses, so the seam is found
    rather than invented. That node lands in both halves, as the terminal of one
    tab and the entry of the other, which is why the two depths overlap by one.
    """
    by_id = {n["id"]: n for n in flow["nodes"]}
    edges = [e for e in flow["edges"] if e["from"] in by_id and e["to"] in by_id]
    into, out_of = collections.Counter(), collections.defaultdict(list)
    for e in edges:
        into[e["to"]] += 1
        out_of[e["from"]].append(e)
    starts = {n["id"] for n in flow["nodes"] if n.get("kind") == "start"}
    ends = {n["id"] for n in flow["nodes"] if n.get("kind") in ("end", "success")}

    found = []
    for i, node in enumerate(flow["nodes"]):
        nid = node["id"]
        if nid in starts or nid in ends:
            continue
        # Not "some end goes unreached": a flow that can bail out early keeps one
        # reachable from its second node, and by that test nothing after the bail
        # is ever a seam. What a seam has to own is everything below it.
        below = {n["id"] for n in flow["nodes"] if m["rank"][n["id"]] > m["rank"][nid]}
        if below & reach(starts, out_of, "to", skip=nid):
            continue
        a, b = m["rank"][nid] + 1, m["depth"] - m["rank"][nid]
        # Below three ranks a half is a start wired straight to an end, which is
        # the tab too thin to justify its own diagram.
        if min(a, b) >= 3:
            found.append((abs(a - b), i, nid, a, b))

    # One edge in, one out, and no label to lose: the rank is all it costs.
    merge = [nid for nid in m["spine"]
             if into[nid] == 1 and len(out_of[nid]) == 1
             and by_id[nid].get("kind", "step") in ("step", "io", "store")
             and not out_of[nid][0].get("label")]
    return (min(found)[2:] if found else None), merge


# Checked before the page is written, so each flow can carry its own problems
# and the badge on the page says exactly what this output says.
root = pathlib.Path(sys.argv[3]).resolve()
editor = data.get("editor") or detect_editor()
if editor not in EDITORS:
    sys.exit(f"build.py: unknown editor {editor!r}: use one of {', '.join(EDITORS)}")

measures = [measure(flow) for flow in flows]
reports = [check(flow, root) for flow in flows]
for flow, m, (warnings, _) in zip(flows, measures, reports):
    # Depth is a fault in the trace and answers to a split. Branching belongs to
    # the subject, and nothing here can cut it, so that one only gets its number.
    if m["depth"] > MAX_DEPTH:
        warnings.append(("deeper than one graph reads", f"{m['depth']} ranks"))
        split, merge = cuts(flow, m)
        if split:
            warnings.append(("split candidate", f"{split[0]}: {split[1]} + {split[2]} ranks"))
        if merge:
            warnings.append(("costs a rank, earns none", ", ".join(merge)))
    if m["v"] > MAX_VG:
        warnings.append(("branching is high", f"V(G) {m['v']}; no split reduces it"))
for flow, (_, bad) in zip(flows, reports):
    flow["problems"] = [f"{what}: {where}" for what, where in bad]

page = (d / "template.html").read_text()
for marker, part in (
    # The title is written into the head, not set by the script, so the file
    # names itself in a listing or a bookmark that never runs it.
    ("__TITLE__", html.escape(data.get("title") or flows[0].get("title") or "Flow")),
    # </script> inside a string would close the data block early.
    ("__FLOW_DATA__", json.dumps({"title": data.get("title", ""), "editor": editor,
                                  "hasFileLinks": bool(file_links),
                                  "flows": flows})
                          .replace("</", "<\\/")),
):
    if marker not in page:
        sys.exit(f"build.py: template.html is missing {marker}")
    page = page.replace(marker, part, 1)

# The page is written either way: a broken graph has to stay openable while it
# is being fixed.
out = pathlib.Path(sys.argv[2])
out.write_text(page)
n = sum(len(f["nodes"]) for f in flows)
e = sum(len(f["edges"]) for f in flows)
opens = f", {len(file_links)} file link(s), {editor} first" if file_links else ""
print(f"{out}  ({len(page) // 1024}KB, {len(flows)} flow(s), {n} nodes, {e} edges{opens})")

# Printed every run rather than only when high: nobody has calibrated a band for
# a diagram yet, and a number you see on every build is what will settle one.
for i, (flow, m) in enumerate(zip(flows, measures)):
    # Two spaces of its own, since a title is the author's text and can be any
    # length; without them a long one runs straight into the number.
    print(f"  {(flow.get('title') or f'flows[{i}]'):<26}  "
          f"V(G) {m['v']}, {m['depth']} ranks, needs {window_height(flow, m)}px of height")

for i, (flow, (warnings, bad)) in enumerate(zip(flows, reports)):
    if not warnings and not bad:
        continue
    counts = [f"{len(bad)} problem(s)"] if bad else []
    counts += [f"{len(warnings)} warning(s)"] if warnings else []
    print(f"{flow.get('title') or f'flows[{i}]'}: {', '.join(counts)}")
    for what, where in bad + warnings:
        print(f"  {what:<28}{where}")

sys.exit(1 if any(bad for _, bad in reports) else 0)
