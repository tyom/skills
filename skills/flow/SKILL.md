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

Use `fork` and `join` together when all branches run and later converge. Use `decision` when exactly one branch runs. Loops and opposite-direction edges are supported.

Done when the JSON contains the traced behaviour with no coordinates, styles, or speculative nodes.

## 4. Build and inspect

Run from this skill's base directory:

```sh
assets/build.sh /tmp/YYYY-MM-DD-flow-<slug>.json /tmp/YYYY-MM-DD-flow-<slug>.html <source-root>
```

`<source-root>` is the common root that local refs are relative to, not this skill's directory. Use the working directory when the flow has no local refs. The build writes the page even when checks fail. Fix the JSON and rebuild until the command is silent apart from its output-file summary. Resolve every ref warning when the referenced source exists.

Open the generated HTML. Inspect every tab for unsupported detail, collapsed branches, and tabs too thin to justify their own diagram. Keep the initial view readable. If fitting the whole graph makes labels or targets too small, narrow the question, split independent flows into tabs, or make one route the subject. A shrunken overview is not complete.

Done when the build is clean, every tab answers its scoped question, the initial view is readable, and the evidence shown matches the trace. Then ask whether to run the optional full browser check. If they opt in, follow the verify loop in the [`explainer`](../explainer/SKILL.md) skill, section 4. Decide the browser tool up front and confirm it is available, then check desktop and a narrow viewport. Click every node and edge, confirm each highlights its route, every branch into a join, and every entry behind a convergence. Check that the panel fills, walk a branch with the arrow keys, and watch the console.
