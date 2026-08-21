# Subjects: what this draws well, and what to send elsewhere

Two tests, both required. **It branches**: a straight run of steps is a list, and
a list reads better as a list. **No one file already shows the branching**: if a
single file lays the graph out plainly, point at the file.

Ranked below by how much the tracing adds.

## The graph exists, nothing displays it

The answer is spread over several files and no one has seen it whole. Highest
payoff, because the diagram is the first time it exists.

- **Middleware and interceptor chains.** The file is a list of `app.use(...)`; the truth is which ones short-circuit, and in what order.
- **Route matching precedence.** nginx `location` blocks, a framework router, a proxy rule list. Where 404s and shadowed routes come from.
- **Service startup ordering.** systemd `After`/`Requires`, compose `depends_on` with healthchecks. Written as per-unit assertions, never as the resulting order.
- **Task pipelines.** make, just, turbo, nx. The dependency graph is implied by target names alone.
- **CI workflows.** Jobs, their `needs`, the conditional steps, and what each one does when it fails.

## One file, but the failure branches are the point

Several distinct terminal states, which is what the `end` rule and the
reachability check are good at. The happy path is the short one; the diagram is
mostly everything else that can happen.

- **Payment authorisation.** Decline, 3DS challenge, capture, refund, chargeback.
- **Queue consumer.** Ack, retry, DLQ, poison message.
- **Webhook receipt.** Signature check, idempotency key, replay, provider retry.
- **Cache read path.** Hit, stale, miss, stampede lock.
- **Migration.** Up, and the rollback path that gets tested least.

## Worked example: one subject, five tabs

"Auth flow" is not one flow. As a single diagram it becomes the whole-application
case below; split into tabs it is the best subject on this page, because it lands
in both groups above at once.

- **First login.** Credentials, MFA required, account locked, email unverified, session issued.
- **Authorization code with PKCE.** Redirect out, `state` and `code_verifier` checked on the way back, token exchange.
- **Request-time session validation.** The middleware case above: what short-circuits, and in what order.
- **Refresh and rotation.** Including reuse detection, where a replayed refresh token revokes the whole family.
- **Logout and revocation.** Which of the four above are actually invalidated.

The provider leg exposes the one gap worth knowing about. A handshake between the
browser, your service and an identity provider is a conversation, and these nodes
carry what happens, not who does it. Draw your own service's side and make the
provider a single `io` node. Putting the actor in every `note` is the alternative
and it reads worse.

Cut the same way for any subject named after a subsystem rather than a path:
sessions, billing, sync, search. Find the paths inside it first.

## State machines

Reach for `state` pills when the nodes are places the system rests in and the
edges are the events that move it: order lifecycle, subscription billing, device
pairing, an XState config drawn from the machine definition. The diagram answers
"can it get from here to there", which reading the config does not.

## Procedures with no code behind them

An incident escalation, a call tree, a release process, a review process. These
work, but nothing here compiles, so the `ref` discipline needs a stand-in. Where
the procedure is written down in the repo, `ref` the document and the line, and
the build check validates it exactly as it does source. Where it is not, the
node's `detail` names the decision it came from and `summary` says who agreed it.
A node that can answer neither is the guess this skill exists to avoid.

A roster is not a diagram. A call tree three deep, three contacts each, is 40
nodes doing four distinct things. Draw one participant's procedure once, where
the branching is, and leave the roster as a table.

## Send these elsewhere

- **A straight chain.** No decisions, no forks. Write the list.
- **Who talks to whom over time.** A sequence diagram. Ordering between actors is the content, and this renderer discards it.
- **Volumes through a funnel.** A Sankey. Edge weight is not in the vocabulary.
- **A whole application.** 300 nodes reads as wallpaper. Take one path through it, or give each subsystem its own tab.
- **Entities and their relations.** An ER diagram.
