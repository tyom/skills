---
name: flow
description: "Traces evidence-backed decisions, state changes, and branching processes as interactive graph tabs."
argument-hint: "<the flow to trace; empty for the current topic>"
disable-model-invocation: true
# Auto-approved while the skill runs. Searches and reads the web, writes one
# temporary JSON file, and opens one temporary HTML file. Build and browser
# checks prompt.
allowed-tools:
  - WebSearch
  - WebFetch
  - Write(//tmp/*-flow-*.json)
  - Edit(//tmp/*-flow-*.json)
  - Bash(open /tmp/*-flow-*.html)
---

# Flow

Trace a flow from evidence and render it as an interactive graph. Every node is a real step or state and every edge is a real transition. Clicking either highlights what leads there and shows its detail, so unsupported detail makes the graph misleading.

The vendored renderer owns layout and style. Write data, never markup. Route an end-to-end explanation to `/explainer`, an interactive mechanism to `/micro-world`, and a code change to `/explain-diff`.

## 1. Set the scope

Use `$ARGUMENTS`; otherwise use the latest subject in the conversation; otherwise use the file open in the IDE.

Survey names and structure before tracing. Search the repo even when the subject sounds external. Identify candidate flows from workflow files, screens, entry points, specifications, manuals, or policies.

Read [`subjects.md`](subjects.md) when fit or tab boundaries are unclear. It groups good subjects by graph behaviour and routes poor fits elsewhere.

Continue without asking when there is one clear flow. When there are several, ask one question that names them and recommends a default. Set only what is genuinely open:

- **Flows:** each selected flow becomes a fully traced tab.
- **Granularity:** a subsystem path or a drill-down into one step.
- **Form:** a process flow or a state machine using `state` nodes.

Done when the question each tab answers, its entry and terminal states, its granularity, and its exclusions are explicit.

## 2. Trace the evidence

Follow every selected path from each entry through each branch to a terminal.

Use the strongest evidence available for each node. A flow may mix all three:

- **Local source.** Read the implementation and record the exact `path:line` in `ref`.
- **External authority.** Read the specification, standard, vendor documentation, manual, or policy and cite the supporting passage in `links`.
- **User decision.** For an undocumented procedure, name the supporting decision or rule in `detail` and its owner in `summary`.

Research external behaviour before judging it. Prefer the authority that defines the behaviour over summaries. Reconcile disagreements in `detail`. Put the overall authority on the flow and a passage-specific link on a node or edge when that passage supports only one transition.

Done when:

- every node names its local ref, external authority, or supporting decision;
- every decision has one outgoing edge per real outcome;
- every path reaches an `end` or `success` node;
- every `detail` is supported by the evidence.

## 3. Write the JSON

Write only `/tmp/YYYY-MM-DD-flow-<slug>.json`. Dagre computes coordinates and the template owns every style. Read [`assets/example.json`](assets/example.json) for a complete single-flow example. Read [`assets/kinds-probe.json`](assets/kinds-probe.json) when multiple entries, parallel branches, reconvergence, or loops make the topology unclear.

Top-level fields are `title`, `summary`, `nodes`, and `edges`. For multiple tabs, use `title` plus a `flows` array. Each flow has its own `title`, `summary`, `nodes`, and `edges`. Node ids are scoped to their flow.

A `summary` or a `detail` may run to more than one paragraph. Separate them with a blank line. Put the answer in the first paragraph.

A flow, a node, and an edge may each carry `links`, the references shown under its detail:

- `{ "label": "RFC 9110", "url": "https://..." }` for anything on the web.
- `{ "label": "state_of()", "path": "link-skills.sh", "line": 18 }` for a file in the source root. `label` is optional and `line` may be omitted. The build turns it into an editor URL, so it opens where the code is read; the paths are checked like refs.

The page carries every opener and the reader picks one from the header, so a file link works whatever they use. The build only chooses which one it starts on: the terminal it is running in, otherwise VS Code. Set the top-level `editor` field to `vscode`, `cursor`, `windsurf`, `zed`, `sublime`, `textmate`, `webstorm`, `idea`, or `copy`. The last option copies `path:line` instead of opening it.

Nodes:

- `id`: unique within the flow.
- `label`: two to five words.
- `kind`: `start`, `step`, `decision`, `io`, `store`, `end`, `success`, `fork`, `join`, or `state`.
  `end` is any terminal. Use `success` for one that completed successfully, so a
  flow with both outcomes does not paint them the same.
- `level`: optional `h1` or `h2`. Draws the node larger and heavier so the graph
  reads as phases rather than one flat cloud. Not available on `fork` or `join`.
- `ref`: `path:line` for source-backed nodes. Shown in the panel, and opened in the editor when the file is there.
- `note`: optional short text visible on the node, such as an invariant or unit.
- `detail`: one or two evidence-backed sentences shown after a click.
- `links`: optional references, as above.

Edges:

- `from` and `to`: node ids.
- `label`: the outcome of every `decision`, or the event in a state machine.
- `kind`: optional `async`, `error`, or `retry`. Tag a loop back to try again as `retry`. The panel walks backwards to find what leads to a step, and only `retry` stops that walk, so an untagged loop lights everything it passes on the way round.
- `detail`: optional evidence-backed explanation shown after a click.
- `links`: optional references, as above.

A level is a reading aid, not evidence, and it works only by contrast. Most
flows use none. Reach for one when a long trace has a few genuine phases a
reader should land on before the detail: the two or three nodes they would name
if asked what the flow does, `h1` for those and `h2` for what anchors a branch
under them. A level on a third of the nodes is the flat cloud again in larger
type, and the build says so.

Use `fork` and `join` together when all branches run and later converge. Use `decision` when exactly one branch runs. Loops and opposite-direction edges are supported.

Done when the JSON contains the traced behaviour with no coordinates, styles, or speculative nodes.

## 4. Build and inspect

Run from this skill's base directory:

```sh
assets/build.py /tmp/YYYY-MM-DD-flow-<slug>.json /tmp/YYYY-MM-DD-flow-<slug>.html <source-root>
```

`<source-root>` is the common root that local refs are relative to, not this skill's directory. Use the working directory when the flow has no local refs. The build writes the page even when checks fail.

A problem is a fault in the graph and exits non-zero, so fix the JSON and run again. A warning is not, and each one is either resolved or explained in the reply. Resolve every ref warning when the referenced source exists.

The build measures each flow rather than the window it opens in, and prints three figures for every one. V(G) counts the routes through the flow. The rank count is its longest path. The third is the shortest window that opens the flow whole, which says what the reader will see and decides nothing; it is a height alone, so a wide flow can still run off the side. A flow the build reports as deep is usually answering two questions. The build names the node every path already crosses and the depth of each half. Split there, and the seam is found rather than invented. It also names the nodes on that path that take one edge in, one out, and carry no label, because each costs a rank and earns none. Branching is a property of the subject and no split reduces it, so a high V(G) alone is reported and left alone.

When the build reports a flow as deep, ask before changing anything. Nobody can judge the depth of a subject before it has been traced, so this is the first moment the answer exists. Name the numbers it printed, the seam it found and the depth of each half, and offer four choices: split at that seam, narrow the question, make one route the subject, or keep the flow whole and let it open cropped. Recommend the split when the two halves are close in depth. Ask this once, only about depth, and not at all when no flow is reported as deep. Keeping the flow whole is a real answer rather than a concession, so take it as given and change nothing about the trace.

Open the generated HTML. Inspect every tab for unsupported detail, collapsed branches, and tabs too thin to justify their own diagram. Unsupported detail is the fault worth another pass. A large graph is incomplete, but a detail the trace does not support is presented as fact and read as one.

The fit holds a zoom floor rather than shrinking without limit, so a flow bigger than the window opens cropped. That is a fault when the reader wanted an overview and expected when they asked for detail. When they asked for detail, say in the summary that the page opens cropped, and that L turns the layout and fits the whole graph with it, M shows the minimap, and the arrow keys walk it. Dropping a level does not help either way, because a level changes a node's width, not the flow's depth.

Done when every problem is fixed, every warning is resolved or explained, every tab answers its scoped question, and the evidence shown matches the trace. Then ask whether to run the optional full browser check. If they opt in, follow the verify loop in the [`explainer`](../explainer/SKILL.md) skill, section 4. Decide the browser tool up front and confirm it is available, then check desktop and a narrow viewport. Click every node and edge, confirm each highlights its route, every branch into a join, and every entry behind a convergence. Check that the panel fills, walk a branch with the arrow keys, and watch the console.
