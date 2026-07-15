---
name: micro-world
description: "Builds a self-contained interactive simulation — a micro-world — of code or a concept: a working model with objects, rules, and knobs, learned by poking. Simulation, not exposition."
argument-hint: "<code, concept, or mechanism — empty for the current topic>"
disable-model-invocation: true
# Auto-approved while the skill runs. Reads source, writes one HTML file to
# /tmp, opens it — deliberately no git, no network, no blanket Bash.
# Browser-verify tools still prompt (opt-in).
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash(open:*)
  - Bash(ls:*)
  - Bash(find:*)
  - Bash(command -v:*)
---

# Micro-world

Build a Papert-style micro-world: a small self-contained universe with its own objects and rules that the user manipulates to learn by experiment. The page *is* the subject, working — the user pokes it and watches what happens. For a document that explains a subject, use `explainer` instead.

## 1. Pick the subject

Subject = $ARGUMENTS; else the thing most recently under discussion; else the file open in the IDE. If still ambiguous, ask one question. Diffs belong to `explain-diff`.

## 2. Derive the rules

If the subject has source code, read it and encode *its* rules — the actual constants, thresholds, and edge cases, not the textbook version. For a pure concept, use the canonical definition from your own knowledge (if the user wants sourced facts, they can feed `research` output in as the argument). Done when every rule of the world is stated as a testable fact ("bucket refills 10 tokens/sec, caps at burst").

## 3. Choose one mechanism

A micro-world models exactly one mechanism. Pick the most illuminating rule-system in the subject and name the choice on the page in one line: "This world models X; it leaves out Y and Z." A rerun with a sharper argument picks a different mechanism.

## 4. Build the world

One self-contained HTML file, zero external assets: hand-rolled CSS in a `<style>` block, system font stack, vanilla JS, canvas/SVG/DOM as fits the subject. Write the world's rules as pure functions, separate from rendering.

Every world has four parts:

1. **World** — the objects, rendered live, their state visible.
2. **Hands** — direct manipulation and/or knobs; the user's actions change the world.
3. **Time** — run / step / pause; a step the user can freeze beats an animation they can't.
4. **Reset** — always.

The only words on the page: control labels, the one-line scope note from step 3, and a **"try this"** list of 3–5 one-line experiments ("set burst to 0 — why do requests still pass?"). Everything else the world shows.

## 5. Self-check

Encode the facts from step 2 as inline assertions over the pure rule functions, run on page load, surfaced as a small pass/fail badge. Done when every assertion passes and every control visibly changes the world.

## 6. Deliver

Save as `/tmp/YYYY-MM-DD-microworld-<slug>.html` (today's date) and `open` it. Then ask with one question whether to run the full browser check (drive the controls, watch the console) or stop here, noting the user is already looking at the page.

The world fails if a control does nothing visible, an assertion fails, or the page reads like a document.
