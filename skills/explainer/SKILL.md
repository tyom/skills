---
name: explainer
description: "Builds a self-contained, interactive HTML explainer for a subject. Use when the user wants to explain, visualise, or document something as a standalone HTML artifact."
argument-hint: "<repo, codebase, spec, PR, API, dataset, architecture, or concept>"
# Auto-approved while the skill runs, so it doesn't prompt on every step.
# Scoped to safe file ops + known-safe Bash — deliberately NOT blanket Bash,
# since the skill clones and inspects untrusted repos. Browser-verify and
# anything outside this list still prompt (or run in acceptEdits/auto mode).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash(git clone:*)
  - Bash(ungit:*)
  - Bash(mkdir:*)
  - Bash(find:*)
  - Bash(ls:*)
  - Bash(wc:*)
---

# Explain Visually

Produce a single self-contained HTML file that explains a subject so well the reader can rebuild a mental model of it and explain it back. Beauty serves clarity. Interactivity serves understanding. Explain, don't decorate — teach before you summarize. Every claim is grounded in the real source material.

The subject is arbitrary: a code repo, a library, a protocol or spec, a pull request, an HTTP API, a data model, a config format, a build pipeline, an algorithm, or a pure concept. The skill is technology-agnostic — adapt the sections and demos to whatever the subject actually is.

## Workflow

### 1. Investigate the source

Read the actual material before writing a word of explanation. Do not explain from priors or from the name alone.

When the argument is a **remote GitHub repo** (a URL or `owner/repo`, not a local path), get it onto disk first: `git clone --depth 1` into a tmp directory and explore there. If the repo is large, don't clone the whole thing — use the `ungit` command (when available) to pull only the specific files or directories you need as LLM-friendly context. When the URL already points at a path _within_ the repo (a subdirectory or file), the subject is that part, not the whole repo — definitely use `ungit` to fetch just that path into tmp rather than cloning everything.

- For a **repo/codebase**: read the README, the manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, etc.), the entry points, the module/folder layout, and the public surface (exported functions, types, routes, CLI). Note the language, the dependency count and what they are, the rough size, the version, the licence.
- For a **spec/protocol/API**: read the document; extract the message/endpoint vocabulary, required vs optional fields, state machines, and error cases.
- For a **PR/change**: read the diff and the surrounding code it touches; identify what changed, why, and the blast radius.
- For a **concept**: gather the canonical definition, the failure mode it addresses, and at least one concrete worked example.

Capture concrete, checkable facts as you go — names, paths, signatures, commands, versions, counts, field types, default values. These are the backbone of trust; positioning language is not.

Define the audience. Default to a **smart reader who is new to this specific thing** but technically literate. Define jargon before using it; if a term needs heavy domain context, replace it with plain language or teach it visually.

### 2. Outline the teaching path

Write the path before building. Decide:

- what the reader must be able to explain back when done
- the order that gets them there with the least backtracking
- which ideas need a diagram, and which need a **live interactive demo**
- what to omit (restraint is a feature)
- which concrete source facts support each section

