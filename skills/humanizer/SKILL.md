---
name: humanizer
description: "Rewrites prose to read like a person wrote it. Use when the user asks to humanize or de-slop a draft, flags AI tone, hype, or cliches in their text, or when the deliverable is prose that ships: landing pages, READMEs, posts, emails, release notes, changelogs."
argument-hint: "<text, file path, or draft; empty for the prose just written>"
---

# Humanizer

**Slop** is prose that performs writing instead of doing it: a sentence carrying
no fact, reason, instruction, or turn, dressed so the emptiness does not show.
Each dressing is a **tell**: an em dash, `pivotal`, `not just X but Y`, three
tidy adjectives.

A tell is a symptom. Swap the em dash for a comma and the empty sentence
survives with better manners. So for every tell, find what it was covering, then
say the real thing or cut the sentence.

## Steps

1. **Get the text and its register.** Text = `$ARGUMENTS`, else the file path
   given, else the prose just written. Read enough of what surrounds it (the
   rest of the file, the user's other writing, the thread) to hear how this
   person writes, and match that. Register is theirs, not a house voice. With no
   sample, write for an intelligent reader new to the subject.

2. **Mark what the text actually says.** The claim, the facts, the ask. Anything
   unmarked is a candidate for deletion, including whole sections that exist
   because the format seemed to want one.

3. **Hunt tells.** Walk [the table](#tells) over the draft. For each hit, name
   what it covers before touching the words.

4. **Rewrite.** Main point first. One idea per sentence. Plain word unless a
   precise one is needed. Order the ideas the way the reader needs them, not the
   way you found them.

5. **Read it back aloud.** Fix anything you would not say to the reader's face.

Done when every surviving sentence carries a fact, a reason, an instruction, or
a needed turn, and every tell in the table has been checked against the draft.

## Tells

| Tell                  | Looks like                                                                             | What it covers, and the fix                                            |
| --------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Inflated importance   | marks a pivotal moment, stands as a testament, reflects a broader trend                | The fact is ordinary. State it plainly.                                |
| Significance tail     | ...six platforms, underscoring its crucial role                                        | Nothing follows the fact. Stop after it, or name the real consequence. |
| Brochure praise       | nestled, vibrant, breathtaking, seamless, robust, world-class                          | No claim was made. Say what the thing does.                            |
| Vague magic           | unlock, elevate, empower, supercharge, leverage, transform, 10x                        | The change is unnamed. Say what is different afterwards.               |
| Fancy verb            | serves as, stands as, represents, showcases, utilises                                  | Formality standing in for a verb. Use is, has, uses, shows, used.      |
| Tidy contrast         | not just X but Y, not X but Y, stop X start Y                                          | The sentence shape is doing the work. Say the one true thing.          |
| Forced three          | three adjectives, three bullets, three examples                                        | The count came from rhythm. Use the number the evidence supports.      |
| Fake depth            | at its core, the real question is, here's the thing, the deeper truth                  | The point is missing. State it.                                        |
| Invented consensus    | experts say, studies show, many believe, several reports                               | One source, or none. Name it or cut the claim.                         |
| Elegant variation     | the company... the firm... the organisation, all one thing                             | Fear of repeating a noun. Repeat the noun.                             |
| Mechanical joins      | paragraphs opening Additionally, Moreover, Furthermore, Notably                        | The order is arbitrary. Join only to name a relation.                  |
| Stock ending          | Despite these challenges, Future prospects, well positioned to continue, In conclusion | The format demanded an ending. Stop when finished.                     |
| Absence guessed at    | details are not widely available, likely because she keeps a low profile               | A failed search proved nothing. Say what you checked.                  |
| Scaffolding and stubs | Great question, Certainly, I hope this helps, [insert example here]                    | Not part of the deliverable. Cut it, or finish it.                     |
| Condescending opener  | Most people don't realise, What nobody tells you                                       | The hook replaced the point. Start with the point.                     |

Words that mostly mark slop when they turn up together:

```text
additionally, aligns with, boasts, bolster, crucial, delve, elevate, enhance,
foster, garner, holistic, intricate, key, landscape, load-bearing, meticulous,
pivotal, robust, seamless, showcase, tapestry, testament, underscore, vibrant
```

Rewrite the sentence around its fact. Do not swap a flagged word for a quieter
synonym and call it done.

## Keep

Plain is the target, thin is not. Preserve:

- **Precise terms.** `idempotent` is not jargon when the reader needs it. Define
  it once if they might not.
- **Real opinions and their strength.** Softening a judgement to sound neutral
  is its own slop.
- **Limits, caveats, and warnings.** These are the sentences that cost money
  when cut.
- **The specifics already there.** Names, dates, numbers, versions.

When a vague claim has no specific behind it in the source, cut the claim. Never
manufacture a number, example, quotation, or citation to fill the gap. An
invented fact is worse than the hype it replaced.

## Formatting

- No em dashes. Use a comma, colon, brackets, or a full stop.
- Sentence case headings. Headings only where they help someone navigate; a
  short answer needs none.
- Bold for rare emphasis, not as a label on every bullet.
- No emoji in headings or bullets.
- Prose over a `Label: explanation` list when it reads better. Table only when
  there are rows to compare.
- Match format to size. A three-line answer is not an article.

## Output

Rewriting a draft: return the rewritten text and nothing else. Rewriting a file:
edit it in place. Add at most three short lines on what changed, only where the
change is not self-evident.

Asked why something is bad: name the tell, one sentence on what it covers, then
the rewrite.

Never announce that the text was humanized.
