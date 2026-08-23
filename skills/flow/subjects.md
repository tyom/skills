# Subjects: fit by graph behaviour

The useful question is **what can happen next, and why?** Use this renderer when
the answer depends on decisions, state changes, retries, failures, concurrency,
or convergence. The definition may sit in one dense file or be implied across
many sources. What matters is whether the graph saves the reader from mentally
executing it.

## Decisions and terminal states

Use `decision` when exactly one outcome runs. Label every outcome and terminate
every path with `end` or `success`.

- Payment authorisation, including challenge, decline, capture and refund.
- Troubleshooting and support diagnosis, where each answer rules out branches.
- Incident triage and escalation, including recovery and hand-off states.
- Eligibility, permissions, feature flags and policy decisions.
- Webhook receipt, cache reads, migrations and queue consumers where failure paths carry most of the explanation.

## States and loops

Use `state` when nodes are places the subject rests and edges are the events that
move it. The graph should answer whether one state can reach another.

- Orders, subscriptions, claims, tickets and document review.
- Device pairing, fulfilment and model deployment.
- XState or reducer machines, even when one file contains the whole definition.

Use `retry` for a transition that returns to an earlier attempt. This stops the
highlight walk from treating the loop as progress.

## Failure and fallback

Use `error`, `retry` and `async` edges when recovery behaviour is the point.

- Provider or model fallback, circuit breakers and timeouts.
- Controller reconciliation and eventually consistent repair.
- Service failover, canary promotion and rollback.
- Poison messages, dead-letter queues and idempotent replay.

## Concurrency and convergence

Use `fork` and `join` when every branch runs and later converges. Use `decision`
when only one branch runs.

- Parallel approvals and review gates.
- Build fan-out, CI jobs and distributed tasks.
- Service startup requirements and health checks.
- Safety interlocks where several conditions must hold before progress.

## Resolution and precedence

These are strongest when declarations are scattered and no source shows the
resulting order.

- Middleware and interceptor short-circuits.
- Route, proxy and configuration precedence.
- Task and service dependency ordering.
- Permissions, retention and consent rules.
- Dependency resolution, parser branches and evaluator error paths.

A dense router, policy or state-machine file may still deserve a graph. Point at
the file only when reading it already answers the question without mental
simulation.

## One subject, several tabs

Use tabs for complete related flows, not fragments of one route.

"Auth flow" can split into first login, authorisation code with PKCE,
request-time session validation, refresh rotation, and logout or revocation.
Other useful comparisons include current versus proposed behaviour, user-role
variants, platform variants and provider alternatives.

A conversation between actors is still a sequence diagram. When actor order is
secondary, draw the service under study and collapse an external participant to
one `io` node.

## Physical mechanisms and human procedures

Locks, appliances, machine cycles, access controls and safety cut-offs fit when
actions change hidden state or trigger different outcomes. Cite the manual,
datasheet or standard behind each transition.

Release procedures, call trees and review processes also fit. Use a document ref
where the procedure is written down. Otherwise name the decision and its owner
in the node detail. Draw the procedure once and keep rosters in a table.

## Send these elsewhere

- **A straight chain.** Write a list unless state, failure or evidence detail makes navigation useful.
- **Actors talking over time.** Use a sequence diagram when actor order is the content.
- **Weighted movement.** Use a Sankey when edge volume matters.
- **Duration and bottlenecks.** Use a timeline or schedule.
- **Entities and relations.** Use an ER diagram.
- **A whole application.** Select one question or split independent flows into tabs.
