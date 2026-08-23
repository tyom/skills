#!/usr/bin/env python3
"""Checks the V(G) and rank numbers build.py prints, against values that did not
come from build.py: example.json worked by hand from N, E and its terminals, and
rank counts read off what dagre actually laid out in a browser.

Run it after touching measure(), or after changing which edges a retry breaks.

    assets/measure-check.py
"""
import pathlib, re, subprocess, sys, tempfile

d = pathlib.Path(__file__).resolve().parent

# kinds-probe carries the awkward cases on purpose: two flows with loops, one
# with several entries. Those are what the cycle break in measure() is for.
CASES = {
    "example.json": ["V(G) 4, 7 ranks"],
    "kinds-probe.json": ["V(G) 4, 6 ranks", "V(G) 3, 4 ranks", "V(G) 2, 4 ranks",
                         "V(G) 4, 6 ranks", "V(G) 5, 8 ranks"],
}

bad = 0
for name, expect in CASES.items():
    with tempfile.TemporaryDirectory() as tmp:
        run = subprocess.run([sys.executable, str(d / "build.py"), str(d / name),
                              f"{tmp}/out.html", str(d.parent)],
                             capture_output=True, text=True)
    got = re.findall(r"V\(G\) \d+, \d+ ranks", run.stdout)
    if got != expect:
        bad += 1
        print(f"{name}\n  expected {expect}\n  got      {got}", file=sys.stderr)

# A retry edge usually closes a cycle, which the walk breaks anyway, so the two
# only part when the edge is reached with its target already visited but no
# longer open. Here `y` is walked after `x` has been popped: untagged, `y -> x`
# is a cross edge and stretches the flow to 5 ranks; tagged, it is 4.
CROSS = """{"title": "retry reached as a cross edge",
  "nodes": [{"id": "s", "kind": "start"}, {"id": "x"}, {"id": "y"}, {"id": "z"},
            {"id": "d", "kind": "end"}],
  "edges": [{"from": "s", "to": "x"}, {"from": "x", "to": "z"},
            {"from": "z", "to": "d"}, {"from": "s", "to": "y"},
            {"from": "y", "to": "x", "kind": "retry"}]}"""

with tempfile.TemporaryDirectory() as tmp:
    src = pathlib.Path(tmp, "cross.json")
    src.write_text(CROSS)
    run = subprocess.run([sys.executable, str(d / "build.py"), str(src),
                          f"{tmp}/out.html", tmp], capture_output=True, text=True)
got = re.findall(r"V\(G\) \d+, \d+ ranks", run.stdout)
if got != ["V(G) 2, 4 ranks"]:
    bad += 1
    print(f"cross-edge retry\n  expected ['V(G) 2, 4 ranks']\n  got      {got}", file=sys.stderr)

# Same input twice, same numbers: the walk starts from node order rather than a
# set, and a set of strings iterates differently on every run.
with tempfile.TemporaryDirectory() as tmp:
    runs = {subprocess.run([sys.executable, str(d / "build.py"), str(d / "kinds-probe.json"),
                            f"{tmp}/out.html", str(d.parent)],
                           capture_output=True, text=True).stdout for _ in range(3)}
if len(runs) != 1:
    bad += 1
    print("kinds-probe.json: output differs between runs", file=sys.stderr)

print("measure-check: ok" if not bad else f"measure-check: {bad} failure(s)")
sys.exit(1 if bad else 0)
