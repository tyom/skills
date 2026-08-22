# flow — local development

How to test this skill without waiting for a real tracing session. For linking
the skill into an agent so `/flow` works, see the repo [README](../../README.md).

## Render the fixtures

`assets/build.sh <flow.json> <out.html> <source-root>` is the whole build. Run
it from this directory:

```bash
# Every node and edge kind, once. No refs, so nothing to resolve.
assets/build.sh assets/kinds-probe.json /tmp/flow-probe.html .
open /tmp/flow-probe.html

# A real single-flow trace. Its refs point at this repo, hence ../..
assets/build.sh assets/example.json /tmp/flow-example.html ../..
open /tmp/flow-example.html
```

`kinds-probe.json` is the one to open after touching `template.html` or
`vendor.js`: it covers both tabs, fork/join, a state machine, a self-edge, a
reverse pair, and every edge kind. Click a node and an edge on each tab, check
the detail panel fills and the path highlights, and watch the console.

## Check the checker

The build writes the page even when the graph is broken, and exits 1 so a
problem is not silent. Break a copy to see it:

```bash
sed 's/"kind": "success"/"kind": "step"/' assets/kinds-probe.json > /tmp/bad.json
assets/build.sh /tmp/bad.json /tmp/flow-bad.html . ; echo "exit=$?"
```

Expect `path stops, not an end`, exit 1, and the problem repeated in a badge on
the page itself. Ref problems (`ref file missing`, `ref line past end`) are
warnings instead — exit 0 — because a flow may trace a subject with no local
source. Pass the wrong `<source-root>` to see them. A `links` entry with a
`path` is checked the same way.

## Refresh the vendored runtime

`assets/vendor.sh` refetches React, dagre and `@xyflow/react` from unpkg at the
versions pinned at the top of the script. Only run it to bump a version, and
open the probe afterwards — the UMD/JSX shim in that script is the part most
likely to break.

## End to end

Link the skill (`just link flow` from the repo root), start a fresh session, and
run `/flow` on something small with obvious branches. The skill writes its JSON
to `/tmp/YYYY-MM-DD-flow-<slug>.json`, so that file is there to read and rebuild
by hand afterwards.
