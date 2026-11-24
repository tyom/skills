---
name: screen-capture
description: "Records a scripted web flow at 60fps and 2x, and renders it as a portrait, landscape or square MP4 with captions and a drawn cursor or taps."
argument-hint: "<the flow to show, the app URL, and the sizes>"
disable-model-invocation: true
# Auto-approved while the skill runs: the compose script and frame checks.
allowed-tools:
  - Bash(bun */screen-capture/src/compose.ts*)
  - Bash(ffprobe *)
  - Bash(ffmpeg -v error *)
---

# Screen capture

Turn a scripted flow into a showcase video. [e2e](https://github.com/e2e-inc/e2e) drives the browser, this skill's recorder captures it at 60fps and the device pixel ratio, and [HyperFrames](https://github.com/heygen-com/hyperframes) composes the clip with captions and a pointer. Every dependency is open source (mostly MIT and Apache-2.0; `sharp`'s libvips binary is LGPL-3.0) with no paid tier, so it suits side projects and companies alike.

Web only for now. iOS Simulator and Android emulator capture are not built yet; say so if asked.

`<skill>` below is the folder holding this file, and `<e2e>` is `E2E_TELEMETRY_DISABLED=1 <skill>/node_modules/.bin/e2e`. For e2e's own API (locators, actions, matchers, error codes), run `<e2e> guide writing-tests` or `<e2e> guide debugging`: they print the docs of the pinned version.

## 1. Set up (first run)

If `<skill>/node_modules` is missing, run in `<skill>`: `bun install`, then `bunx playwright install chromium`. The first render also downloads HyperFrames' own Chrome.

Then install the adapter for the harness you run in, so `agent.act` goals run on its existing login (no API key). Use `--no-save`, and repeat it after any `bun install`, which removes it:

- Claude Code: `bun add --no-save @agentclientprotocol/claude-agent-acp@0.112.0`
- Codex: `bun add --no-save @agentclientprotocol/codex-acp@2.12.0` (about 400 MB, it bundles Codex)
- Any other harness: install neither. Goals then run their exact fallback steps.

`agents()` picks the harness it runs inside if its adapter is installed, else any installed adapter, else none. `SCREEN_CAPTURE_AGENT=claude|codex|none` overrides it. Known issue: with Codex plugins that add MCP servers (`codex mcp list` shows names absent from `~/.codex/config.toml`), the Codex adapter fails to start and goals fall back.

## 2. Scope the flow

From `$ARGUMENTS` or the conversation, pin down: the app URL and the command that starts it (or a live site), the goals to show (in the words the app uses), a caption for each beat, and the output sizes. Ask only for what you cannot infer. Done when every beat is one goal with one visible outcome.

## 3. Write the flow

Work in `.screen-capture/` in the user's project. Link the skill's packages there, since e2e looks for the adapter from the working folder: `ln -sfn <skill>/node_modules .screen-capture/node_modules`. Then write two files.

`e2e.config.ts`, one target per viewport you need:

```ts
import { web, recorder, viewports, agents, type E2EConfig } from '<skill>/src/index.ts';

// e2e starts the dev server, waits for the URL to answer, and stops it after the run. Drop `command` for a live site.
const app = { url: 'http://localhost:3000', command: { executable: 'npm', args: ['run', 'dev'], log: '.e2e/logs/app.log' } };

export default {
  tests: 'flows/**/*.e2e.ts',
  workers: 1,
  video: 'on',
  targets: [
    { name: 'desktop', engine: web({ viewport: viewports.desktop, browser: recorder() }), app },
    { name: 'phone', engine: web({ viewport: viewports.phone, browser: recorder({ dpr: 3 }) }), app },
  ],
  agents: agents(),
} satisfies E2EConfig;
```

`flows/<name>.e2e.ts`:

```ts
import { test, expect, act, caption, tap, type, hover } from '<skill>/src/index.ts';

test('top repos', { timeout: 600_000 }, async ({ app, agent, screen }) => {
  await app.open('/');
  await caption('GitHub keeps them on its Trending page', 600);
  await act(agent, 'open the Trending repos page from the Developers menu', async () => {
    await tap(screen.getByRole('button', { name: 'Developers', exact: true }));
    await tap(screen.getByRole('link', { name: 'Trending repos' }));
  });
  await expect(screen.getByRole('heading', { name: 'Trending', level: 1 })).toBeVisible();
  await caption('Each repo shows its stars this month', 2500);
});
```

Rules the code cannot show:

- Import everything from `<skill>/src/index.ts`, with the absolute path. It is the one copy of e2e the runner registers tests with.
- Every visible action goes through `act`, `tap`, `type` or `hover`. They pace the flow (cursor travel, then a pause to let the result show). A raw e2e call takes about 15 ms, so keep raw calls for setup and assertions. The recorder draws the pointer at every real tap, whoever made it.
- `act(agent, goal, fallback)` runs one goal: one outcome, worded as the screen words it. Follow it with an `expect` on that outcome, which lets e2e cache the actions. `fallback` holds the same steps as exact helper calls; it runs when no agent is available or the goal fails. Write goals first and fill each fallback after the first passing run, from the actions the agent recorded in `.e2e/cache/*.json` (`actions[].target`, a role and a name).
- `caption(text, readMs)` adds a line to the panel's chain: the newest shows in full, the two before it fade, and older ones leave. Give each beat one short line that reads on from the last.
- The helpers' pauses are for the viewer. To wait for the app, use `expect(...)` or `locator.waitFor()`, which wait for the state itself.
- In exact steps, find elements with `screen.getByRole(role, { name })` first, then `getByLabel` or `getByText`. A locator matching two nodes fails with `LOCATOR_AMBIGUOUS`: narrow it.
- To start the video past setup, such as signing in, do the setup with raw calls, end it with an `expect` on its result, then `await begin()`. Compose cuts everything before it. e2e's saved sign-in sessions are unavailable with this recorder.
- `workers: 1`: the recorder collects events per worker process.
- Raise `recorder({ dpr })` when compose warns about upscaling.

## 4. Record

From `.screen-capture/`:

```bash
<e2e> run --config e2e.config.ts
```

Run it twice when the flow has goals. The first run calls the agent and its thinking time lands in the video; the second replays the cached actions in seconds with no model calls (`Cache  N replayed`). Compose from the second.

Each attempt's `video/` folder (under `.e2e/results/`) holds `clip.mp4` and `clip.json`: the capture start, viewport, pixel size and events.

When the flow fails, fix it from what the run recorded:

1. Read the failure block: the failing line, expected against observed, and `❯ on screen` (the nodes nearest a failed locator) when shown. Then read the `trace.md` it names, whose `## Screen at failure` lists the screen one node per line.
2. Fix every later line that screen covers too, not only the failing one: each wrong line costs another full recording.
3. Rerun one test on one size: `<e2e> run --config e2e.config.ts flows/<name>.e2e.ts:<line of test(> --target <name> --action-timeout 5000 --retries 0`.

Compose only from a passing run.

## 5. Compose

```bash
bun <skill>/src/compose.ts <video dir> --size portrait --out .screen-capture/out/<name>-portrait.mp4
```

`--help` lists the options: `--size`, `--panel none|side|bottom`, `--pointer cursor|tap|none`, `--crop x,y,w,h` in page CSS pixels, `--theme`, `--no-render`. The defaults follow the page: landscape with a side panel for wide pages, portrait with a bottom panel for tall ones, a cursor from 1024 px wide, taps below that. A render takes about 2 to 3 times the clip's length.

The HyperFrames project lands next to the MP4 (`<name>.hyperframes/`). To change the look, edit its `index.html`, then run `<skill>/node_modules/.bin/hyperframes render <project> --fps 60 --quality high --chroma-subsampling 444 --video-frame-format png -o <out>`.

## 6. Check

Done when, for every output:

- `ffprobe` reports `r_frame_rate=60/1` at the requested size. This only checks the container: the recorder always writes 60fps, repeating frames when the capture falls behind. Judder in the viewed frames is the real sign of a slow capture.
- You have viewed a frame at each caption and each tap time (from `clip.json`, counted from the `begin` event if there is one, else from `startedAt`), and each one shows the right caption, with the pointer on its target.
- Compose printed no upscaling warning, or you told the user about it.

Report the MP4 paths and anything the check turned up.
