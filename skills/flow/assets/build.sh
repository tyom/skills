#!/usr/bin/env bash
# build.sh <flow.json> <out.html> <source-root>
# Inlines the vendored runtime and the flow data into one self-contained page,
# then checks the graph and the refs against source-root.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: build.sh <flow.json> <out.html> <source-root>" >&2
  exit 2
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"

# ponytail: python3 for the substitution, not sed — 400KB of minified JS is full
# of backslashes and & that sed would eat.
DIR="$DIR" IN="$1" OUT="$2" ROOT="$3" python3 <<'PY'
import collections, functools, json, os, pathlib, sys

d = pathlib.Path(os.environ["DIR"])
src = pathlib.Path(os.environ["IN"])

try:
    data = json.loads(src.read_text())
except (OSError, json.JSONDecodeError) as e:
    sys.exit(f"build.sh: cannot read {src}: {e}")

# One diagram is written flat; several arrive under `flows`. The page only ever
# sees the array, so the shorthand is widened here.
if not isinstance(data, dict):
    sys.exit(f"build.sh: {src} must hold a JSON object")
nested = isinstance(data.get("flows"), list) and bool(data["flows"])
flows = data["flows"] if nested else [data]

# Shape checked up front: everything below indexes into these without guarding,
# so a malformed file has to fail here rather than as a traceback.
for i, flow in enumerate(flows):
    where = f"flows[{i}]" if nested else "top level"
    if not isinstance(flow, dict):
        sys.exit(f"build.sh: {src} needs an object at {where}")
    for key in ("nodes", "edges"):
        if not isinstance(flow.get(key), list):
            sys.exit(f"build.sh: {src} needs a {key!r} array at {where}")
    if not flow["nodes"]:
        sys.exit(f"build.sh: {src} has no nodes at {where}")
    for j, n in enumerate(flow["nodes"]):
        if not isinstance(n, dict) or not isinstance(n.get("id"), str) or not n["id"]:
            sys.exit(f"build.sh: {src} needs a string 'id' at {where}.nodes[{j}]")
    for j, e in enumerate(flow["edges"]):
        ends = [e.get(k) for k in ("from", "to")] if isinstance(e, dict) else []
        if len(ends) != 2 or not all(isinstance(x, str) and x for x in ends):
            sys.exit(f"build.sh: {src} needs string 'from' and 'to' at {where}.edges[{j}]")

# The vocabulary SKILL.md documents. Unknown kinds render as a plain step, so
# without this a typo silently paints a success terminal as an ordinary box.
NODE_KINDS = {"start", "step", "decision", "io", "store", "end", "success",
              "fork", "join", "state"}
EDGE_KINDS = {"async", "error", "retry"}


@functools.lru_cache(maxsize=None)
def line_count(f):
    # Bytes, so an undecodable file costs a warning rather than a crash.
    return len(f.read_bytes().splitlines())


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
            f = (root / path).resolve()
            # An absolute or ../ ref would otherwise be validated against a file
            # outside the subject, and read as if it belonged to it.
            if not f.is_relative_to(root):
                warnings.append(("ref escapes source root", f"{nid}: {ref}"))
            elif not f.is_file():
                warnings.append(("ref file missing", f"{nid}: {ref}"))
            elif line and int(line) > line_count(f):
                warnings.append(("ref line past end", f"{nid}: {ref}"))
        kind = node.get("kind", "step")
        if kind not in NODE_KINDS:
            bad.append(("unknown node kind", f"{nid}: {kind}"))
        if kind == "decision" and len(outgoing[nid]) < 2:
            bad.append((f"decision, {len(outgoing[nid])} way out", f"{nid}: {label}"))
        if kind not in ("end", "success") and not outgoing[nid]:
            bad.append(("path stops, not an end", f"{nid}: {label}"))
        if kind == "start" and incoming[nid]:
            bad.append(("start has an inbound edge", f"{nid}: {label}"))

    for e in edges:
        where = f"{e['from']} -> {e['to']}"
        missing = [e[end] for end in ("from", "to") if e[end] not in by_id]
        if missing:
            bad.append(("edge points at a missing id", f"{where}: {', '.join(missing)}"))
        if e.get("kind") and e["kind"] not in EDGE_KINDS:
            bad.append(("unknown edge kind", f"{where}: {e['kind']}"))
        if by_id.get(e["from"], {}).get("kind") == "decision" and not e.get("label"):
            bad.append(("decision edge unlabelled", where))

    seen, queue = set(), [n["id"] for n in nodes if n.get("kind") == "start"]
    while queue:
        cur = queue.pop()
        if cur in seen:
            continue
        seen.add(cur)
        queue += [e["to"] for e in outgoing[cur]]
    bad += [
        ("unreachable from start", f"{n['id']}: {n.get('label', '')}")
        for n in nodes
        if n["id"] not in seen
    ]

    # And backwards from the terminals: a loop with no exit is reachable from a
    # start and still traps the reader. Dead ends already reported above.
    ends, queue = set(), [n["id"] for n in nodes if n.get("kind") in ("end", "success")]
    while queue:
        cur = queue.pop()
        if cur in ends:
            continue
        ends.add(cur)
        queue += [e["from"] for e in incoming[cur]]
    bad += [
        ("no path to an end", f"{n['id']}: {n.get('label', '')}")
        for n in nodes
        if n["id"] in seen and n["id"] not in ends and outgoing[n["id"]]
    ]
    return warnings, bad


# Checked before the page is written, so each flow can carry its own problems
# and the badge on the page says exactly what this output says.
root = pathlib.Path(os.environ["ROOT"]).resolve()
reports = [check(flow, root) for flow in flows]
for flow, (_, bad) in zip(flows, reports):
    flow["problems"] = [f"{what}: {where}" for what, where in bad]

page = (d / "template.html").read_text()
for marker, part in (
    ("/*VENDOR_CSS*/", (d / "vendor.css").read_text()),
    ("/*VENDOR_JS*/", (d / "vendor.js").read_text()),
    # </script> inside a string would close the data block early.
    ("__FLOW_DATA__", json.dumps({"title": data.get("title", ""), "flows": flows})
                          .replace("</", "<\\/")),
):
    if marker not in page:
        sys.exit(f"build.sh: template.html is missing {marker}")
    page = page.replace(marker, part, 1)

# The page is written either way: a broken graph has to stay openable while it
# is being fixed.
out = pathlib.Path(os.environ["OUT"])
out.write_text(page)
n = sum(len(f["nodes"]) for f in flows)
e = sum(len(f["edges"]) for f in flows)
print(f"{out}  ({len(page) // 1024}KB, {len(flows)} flow(s), {n} nodes, {e} edges)")

for i, (flow, (warnings, bad)) in enumerate(zip(flows, reports)):
    if not warnings and not bad:
        continue
    counts = [f"{len(bad)} problem(s)"] if bad else []
    counts += [f"{len(warnings)} ref warning(s)"] if warnings else []
    print(f"{flow.get('title') or f'flows[{i}]'}: {', '.join(counts)}")
    for what, where in bad + warnings:
        print(f"  {what:<28}{where}")

sys.exit(1 if any(bad for _, bad in reports) else 0)
PY
