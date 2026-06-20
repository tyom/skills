# Step-through demos: make the state navigable

For subjects whose mechanism is a **reducer, state machine, or algorithm** that
evolves state event-by-event. A one-way "play" is not enough — the _transitions_
are the lesson, and the reader needs to study each one. Build and verify these to
a higher bar.

## Build

- **Derive state as a pure fold over the event prefix.** Compute the displayed state as `reduce(events[0..n])` from scratch on every navigation, rather than mutating one state forward in place. This single choice is what makes everything below cheap and correct: any step `n` is directly reachable, and there is no separate "undo" to get wrong.
- **Navigate in both directions.** Provide **Prev and Next** (plus Reset, and optionally Auto-play) with a visible step counter like `step n / total`. Forward-only stepping is a regression — the reader must be able to back up and re-watch a single transition as many times as they want.
- **Drive it from the keyboard too.** Bind **← / →** to Prev / Next while the demo is focused or in view. It's a cheap, discoverable accelerator that turns "exploring the transitions" into a fluid motion.
- **Highlight the diff at each step.** The point of a step-through is the _delta_, so make the delta the most visible thing on screen: flash or outline the element added or mutated this step, and where a field changed, show the transition (`old → new`) rather than only the final value. A reader should never have to hunt for what just happened.
- **Render the derived state semantically, not as a raw dump.** Show the assembling structure the way it really takes shape — cards/shapes with type and state labels, streaming/cursor affordances, per-kind colour — so the reader sees _structure_ forming, not text accreting. A `JSON.stringify` block is a fallback of last resort, not the default.
- **Offer a small scenario selector** when several short curated paths teach the branches better than one long path — e.g. a happy path, an error, and an approval/branch case. Each scenario is its own event list folded by the same reducer; switching resets cleanly to step 0.

## Verify

Step **forward to the end, then back to the start**, and confirm the state shown
at each index is identical in both directions (the pure-fold model guarantees
this — if it isn't, the state is being mutated, not recomputed). Confirm the
**diff highlight** marks the element that actually changed at that step (not
stale, not missing), that **← / →** drive the demo, and that Prev at step 0 and
Next at the final step are safe no-ops rather than broken states.