**Content dimensions to cover** (include the ones that apply; skip what's irrelevant rather than padding):

- **What it is** — the one-sentence identity, then what it _is not_ (the scope boundary). A clear "is / is not" pairing prevents the most common misunderstanding.
- **Why it exists** — the problem or the old painful way, stated concretely.
- **The mental model** — the one reusable idea the reader keeps.
- **Architecture** — when the subject has structure: the parts, their responsibilities, how they connect, and the direction data/control flows. Name the real files/modules/services.
- **Dependencies & footprint** — what it stands on (runtimes, libraries, services), how many, and the version/size/licence facts that set expectations.
- **Data model** — the core types/entities/schemas/messages, their fields, and any state machines or lifecycles they walk. Show the real shapes.
- **A concrete example** — one real, end-to-end path through the subject taken from the source.
- **Lifecycle / end-to-end flow** — follow one unit (a request, a record, a build, a turn) from entry to exit.
- **What to do next** — the action the reader takes after understanding.

Not every subject has all of these. A pure concept may have no dependencies; an API may have no architecture diagram but a rich data model. Choose deliberately.

Across the piece, show at least one **transformation** — before/after, problem/solution, vague/clear, hidden/visible, or input/output. Contrast is what makes an idea land.

### 3. Build the HTML

One self-contained `.html` file that opens in any browser with no build step. Inline the JS. **Prefer Tailwind via CDN for layout, spacing, typography, colour, and responsive behaviour** — reach for utility classes first. Use hand-rolled CSS (in a `<style>` block) only for what Tailwind handles poorly: font imports and theme tokens, SVG/diagram styling, keyframe animations, syntax-highlighting classes, complex selectors or pseudo-elements, and fine refinements. Keep the two consistent — drive custom CSS from the same colour/spacing tokens Tailwind uses. The CDN script and a webfont are the only external assets allowed; nothing else the file can't live without.

Structure:

- A **hero fact sheet** as the opening screen (always — see below).
- A sticky table of contents / section nav for anything longer than a couple of screens, so the artifact is navigable, not just scrollable.
- One clear idea per section, with a simple concrete title (not a slogan); split into more sections before cramming one.
- Slide-like sections on desktop; readable stacked sections on mobile.

#### The hero fact sheet

Every explainer opens with the same recognisable pattern — it sets the subject and earns trust before any prose. Build it from these stacked parts, top to bottom:

1. **Eyebrow chips** — a row of 1–3 small pill/tag chips for the categorical identity: subject kind + the most load-bearing classifiers. For code: `python package`, `v0.1.0 · MIT`. For non-code: the equivalent (e.g. `RFC · proposed standard`, `REST API · v2`, `concept`). Keep them mono and muted.
2. **The name**, as a restrained display title (`md:text-6xl`/`7xl`).
3. **A one-to-two-sentence plain-language identity** — what it is and who it's for, in prose, with a key identifier or two highlighted inline (mono/accent). No marketing.
4. **The grounding-fact grid** — a single horizontal row of **4–6 cells** (responsive: wrap to 2–3 columns on mobile), each a large coloured number/value over a small muted label. These are the checkable facts that set expectations at a glance. Pick the ones that actually matter for the subject:
   - code/repo: dependency count, public-surface or type count, file/module count, lines of code, test count, language/runtime version, licence.
   - spec/protocol: message/endpoint count, required-field count, version, status, error-code count.
   - API: endpoint count, auth model, rate limit, version, response format.
   - dataset: row/record count, column/field count, size on disk, format, licence.
   - concept: a small number of defining quantities or the canonical "N parts / N rules / N states."
5. **A meta line** directly under the grid (small, muted, mono) for the remaining provenance-ish facts that don't deserve a cell: package name, author/maintainer, optional extras, source URL, commit/date.

Every value in the fact sheet must be a real, verified fact from the source — never a guess or a placeholder. If you can't verify a count, either compute it or leave that cell out; do not pad the grid to hit six.

Use **diagrams** to show structure and flow: architecture layers, sequence/lifecycle, state machines, data shapes. Diagram text must be centred, aligned, and fully contained inside its shapes — use explicit font sizes, `text-anchor`, `dominant-baseline`, and padding so labels never drift, clip, or touch borders. Never reach for `overflow: hidden` on a content container to hide a layout problem instead of fixing it.

#### Make it interactive where it earns understanding

This is what separates a beautiful read from a thing the reader actually _gets_. Wherever a mechanism can be operated rather than described, let the reader operate it. Build the interactivity as a faithful, self-contained reimplementation of the real logic (a small JS port), and say so. Match the patterns to the subject:

- **Transformer / encoder / parser** → an input the reader picks or edits, showing the exact output the real code would produce. Annotate the rules being applied.
- **Reducer / state machine / algorithm** → a **navigable step-through** built to the higher bar in [`step-throughs.md`](step-throughs.md) (pure fold, both-direction nav, keyboard, diff highlight, semantic render, scenario selector) — the transitions are the lesson, not the final state.
- **Architecture** → clickable layers/nodes that expand to reveal each part's job, public surface, and source file.
- **API / protocol** → pick an endpoint or message and see the request/response or wire bytes; toggle options and watch the payload change.
- **Data model** → toggle between fields, walk a record through its lifecycle states, or filter a schema.
- **Config / flags** → flip options and render the resulting effective behaviour.

Keep demos honest: port the real rules, use realistic sample data drawn from the source, and don't fake outputs. Provide a few curated scenarios rather than a blank canvas — guided beats open-ended for teaching. Every interactive control needs a visible, discoverable affordance (a labelled button, a select, a hover hint).

Interactivity is a strong default, not a mandate for trivial subjects. A two-paragraph concept may need none. Anything with a transformation, a state machine, or composable parts almost always benefits.

#### Provenance

End with a short note on what the artifact was generated from (which files/docs were read) and that any live demos are faithful ports of the real logic. This earns the reader's trust and dates the explanation.

### 4. Verify

Open the file in a real browser and check it before finishing — drive it directly, don't offload verification to another skill. **Decide the verification tool up front and confirm it's actually available before calling it** — don't trial-and-error through broken tool calls and error recovery. Use the first that's present:

1. **Chrome DevTools MCP** (or any other connected browser-automation MCP) — preferred. Check it's connected before reaching for anything else.
2. **System Chrome/Chromium, headless from the CLI** — confirm the binary first (`command -v`, or the known app path like `/Applications/Google Chrome.app/...`), then drive it with `--screenshot` / `--dump-dom`. Do **not** hand-wire Playwright or resolve npm module paths by hand; that `ERR_MODULE_NOT_FOUND` / CJS-vs-ESM rabbit hole burns tokens for nothing.

If neither is available, leave the file for the user to open and say so, rather than thrashing.

- Check desktop and a narrow mobile viewport.
- Click every interactive control and confirm it behaves and updates correctly.
- For a step-through demo: run the verify checklist in [`step-throughs.md`](step-throughs.md) (both-direction parity, diff highlight, keyboard, safe endpoints).
- Fix overflow, overlap, clipped or drifting text, unreadable scale, cramped spacing, broken responsive layout, and any dead control.

The artifact fails if the reader cannot explain the subject back, if a demo is broken, or if any text overlaps, clips, or overflows.

## Style

- Choose a visual register that fits the subject. A codebase or protocol reads well in a focused **IDE-dark, mono-forward** theme; a product concept can take a warmer editorial palette. Commit to one coherent system of fonts, colour tokens, and spacing rather than mixing registers — express it through a small Tailwind config (`tailwind.config` inline, or CSS variables the utilities reference) so the whole document shares one palette.
- Use a display face for headings and a monospace face for code, identifiers, and wire/data. Keep code visually distinct from prose.
- Think in grids, line height, margins, and hierarchy. Whitespace is structure.
- Keep hero titles restrained; avoid the largest sizes unless the title is very short.
- On mobile: natural-height sections, single-column grids, compact display type, readable body text, diagrams that fit without dominating. A mobile hero should feel native, not like a cropped desktop slide.
- Syntax-highlight code by hand with custom CSS classes (comment / keyword / string / function / literal) so snippets read like an editor, not a blob.
