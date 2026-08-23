#!/usr/bin/env python3
"""Checks the numbers build.py prints about a flow, against values that did not
come from build.py: example.json worked by hand from N, E and its terminals,
rank counts read off what dagre actually laid out in a browser, and two small
fixtures for the cases the repo's own flows do not reach.

Run it after touching measure() or cuts().

    assets/measure-check.py
"""
import json, pathlib, re, subprocess, sys, tempfile

d = pathlib.Path(__file__).resolve().parent
bad = 0


def run(src, root=None):
    """Builds one flow and returns what the command said. A flow may be a path
    in this directory or the JSON itself, which is how the fixtures below stay
    in this file rather than becoming assets nobody else uses."""
    with tempfile.TemporaryDirectory() as tmp:
        path = d / src if isinstance(src, str) and src.endswith(".json") else pathlib.Path(tmp, "f.json")
        if path.parent == pathlib.Path(tmp):
            path.write_text(src)
        return subprocess.run([sys.executable, str(d / "build.py"), str(path),
                               f"{tmp}/out.html", str(root or d.parent)],
                              capture_output=True, text=True).stdout


def expect(name, got, want):
    global bad
    if got != want:
        bad += 1
        print(f"{name}\n  expected {want}\n  got      {got}", file=sys.stderr)


def numbers(out):
    return re.findall(r"V\(G\) \d+, \d+ ranks", out)


# kinds-probe carries the awkward topologies on purpose: two flows with loops,
# one with several entries. Those are what the cycle break in measure() is for.
expect("example.json", numbers(run("example.json")), ["V(G) 4, 7 ranks"])
expect("kinds-probe.json", numbers(run("kinds-probe.json")),
       ["V(G) 4, 6 ranks", "V(G) 3, 4 ranks", "V(G) 2, 4 ranks",
        "V(G) 4, 6 ranks", "V(G) 5, 8 ranks"])

# Window heights, each in the same 50px bucket as what dagre actually laid out
# in a browser: graphs of 520, 384, 344, 554 and 992px, which need windows of
# 464, 354, 322, 491 and 844px. Hierarchy is the one the estimate under-reads,
# by 2%, which is why the answer is rounded up rather than to nearest.
expect("kinds-probe heights", re.findall(r"needs (\d+)px", run("kinds-probe.json")),
       ["500", "400", "350", "500", "850"])

# Nothing above sits near the width a label wraps at, so the character estimate
# could be anything and still pass. These two labels were measured in a browser
# at the plain node width of 190px: "Read the defining authority" takes two
# lines and stands 79px with a ref, "Record a path:line ref" takes one and
# stands 58px. Four of the tall one put the total far enough out that a wrong
# estimate lands in a different 50px bucket.
WRAP = json.dumps({
    "title": "labels at the wrap",
    "nodes": [{"id": "s", "kind": "start", "ref": "SKILL.md:1"}]
             + [{"id": f"w{i}", "label": "Read the defining authority", "ref": "SKILL.md:1"}
                for i in range(1, 5)]
             + [{"id": "r", "label": "Record a path:line ref", "ref": "SKILL.md:1"},
                {"id": "e", "kind": "end", "ref": "SKILL.md:1"}],
    "edges": [{"from": a, "to": b} for a, b in
              zip(["s", "w1", "w2", "w3", "w4", "r"], ["w1", "w2", "w3", "w4", "r", "e"])]})
# 58 + 79x4 + 58 + 58 of node, six 56px rank gaps, no edge labels: 826px of graph
# and 710px of window.
expect("wrapped labels", re.findall(r"needs (\d+)px", run(WRAP)), ["750"])

# A retry edge usually closes a cycle, which the walk breaks anyway, so tagging
# it only changes the answer when the edge is reached with its target already
# visited but no longer open. Here `y` is walked after `x` has been popped:
# untagged, `y -> x` is a cross edge and stretches the flow to 5 ranks.
CROSS = json.dumps({
    "title": "retry reached as a cross edge",
    "nodes": [{"id": "s", "kind": "start"}, {"id": "x"}, {"id": "y"},
              {"id": "z"}, {"id": "d", "kind": "end"}],
    "edges": [{"from": "s", "to": "x"}, {"from": "x", "to": "z"},
              {"from": "z", "to": "d"}, {"from": "s", "to": "y"},
              {"from": "y", "to": "x", "kind": "retry"}]})
expect("cross-edge retry", numbers(run(CROSS)), ["V(G) 2, 4 ranks"])

# Deep enough to trip the band. Every internal node here is a cut vertex, so the
# report has to pick the one that halves the flow rather than the first it meets,
# and `s` and `e` must not be offered as seams at all.
ids = ["s"] + [f"a{i}" for i in range(1, 8)] + ["mid"] + [f"b{i}" for i in range(1, 8)] + ["e"]
CHAIN = json.dumps({
    "title": "long chain",
    "nodes": [{"id": i, **({"kind": "start"} if i == "s" else {"kind": "end"} if i == "e" else {})}
              for i in ids],
    "edges": [{"from": x, "to": y} for x, y in zip(ids, ids[1:])]})
out = run(CHAIN)
expect("chain depth", numbers(out), ["V(G) 1, 17 ranks"])
expect("chain seam", re.findall(r"split candidate\s+(\S+ \d+ \+ \d+ ranks)", out),
       ["mid: 9 + 9 ranks"])
# One route through: nothing to say about branching, and no split would change it.
expect("chain branching", "branching is high" in out, False)

# Two chains that leave one hub and never meet again, so the hub is the only
# node every path crosses. It sits one rank in, and a 2-rank half is a start
# wired straight to an end, so this flow is deep enough to warn and has no seam
# worth offering.
legs = [[f"{side}{i}" for i in range(1, 14)] for side in "pq"]
HUB = json.dumps({
    "title": "one shallow seam",
    "nodes": ([{"id": "s", "kind": "start"}, {"id": "x"}]
              + [{"id": i} for leg in legs for i in leg]
              + [{"id": "e1", "kind": "end"}, {"id": "e2", "kind": "end"}]),
    "edges": ([{"from": "s", "to": "x"}]
              + [{"from": a, "to": b} for leg in legs for a, b in zip(leg, leg[1:])]
              + [{"from": "x", "to": leg[0]} for leg in legs]
              + [{"from": leg[-1], "to": end} for leg, end in zip(legs, ["e1", "e2"])])})
out = run(HUB)
expect("hub depth", numbers(out), ["V(G) 2, 16 ranks"])
expect("thin seam refused", "split candidate" in out, False)

# Same input twice, same numbers: the walk starts from node order rather than a
# set, and a set of strings iterates differently on every run. The first line
# names the output file, which is a fresh temporary path on each build.
def body(out):
    return out.split("\n", 1)[1]


expect("determinism", len({body(run("kinds-probe.json")) for _ in range(3)}), 1)

print("measure-check: ok" if not bad else f"measure-check: {bad} failure(s)")
sys.exit(1 if bad else 0)
