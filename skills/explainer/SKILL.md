---
name: explainer
description: "Builds a self-contained, interactive HTML explainer for a subject, pitched at its reader through analogies."
argument-hint: "<repo, codebase, spec, PR, API, dataset, architecture, or concept> [--brief] [--reader \"<who they are, what they know>\"]"
disable-model-invocation: true
# No allowed-tools on purpose. The skill reads untrusted repos, and allow rules
# skip auto mode's classifier, so a planted instruction could chain a
# pre-approved Read with a pre-approved clone/fetch to exfiltrate data. Write
# can't be path-scoped. Reads and working-directory edits need no rule anyway.
---

# Explain Visually

Produce a single self-contained HTML file that explains a subject so well the reader can rebuild a mental model of it and explain it back. Beauty serves clarity. Interactivity serves understanding. Explain, don't decorate — teach before you summarize. Every claim is grounded in the real source material.

Write plainly. Short common words, concrete nouns and verbs, one idea per sentence. Keep the technical terms the audience needs; drop the polish. No em-dashes (use a comma, period, colon, or parentheses). No hype, no cliches, no slogan endings.

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

Docs, READMEs, and code comments are claims, not facts. Confirm each one you use against the code it describes. Where they disagree, the code wins, and the drift becomes a trap (step 2).

Define jargon before using it; if a term needs heavy domain context, replace it with plain language or teach it visually.

### 1b. Profile the reader

Every analogy and every skipped explanation depends on who reads the page, so settle the **reader profile** before outlining. Decide who the reader is from the request:

- **Named reader**: `--reader "..."` or a description in the request ("for a backend dev who knows Postgres"). Use it as given.
- **Operator**: the person running the skill is the reader ("explain this to me", "get me up to speed", no other audience named). Infer the profile from the evidence below.
- **Unknown**: a team, a new joiner, or anyone unnamed. Use the **general profile**: technically literate, comfortable with programming, HTTP, databases, git, and the command line, with no knowledge of this subject's domain or stack.

For the operator, read only two sources:

1. **The conversation.** Terms they use correctly, what they ask about, and what they say they know. This wins over git.
2. **Git history in the subject repo and the current working repo**, nothing else on the machine. Filter by `git config user.email` and look at the files they changed in the last 12 months: `git log --author="<email>" --since=12.months --name-only --pretty=format: | sort | uniq -c | sort -rn | head -50`. File types and the most-changed directories show their stack, which is where analogies can come from. Git never shows what they understand: commits go stale, get forgotten, or were written by an agent under their name. Treat a part of the subject as known only when the conversation says so, even when git shows deep work on the subject itself.

When this evidence is thin, use the general profile. Before building, tell the operator in one chat line what the profile came from ("Profile from: conversation + git log in <repo>"). Keep that line off the page.

Write the profile as 3 to 5 lines: domains and tools the reader knows well, and gaps likely to matter for this subject. "Knows" lines name domains from outside the subject; the subject's own libraries and services belong in the hero's stack line, since an analogy drawn from a part of the subject teaches nothing about it. The step is done when every "knows" line names something concrete enough to draw an analogy from, and every gap line names a part of this subject.

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

Across the piece, show at least one **transformation** — before/after, problem/solution, vague/clear, hidden/visible, or input/output. Contrast is what makes an idea land.

**Core concepts.** Name the 3 to 7 concepts the subject rests on and give each one fixed term. Use that term everywhere, in prose, diagrams, and demos.

**Concept cards.** For each core concept, pick an analogy from a domain in the reader profile. Match on _relations_, not looks: "A waits for B the way X waits for Y" teaches; "A is shaped like X" does not. Each card is the fixed term plus two sentences:

- **Like** _X_: the relation that carries over.
- **Unlike** _X_: where a reader reasoning from the analogy would predict wrong.

The Unlike line is mandatory, and it names a prediction the analogy itself gets wrong: not an extra fact about the concept, and not a contrast with some other design. An analogy with no stated limit plants the misconception it was meant to prevent. When nothing in the profile maps cleanly, the card holds one plain definition instead; a strained analogy costs more than a plain definition. With the general profile, draw from widely shared computing and everyday ideas (queues, caches, post, receipts, libraries).

Render the cards as a grid of short cards, not a table. When the page has an architecture diagram, a node's detail panel shows the same card for its concept, so the map and the concepts read as one.

**Traps.** List 2 to 4 places where a reader with this profile would guess wrong: "You'd assume X. Actually Y, because Z." Each trap cites its evidence (a bug fix, a code comment, an issue, a test). Cut any trap you cannot cite.

**Proxy questions.** Write 6 to 8 questions a reader who holds the model could answer and one who doesn't could not: "What happens if...", "Where would you add...", "Why does ... instead of ...". At least half ask why or what happens if; at most a quarter hinge on a single constant or count, so recalling a number table can't pass the check. Answer each from the source with a `file:line` or URL. Write them now, before the page exists, so the page can't shape them. Step 4 uses them.

