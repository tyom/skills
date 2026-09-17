# flow

Trace a flow from evidence and render it as one self-contained HTML page. Every
node is a real step or state, every edge a real transition, and every claim
carries the source it came from: a `path:line` in this checkout, an RFC, a vendor
manual, or a named decision and its owner.

Run it with `/flow`. It is slash-only, so the model never starts it on its own.
The skill surveys the subject, asks at most one question when several flows
compete, traces each path from entry to terminal, writes
`/tmp/YYYY-MM-DD-flow-<slug>.json`, and builds the page.

## Examples

Three pages built by the skill, all traced from published authority rather than
from code, so none of them has a single local ref:

- [How HTTP works](https://how-http-works.surge.sh) — three tabs from RFC 9110
  and friends: one request end to end, the cache decision between reuse,
  revalidate and fetch, and which version runs over which connection.
- [How a DC fast charger works](https://ev-fast-chargers.surge.sh) — three tabs
  from IEC 61851-23, DIN SPEC 70121 and ISO 15118-2: everything that must pass
  before any power flows, energy transfer and shutdown, and where the current
  comes from.
- [How a diesel engine works](https://how-diesel-engines-work.surge.sh) — three
  tabs from Bosch, BERU and DieselNet: the four-stroke cycle, the fuel path and
  how the rail holds its pressure, and what the glow system does on a cold
  start.

## What the page does

Click a node or an edge and the page lights what leads there, then fills a side
panel with the detail and the evidence. A file reference opens in your editor;
the page carries VS Code, Cursor, Windsurf, Zed, Sublime, TextMate, WebStorm and
IntelliJ, and the reader picks from the header.

Several related flows become tabs in one file. Arrow keys walk the graph, `L`
turns the layout, `M` shows the minimap, and the page exports to SVG, PNG or a
tldraw file. No server, no network, one file you can email.

The tldraw export is the only one that is not a picture: it writes the graph
back out as boxes and bound arrows, so the diagram opens in tldraw as something
you can rearrange and annotate rather than trace over.

Inside a chat client's own preview the page is an iframe, and a sandboxed iframe
is not allowed to save a file: the export runs and the download is dropped with
no error. The page hides the export button in any frame it does not own; open
the file in a tab of its own and the button is back.

The build refuses to be quiet about a broken graph. A path that stops without a
terminal, a decision with one way out, an unlabelled decision edge, an edge
pointing at a missing id: each is a fault, printed and exited non-zero. A ref
that misses its file or runs past the end of it is a warning, because a flow may
trace a subject with no local source. The build also measures every flow and
says which one is deep enough to be answering two questions, naming the node to
split at.

## What to trace with it

The question worth a graph is *what can happen next, and why*. Some subjects
that pay off:

- **A protocol you do not own.** A TLS handshake, a WebSocket upgrade and its
  reconnect, a certificate renewal. The RFC is the evidence, so the graph has no
  local refs at all and every node links to the passage that defines it.
- **Dunning.** One failed payment through its retry schedule, grace period and
  downgrade. Same subject as payment authorisation, but stretched over weeks,
  which is what turns it into a state machine.
- **Fallback and recovery.** Provider or model fallback, circuit breakers,
  timeouts. Tag the loop back as `retry` and the page stops walking it, so the
  route to a step does not light the whole cycle.
- **Precedence nobody wrote down.** Middleware short-circuits, route and proxy
  ordering, task dependencies. The declarations are scattered across a dozen
  files and no single file shows the resulting order.
- **Real fan-out.** CI jobs, parallel approvals, service startup requirements.
  `fork` and `join` when every branch runs, `decision` when exactly one does.
- **A machine, not software.** A door lock, an appliance cycle, a safety
  cut-off. Anything where an action changes hidden state, cited from the manual
  or datasheet.
- **Two versions side by side.** Current against proposed, or one tab per user
  role, platform or provider.

Auth is the classic multi-tab subject: first login, authorisation code with
PKCE, request-time session validation, refresh rotation, and revocation, each a
complete flow rather than a fragment of one route.

[`subjects.md`](subjects.md) has the full list, grouped by how the graph behaves,
along with the subjects to send elsewhere. A straight chain wants a list. Actors
talking over time want a sequence diagram. Edge volume wants a Sankey.

## Local development

How to test this skill without waiting for a real tracing session. For linking
the skill into an agent so `/flow` works, see the repo
[README](../../README.md).

### Render the fixtures

`assets/build.py <flow.json> <out.html> <source-root>` is the whole build. Run
it from this directory:

```bash
# Every node and edge kind, once. No refs, so nothing to resolve.
assets/build.py assets/kinds-probe.json /tmp/flow-probe.html .
open /tmp/flow-probe.html

# A real single-flow trace. Its refs point at this repo, hence ../..
assets/build.py assets/example.json /tmp/flow-example.html ../..
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

### Check the checker

The build writes the page even when the graph is broken, and exits 1 so a
problem is not silent. Break a copy to see it:

```bash
sed 's/"kind": "success"/"kind": "step"/' assets/kinds-probe.json > /tmp/bad.json
assets/build.py /tmp/bad.json /tmp/flow-bad.html . ; echo "exit=$?"
```

Expect `path stops, not an end`, exit 1, and the problem repeated in a badge on
the page itself. Ref problems (`ref file missing`, `ref line past end`) are
warnings instead — exit 0 — because a flow may trace a subject with no local
source. Pass the wrong `<source-root>` to see them. A `links` entry with a
`path` is checked the same way.

### Rebuild the page

Bun compiles `src/template.html` and its imports into the committed
`assets/template.html`. Normal flow builds use that file and do not need Bun or
`node_modules`.

```bash
bun install --frozen-lockfile
bun run build
```

Run the kinds probe afterwards.

### End to end

Link the skill (`just link flow` from the repo root), start a fresh session, and
run `/flow` on something small with obvious branches. The skill writes its JSON
to `/tmp/YYYY-MM-DD-flow-<slug>.json`, so that file is there to read and rebuild
by hand afterwards.
