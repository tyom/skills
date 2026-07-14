---
name: explain-diff
description: "Use when the user wants a rich, teach-me explanation of a code change — a local diff, branch, commit range, or GitHub PR. Builds a self-contained interactive HTML page: background, intuition, code walkthrough, and a comprehension quiz."
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
---

# Explain a Diff

Produce a single self-contained HTML page that teaches a code change so well the reader can explain it back: what the world looked like **before**, the **intuition** of the change, a walkthrough of the **code**, and a **quiz** to prove it landed. Ground every claim in the real diff and the surrounding code — never explain from the diff alone or from priors.

## 1. Get the diff

Read the argument to pick the source, then capture the full patch **and** its metadata (title, description, discussion — the *why*):

- **GitHub PR** (URL or number): `gh pr diff <n>` for the patch, `gh pr view <n>` for the title, body, and comments.
- **Local branch**: `git diff <base>...<branch>` (three-dot, against the merge-base).
- **Commit range / single commit**: `git diff A..B`, or `git show <sha>`.
- **Working tree** (default when the argument is empty): `git diff` and `git diff --staged`, against the base branch.

Completion: you hold the complete patch and know the base and head.

## 2. Explore the surrounding code

The diff shows what changed, not the system it changed. Read the touched files and their neighbours — callers, types, config, tests — until you can describe the machinery **as it was before this change**, not just the added and removed lines. Capture concrete, checkable facts: names, paths, signatures, before/after behaviour.

Completion: you can explain the relevant existing system without referring to the diff.

## 3. Build the page

One self-contained `.html` file, one long scrolling page with a sticky table of contents and section headers — no top-level tabs. Write with the clarity and flow of **Martin Kleppmann**: classic style, concrete, smooth transitions between sections. Basic responsive styling so it reads on a phone.

Save it **outside the code repo** with a filename starting with today's date in `YYYY-MM-DD-` form, so the files stay time-sorted and out of version control — e.g. `/tmp/2026-01-12-explanation-<slug>.html`.

The four sections, in order:

- **Background** — the existing system this change touches, from step 2. The reader's prior knowledge is unknown, so give a *deep* background for beginners (say up front it can be skipped by the familiar), then a *narrow* background aimed straight at what the change affects.
- **Intuition** — the essence of the change, not the full detail. Carry it on concrete examples with toy data and lean on diagrams to make it land.
- **Code** — a high-level walkthrough of the changes, grouped and ordered so they build on each other (by concern, not necessarily file-by-file).
- **Quiz** — five interactive multiple-choice questions, medium difficulty: hard enough that answering needs real understanding of the change, but not gotchas. Clicking an option reveals whether it was right and gives feedback.

Craft rules:

- Inline all CSS and JavaScript — no external assets, no build step.
- Diagrams, never ASCII art: build them as simple HTML/SVG. Reuse a **small number of diagram families** across the piece — e.g. a simplified version of the app's UI for UI changes, and a system/data-flow diagram (with **example data** in it) for component interactions. Lists of things are HTML lists.
- Code blocks go in `<pre>` tags. If you style a `<div>` instead, its CSS **must** set `white-space: pre` or `pre-wrap`, or the browser collapses every newline into one line. Before saving, scan each code block in the source and confirm it does.
- Use callouts for key concepts, definitions, and important edge cases.

## 4. Verify

Open the file in a real browser and drive it before finishing — follow the verify loop in the [`explainer`](../explainer/SKILL.md) skill (§4): decide the browser tool up front and confirm it's available, check desktop **and** a narrow mobile viewport, fix any overflow, overlap, clipped text, or dead control. Diff-specific check: click **every** quiz option across all five questions and confirm each shows correct/incorrect feedback.

The artifact fails if the reader cannot explain the change back, if the quiz is broken, or if any text overlaps, clips, or overflows.