**Brief mode.** When the request carries `--brief` or asks for onboarding, a quick overview, or getting up to speed, the teaching path is fixed as layers, each complete if the reader stops there:

1. **Gist**: what it is and why it exists, in the reader's terms. At most 2 sentences.
2. **One diagram**: core concepts and their relations, labelled with the fixed terms.
3. **Concept cards.**
4. **One walkthrough**: the main flow as at most 6 steps, or one step-through demo.
5. **Traps.**
6. **Go deeper**: the remaining content dimensions and source links per concept.

Layers 1 to 3 form the first screen and hold at most 150 words of prose, card text included. Everything past layer 5 is optional reading.

### 3. Build the HTML

One self-contained `.html` file that opens in any browser with no build step. Start it with `<meta charset="utf-8">` as the first line of `<head>`, before the `<title>`: any non-ASCII glyph (curly quotes, arrows, accents, math symbols) decodes as mojibake (`â€"`) without it, when a browser or a static server sends no charset header. Put it in at generation time, never as an after-the-fact patch. Inline the JS. **Prefer Tailwind via CDN for layout, spacing, typography, colour, and responsive behaviour** — reach for utility classes first. Use hand-rolled CSS (in a `<style>` block) only for what Tailwind handles poorly: font imports and theme tokens, SVG/diagram styling, keyframe animations, syntax-highlighting classes, complex selectors or pseudo-elements, and fine refinements. Keep the two consistent — drive custom CSS from the same colour/spacing tokens Tailwind uses. The CDN script and a webfont are the only external assets allowed; nothing else the file can't live without.

Structure:

- A **hero** as the opening screen (see below). In brief mode the gist is the hero's identity sentence.
- A sticky table of contents / section nav for anything longer than a couple of screens, so the artifact is navigable, not just scrollable.
- One clear idea per section, with a simple concrete title (not a slogan); split into more sections before cramming one.
- Slide-like sections on desktop; readable stacked sections on mobile.

#### The hero

Every explainer opens with the same recognisable pattern: it sets the subject and earns trust before any prose. Build it from these stacked parts, top to bottom:

1. **Eyebrow chips** — a row of 1–3 small pill/tag chips for the categorical identity: subject kind + the most load-bearing classifiers. For code: `python package`, `v0.1.0 · MIT`. For non-code: the equivalent (e.g. `RFC · proposed standard`, `REST API · v2`, `concept`). Keep them mono and muted.
2. **The name**, as a restrained display title (see Style).
3. **A one-to-two-sentence plain-language identity** — what it is and who it's for, in prose, with a key identifier or two highlighted inline (mono/accent). No marketing.
4. **A meta line** (small, muted, mono) for the provenance facts: entry point or package name, version, source URL or paths, commit and date.
5. **A stack line** (small, muted, mono), when the subject is software built on other parts: the major pieces grouped by layer, e.g. `FE React + TS · state Zustand · storage Dexie/IndexedDB · AI Vercel AI SDK`. Take it from the manifest and imports. Layers only, not the full dependency list; that goes in Dependencies & footprint.
6. **An assumptions line**: "Written for someone who knows: ...", listing the profile's "knows" domains at the layer level ("frontend React and TypeScript, browser storage, LLM APIs"), so a reader whose background differs sees why an analogy missed. Domains only, never the evidence behind them.

Every value in the hero must be a real, verified fact from the source, never a guess or a placeholder.

Use **diagrams** to show structure and flow: architecture layers, sequence/lifecycle, state machines, data shapes. Diagram text must be centred, aligned, and fully contained inside its shapes — use explicit font sizes, `text-anchor`, `dominant-baseline`, and padding so labels never drift, clip, or touch borders. Never reach for `overflow: hidden` on a content container to hide a layout problem instead of fixing it.

#### Make it interactive where it earns understanding

This is what separates a beautiful read from a thing the reader actually _gets_. Wherever a mechanism can be operated rather than described, let the reader operate it. Build the interactivity as a faithful, self-contained reimplementation of the real logic (a small JS port), and say so. Match the patterns to the subject:

- **Transformer / encoder / parser** → an input the reader picks or edits, showing the exact output the real code would produce. Annotate the rules being applied.
- **Reducer / state machine / algorithm** → a **navigable step-through** built to the higher bar in [`step-throughs.md`](step-throughs.md) (pure fold, both-direction nav, keyboard, diff highlight, semantic render, scenario selector) — the transitions are the lesson, not the final state.
- **Architecture** → clickable layers/nodes that expand to reveal each part's job, public surface, source file, and concept card.
- **API / protocol** → pick an endpoint or message and see the request/response or wire bytes; toggle options and watch the payload change.
- **Data model** → toggle between fields, walk a record through its lifecycle states, or filter a schema.
- **Config / flags** → flip options and render the resulting effective behaviour.

