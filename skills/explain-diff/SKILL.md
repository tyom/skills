---
name: explain-diff
description: "Teaches a code change — a local diff, branch, commit range, or GitHub PR — as a self-contained interactive HTML page. Use when the user asks to explain, walk through, or understand a diff, PR, or commit rather than just summarize it."
argument-hint: "<PR url/number, branch, commit range, or nothing for the working diff>"
# Auto-approved while the skill runs, so it doesn't prompt on every step.
# Scoped to safe read-only git/gh inspection + file ops — deliberately NOT
# blanket Bash. Browser-verify and anything outside this list still prompt.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git show:*)
  - Bash(git merge-base:*)
  - Bash(gh pr view:*)
  - Bash(gh pr diff:*)
  - Bash(mkdir:*)
  - Bash(command -v:*)
  - Bash(open:*)
---

# Explain a Diff

Produce a single self-contained HTML page that teaches a code change so well the reader can explain it back: what the world looked like **before**, the **intuition** of the change, a walkthrough of the **code**, and a **quiz** to prove it landed. Ground every claim in the real diff and the surrounding code — never explain from the diff alone or from priors.

## 1. Get the diff

Read the argument to pick the source, then capture the full patch **and** its metadata (title, description, discussion — the _why_):

- **GitHub PR** (URL or number): `gh pr diff <n>` for the patch, `gh pr view <n>` for the title, body, and comments.
- **Local branch**: `git diff <base>...<branch>` (three-dot, against the merge-base).
- **Commit range / single commit**: `git diff A..B`, or `git show <sha>`.
- **Working tree** (default when the argument is empty): `git diff` and `git diff --staged`, against the base branch.

Completion: you hold the complete patch and know the base and head.

## 2. Explore the surrounding code

The diff shows what changed, not the system it changed. Read the touched files and their neighbours — callers, types, config, tests — until you can describe the machinery **as it was before this change**, not just the added and removed lines. Capture concrete, checkable facts: names, paths, signatures, before/after behaviour.

Completion: you can explain the relevant existing system without referring to the diff.

## 3. Build the page

One self-contained `.html` file, one long scrolling page with section headers, no top-level tabs. Navigation is a **sticky sidebar with two levels**: one link per section and one per subsection (every `h3` gets an anchor and a nav entry), so the reader can jump straight to "the gate function" or "a worked example", not just to "Code". On narrow viewports the sidebar collapses to a plain top strip; never let it overlap content.

Write plainly, for a developer audience. Short common words, concrete nouns and verbs, one idea per sentence. Keep the technical terms a developer needs; drop the polish. No em-dashes (use a comma, period, colon, or parentheses). No hype, no cliches, no slogan endings.

Save it **outside the code repo** with a filename starting with today's date in `YYYY-MM-DD-` form, so the files stay time-sorted and out of version control — e.g. `/tmp/2026-01-12-explanation-<slug>.html`.

The four sections, in order:

- **Background** — the existing system this change touches, from step 2. The reader's prior knowledge is unknown, so give a _deep_ background for beginners (say up front it can be skipped by the familiar), then a _narrow_ background aimed straight at what the change affects.
- **Intuition** — the essence of the change, not the full detail. Carry it on concrete examples with toy data and lean on diagrams to make it land.
- **Code** — a high-level walkthrough of the changes, grouped and ordered so they build on each other (by concern, not necessarily file-by-file).
- **Quiz** — five interactive multiple-choice questions, medium difficulty: hard enough that answering needs real understanding of the change, but not gotchas. Clicking an option reveals whether it was right and gives feedback.

Craft rules:

- Start the file with `<meta charset="utf-8">` as the first line of `<head>`, before the `<title>`. Any non-ASCII glyph (curly quotes, arrows, accents, math symbols) decodes as mojibake (`â€"`) without it, when a browser or a plain static server sends no charset. Put it in at generation time, never as an after-the-fact patch.
- Inline all CSS and JavaScript — no external assets, no build step.
- Diagrams, never ASCII art: build them as simple HTML/SVG. Reuse a **small number of diagram families** across the piece — e.g. a simplified version of the app's UI for UI changes, and a system/data-flow diagram (with **example data** in it) for component interactions. Lists of things are HTML lists.
- Code blocks go in `<pre>` tags. If you style a `<div>` instead, its CSS **must** set `white-space: pre` or `pre-wrap`, or the browser collapses every newline into one line. Before saving, scan each code block in the source and confirm it does.
- Show changed code **as a diff, not a flat listing**: a few lines of unchanged context, with added lines on a full-width green background and removed lines on a full-width red background (a `<span>` per line with `display: inline-block; width: 100%` inside the `<pre>`). The green/red is a **translucent background tint only** — `rgba(92,180,98,.24)` added, `rgba(225,95,95,.22)` removed — never a text colour. Code blocks sit on a **neutral charcoal** background (`#212327`); a tinted dark (olive, navy, brand colour) swallows the green tint and the diff disappears. A code block with no visible change marking teaches nothing about what changed.
- Every code block keeps **light syntax colouring** (comments, keywords, strings as coloured `<span>`s) — including inside diff blocks, where the syntax spans nest inside the line-tint spans. The diff tint marks *what changed*; syntax colour makes it *readable*; one never replaces the other.
- Fidelity check before saving: for each diff block, compare its added and removed lines against the real patch from step 1. Trimming context or eliding with `/* … */` is fine; a line marked as added that the patch doesn't add (or code silently rewritten) is not.
- Use callouts for key concepts, definitions, and important edge cases.

Completion: the file is saved with all four sections present and every craft rule confirmed against the source.

## 4. Verify

Source checks are mandatory and cheap — confirm them before handing over: charset meta first, all four sections present, every code block preserves newlines, diff blocks match the real patch.

Browser verification is **opt-in**, because driving a real browser takes a while. After saving, open the page for the user (`open <file>` on macOS), then ask with one question whether to run the full browser check (recommended) or stop here, noting they are already looking at the page.

If they opt in, follow the verify loop in the [`explainer`](../explainer/SKILL.md) skill (§4): decide the browser tool up front and confirm it's available, check desktop **and** a narrow mobile viewport, fix any overflow, overlap, clipped text, or dead control. Diff-specific check: click **every** quiz option across all five questions and confirm each shows correct/incorrect feedback.

The artifact fails if the reader cannot explain the change back, if the quiz is broken, or if any text overlaps, clips, or overflows.
