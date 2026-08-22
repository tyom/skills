---
name: flow
description: "Traces evidence-backed branching flows and renders one or more as tabs in an interactive graph."
argument-hint: "<the flow to trace; empty for the current topic>"
disable-model-invocation: true
# Auto-approved while the skill runs. Searches and reads the web, writes one
# temporary JSON file, and opens one temporary HTML file. Build and browser
# checks prompt.
allowed-tools:
  - WebSearch
  - WebFetch
  - Edit(//tmp/*-flow-*.json)
  - Bash(open /tmp/*-flow-*.html)
---

# Flow

Trace a branching flow from evidence and render it as an interactive graph. Every node is a real step and every edge is a real transition. Clicking either highlights the path that leads there and shows its detail, so unsupported detail makes the graph misleading.

The vendored renderer owns layout and style. Write data, never markup. Route an end-to-end explanation to `/explainer`, an interactive mechanism to `/micro-world`, and a code change to `/explain-diff`.

## 1. Set the scope

Use `$ARGUMENTS`; otherwise use the latest subject in the conversation; otherwise use the file open in the IDE.

Settle first whether the subject is **local** or **external**. Local means this checkout holds the code that runs it. External means the behaviour lives elsewhere: a protocol, a standard, a vendor's API, a product's own rules. Search the repo before settling it; a subject the repo merely consumes is external.

Survey names and structure first. Identify candidate flows from workflow files, screens, and entry points — for an external subject, from the sections of its specification — without tracing them yet. If fit or scope is unclear, read [`subjects.md`](subjects.md). It distinguishes useful branching flows from lists, sequence diagrams, and other poor fits.

Continue without asking when there is one clear flow. When there are several, ask one question that names them and recommends a default. Set only what is genuinely open:

- **Flows:** each selected flow becomes a fully traced tab.
- **Granularity:** a subsystem path or a drill-down into one step.
- **Form:** a process flow or a state machine using `state` nodes.

Done when the selected paths, tab boundaries, and exclusions are explicit.

## 2. Trace the evidence

Follow each selected path from every entry through every branch to every exit.

A local flow is traced from the source. Copy each `ref` from tool output that displayed the line, so the path comes from the file rather than from a search command or memory.

An external flow is researched before it is judged. Search for its authoritative definition — the RFC, the specification, the vendor's own documentation — and read that rather than a summary of it. Where the search is wide, send a subagent to hunt the authorities and return their URLs; the reading stays here, because a node cites the passage you read, not a report of it. Trace the branches from what it says, reconcile sources that disagree, and name the reconciliation in `detail`. Cite what you read in `links`: on the flow for its overall authority, on a node for the passage behind that step. An undocumented procedure has one authority left, the user's decision.

Done when:

- every source-backed node has a `path:line` ref;
- every external flow links the sources its branches came from;
- every node without a ref names the supporting decision or rule in `detail`, with the overall authority named in `summary`;
- every decision has one outgoing edge per real outcome;
- every path reaches an `end` or `success` node;
- every `detail` is supported by the evidence.

## 3. Write the JSON

Write only `/tmp/YYYY-MM-DD-flow-<slug>.json`. Dagre computes coordinates and the template owns every style. Read [`assets/example.json`](assets/example.json) if a complete single-flow example would help.

Top-level fields are `title`, `summary`, `nodes`, and `edges`. For multiple tabs, use `title` plus a `flows` array; each flow has its own `title`, `summary`, `nodes`, and `edges`. Node ids are scoped to their flow.

A `summary` or a `detail` may run to more than one paragraph: separate them with a blank line. Keep the first paragraph the one that answers the question.

A flow, a node, and an edge may each carry `links`, the references shown under its detail:

- `{ "label": "RFC 9110", "url": "https://..." }` for anything on the web.
- `{ "label": "state_of()", "path": "link-skills.sh", "line": 18 }` for a file in the source root. `label` is optional and `line` may be omitted. The build turns it into an editor URL, so it opens where the code is read; the paths are checked like refs.

The page carries every opener and the reader picks one from the header, so a file link works whatever they use. The build only chooses which one it starts on: the terminal it is running in, otherwise VS Code. Set the top-level `editor` field to name that starting choice — `vscode`, `cursor`, `windsurf`, `zed`, `sublime`, `textmate`, `webstorm`, `idea`, or `copy` for a page that copies `path:line` instead of opening it.

Nodes:

- `id`: unique within the flow.
- `label`: two to five words.
- `kind`: `start`, `step`, `decision`, `io`, `store`, `end`, `success`, `fork`, `join`, or `state`.
  `end` is any terminal; use `success` for one that completed successfully, so a
  flow with both outcomes does not paint them the same.
- `ref`: `path:line` for source-backed nodes. Shown in the panel, and opened in the editor when the file is there.
- `note`: optional short text visible on the node, such as an invariant or unit.
- `detail`: one or two evidence-backed sentences shown after a click.
- `links`: optional references, as above.

Edges:

- `from` and `to`: node ids.
- `label`: the outcome of every `decision`, or the event in a state machine.
- `kind`: optional `async`, `error`, or `retry`. A loop back to try again needs the `kind`, not just the word as a `label`. The panel walks backwards to find what leads to a step, and only `retry` stops that walk, so an untagged loop lights everything it passes on the way round.
- `detail`: optional evidence-backed explanation shown after a click.
- `links`: optional references, as above.

Use `fork` and `join` together when all branches run and later converge. Use `decision` when exactly one branch runs. Loops and opposite-direction edges are supported.

Done when the JSON contains the traced behaviour with no coordinates, styles, or speculative nodes.

## 4. Build and inspect

Run from this skill's base directory:

```sh
assets/build.sh /tmp/YYYY-MM-DD-flow-<slug>.json /tmp/YYYY-MM-DD-flow-<slug>.html <source-root>
```

`<source-root>` is the directory that refs are relative to, so it is the root the trace came from, not this skill's directory. An external flow resolves no refs, so its root is the working directory. The build writes the page even when checks fail. Fix the JSON and rebuild until the command is silent apart from its output-file summary. Ref warnings must be resolved when local source exists.

Open the generated HTML. Inspect every tab for unsupported detail, collapsed branches, and tabs too thin to justify their own diagram.

Done when the build is clean and the opened page matches the agreed scope. Then ask whether to run the optional full browser check. If they opt in, follow the verify loop in the [`explainer`](../explainer/SKILL.md) skill (§4): decide the browser tool up front and confirm it is available, then check desktop and a narrow viewport. Flow-specific check: click every node and every edge, confirm each highlights its path and fills the panel, and watch the console.