Keep demos honest: port the real rules, use realistic sample data drawn from the source, and don't fake outputs. Keep the port in its own `.js` file while building, and test it in Node against real outputs of the subject (its binary, test fixtures, or documented examples) before inlining it into the page. When the real inputs are live observations the source can't supply (page timings, network responses), make up illustrative inputs and label them as illustrative on the page. Provide a few curated scenarios rather than a blank canvas — guided beats open-ended for teaching. Every interactive control needs a visible, discoverable affordance (a labelled button, a select, a hover hint).

Interactivity is a strong default, not a mandate for trivial subjects. A two-paragraph concept may need none. Anything with a transformation, a state machine, or composable parts almost always benefits.

#### Provenance

End with a short note on what the artifact was generated from (which files/docs were read) and that any live demos are faithful ports of the real logic. This earns the reader's trust and dates the explanation.

### 4. Verify

Open the file in a real browser and check it before finishing — drive it directly, don't offload verification to another skill. **Decide the verification tool up front and confirm it's actually available before calling it** — don't trial-and-error through broken tool calls and error recovery. Use the first that's present:

1. **Chrome DevTools MCP** (or any other connected browser-automation MCP) — preferred. Check it's connected before reaching for anything else.
2. **System Chrome/Chromium, headless from the CLI** — confirm the binary first (`command -v`, or the known app path like `/Applications/Google Chrome.app/...`), then drive it with `--screenshot` / `--dump-dom`. Do **not** hand-wire Playwright or resolve npm module paths by hand; that `ERR_MODULE_NOT_FOUND` / CJS-vs-ESM rabbit hole burns tokens for nothing. To click controls, run a test copy of the page with a script appended that drives every control and writes its results into a `<pre>`, then read them from `--dump-dom`. Headless Chrome lays out no narrower than 500px, so for mobile load the page in a 390px-wide `<iframe>` inside a wrapper page.

If neither is available, leave the file for the user to open and say so, rather than thrashing.

- Read the console first. Any uncaught error fails the check, and so does a demo that renders empty on load.
- Check desktop and a narrow mobile viewport.
- Click every interactive control and confirm it behaves and updates correctly.
- For a step-through demo: run the verify checklist in [`step-throughs.md`](step-throughs.md) (both-direction parity, diff highlight, keyboard, safe endpoints).
- Fix overflow, overlap, clipped or drifting text, unreadable scale, cramped spacing, broken responsive layout, and any dead control.

#### Proxy reader check

The browser pass proves the page renders. The **proxy reader** tests whether it teaches, from what a person sees. First save the page's **visible text**, meaning what a person sees on load, with hidden and collapsed content left out. With headless Chrome, run a test copy of the page with a script appended that writes `document.body.innerText` into a `<pre>`, read it from `--dump-dom`, and save it next to the page. `innerText` skips hidden elements and closed `<details>` bodies, which tag stripping keeps. Use headless Chrome even when a browser MCP is connected, since MCP file writes may be limited to workspace roots. Without Chrome, strip the HTML file's tags after dropping `<script>`, `<style>`, `<template>`, elements marked `hidden` or `aria-hidden="true"`, and closed `<details>` apart from their `<summary>`. The dump holds each demo's initial state only, so a fact the questions need must also be in prose or a visible label.

Dispatch a fresh subagent with:

- the reader profile, as the persona it answers from
- the path to the visible-text file, and the instruction to read only that file: no HTML, no source, no web, no other files
- the proxy questions from step 2, without their answers

Ask it to answer each question in one or two sentences, and to name the page section it relied on. Grade each answer against the source-derived answer as right, partial, or wrong.

Trace every miss to a cause and fix that cause on the page: a missing layer, an unclear term, or an analogy that led the reader astray (tighten the Unlike line or drop the analogy). Regenerate the visible text after each fix. Re-run with a fresh subagent, up to two revision rounds. The check passes when at least 6 of 8 answers are right (or the same share of fewer questions) and no miss traces to an analogy. Report the final score and any remaining misses to the user.

The artifact fails if the proxy reader check does not pass, if a demo is broken, or if any text overlaps, clips, or overflows.

## Style

- Choose a visual register that fits the subject. A codebase or protocol reads well in a focused **IDE-dark, mono-forward** theme; a product concept can take a warmer editorial palette. Commit to one coherent system of fonts, colour tokens, and spacing rather than mixing registers — express it through a small Tailwind config (`tailwind.config` inline, or CSS variables the utilities reference) so the whole document shares one palette.
- Use a display face for headings and a monospace face for code, identifiers, and wire/data. Keep code visually distinct from prose.
- Think in grids, line height, margins, and hierarchy. Whitespace is structure.
- Keep hero titles restrained; avoid the largest sizes unless the title is very short.
- On mobile: natural-height sections, single-column grids, compact display type, readable body text, diagrams that fit without dominating. A mobile hero should feel native, not like a cropped desktop slide.
- Syntax-highlight code by hand with custom CSS classes (comment / keyword / string / function / literal) so snippets read like an editor, not a blob.
