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

`kinds-probe.json` is the one to open after changing the page source: its five
tabs cover fork/join, multiple entries, decision
reconvergence, a retry, a state cycle, a self-edge, every node and edge kind, and
both levels against every shape that sizes itself.
Click a node and an edge on each tab, check the detail panel fills, and walk it
with the arrow keys. A selection after the join must light all three parallel
branches. A selection after the shared entry must light both entries. A
selection after decision reconvergence must keep one route. Watch the console.

Export as SVG and open the file. The page's own stylesheet is inlined into it as
XML, so a stray `<` in a CSS comment breaks the export and nothing on the page
itself shows it.

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

## Rebuild the page

Bun compiles `src/template.html` and its imports into the committed
`assets/template.html`. Normal flow builds use that file and do not need Bun or
`node_modules`.

```bash
bun install --frozen-lockfile
bun run build
```

Run the kinds probe afterwards.

## End to end

Link the skill (`just link flow` from the repo root), start a fresh session, and
run `/flow` on something small with obvious branches. The skill writes its JSON
to `/tmp/YYYY-MM-DD-flow-<slug>.json`, so that file is there to read and rebuild
by hand afterwards.
