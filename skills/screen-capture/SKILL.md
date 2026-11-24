---
name: screen-capture
description: "Records a scripted web or iOS Simulator flow at 60fps, and renders it as a portrait, landscape or square MP4 with captions and a drawn cursor or taps."
argument-hint: "<the flow to show, the app URL, and the sizes>"
disable-model-invocation: true
# Auto-approved while the skill runs: setup, the compose script and frame checks.
allowed-tools:
  - Bash(node */screen-capture/src/setup.js*)
  - Bash(node */screen-capture/src/compose.ts*)
  - Bash(ffprobe *)
  - Bash(ffmpeg -v error *)
---

# Screen capture

Turn a scripted flow into a showcase video. [e2e](https://github.com/e2e-inc/e2e) drives the browser or simulator, this skill's recorders capture it at 60fps (the browser at its device pixel ratio, the simulator at its native resolution), and [HyperFrames](https://github.com/heygen-com/hyperframes) composes the clip with captions and a pointer. Every dependency is open source (mostly MIT and Apache-2.0; `sharp`'s libvips binary is LGPL-3.0) with no paid tier, so it suits side projects and companies alike.

Web and iOS Simulator (macOS with Xcode). Android emulator capture is not built yet; say so if asked.

`<skill>` below is the folder holding this file, and `<e2e>` is `E2E_TELEMETRY_DISABLED=1 <skill>/node_modules/.bin/e2e`. For e2e's own API (locators, actions, matchers, error codes), run `<e2e> guide writing-tests` or `<e2e> guide debugging`: they print the docs of the pinned version.

## 1. Set up

Run `node <skill>/src/setup.js` before every recording session, with `--ios` for an iOS flow. It needs Node 22.22.3+ or 24.8+ and ffmpeg, and Xcode for iOS; when one is missing it stops and names the install command. It installs only what is missing, so a ready skill takes about a second: the packages, Playwright's Chromium, HyperFrames' Chrome, and the adapter for the harness it runs in (Claude Code or Codex), so `agent.act` goals run on that harness's login with no API key. In any other harness goals run their exact fallback steps. Run it from the harness itself, so it sees which one you use.

`agents()` picks the harness it runs inside if its adapter is installed, else any installed adapter, else none. `SCREEN_CAPTURE_AGENT=claude|codex|none` overrides it. Known issue: with Codex plugins that add MCP servers (`codex mcp list` shows names absent from `~/.codex/config.toml`), the Codex adapter fails to start and goals fall back.

## 2. Scope the flow

From `$ARGUMENTS` or the conversation, pin down: the app URL and the command that starts it (or a live site), the goals to show (in the words the app uses), a caption for each beat, the output sizes, and the framing: cropped to the page's content (the default) or the full page (`--crop none` in §5, when the user asks for the full screen or whole page). To show a change, such as a bug fix, also pin down the two versions: by default, before is the base the change branches from and after is the working tree. Ask only for what you cannot infer. Done when every beat is one goal with one visible outcome.

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

For an iOS Simulator target, add `mobile` and `simulator` to the import, and name the app instead of a URL:

```ts
{ name: 'iphone', engine: mobile({ platform: 'ios', device: simulator({ device: 'iPhone 17 Pro' }) }), app: { bundleId: 'com.apple.mobilesafari' } },
```

`simulator()` boots the named simulator (default: a booted iPhone, else the last one listed, on the newest iOS), sets the status bar to 9:41 with a full battery, and records native pixels (`scale` is 3 on iPhones, pass 2 for an iPad).

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
- On a device, `screen` sees only the target app, not the home screen: `app.open()` launches it, as it was last left. To start it fresh, reset its data before `begin()`. For Safari: `xcrun simctl terminate "<device>" com.apple.mobilesafari`, then delete `SafariTabs.db*` and `BrowserState.db*` under `$(xcrun simctl getenv "<device>" SIMULATOR_SHARED_RESOURCES_DIRECTORY)/Library/Safari`, where `<device>` is the name passed to `simulator()`. `booted` would pick any booted simulator, so it can wipe another one's Safari.
- A device tap takes about 2 s and a `boundingBox()` about 0.6 s, so device videos hold still between steps. Keep device flows short.
- The destructured `device` fixture (`device.home()`, `device.openLink()`) has no type in the shared `test`: annotate the fixtures `any` in device flows.
- Raise `recorder({ dpr })` when compose warns about upscaling.

### Before and after

To show a change, record the same flow on the old and the new app, and compose the two clips under one set of captions.

1. Check out the old version beside the working tree, `git worktree add .screen-capture/before <base>`, and install its dependencies there.
2. Give each version a target with the same engine and viewport. e2e resolves `cwd` from `.screen-capture/`, and `{port}` expands to the URL's port; pass it with the dev server's own port flag:

   ```ts
   const app = (cwd: string, port: number) => ({
     url: `http://localhost:${port}`,
     command: { executable: 'npm', args: ['run', 'dev', '--', '--port', '{port}'], cwd, log: `.e2e/logs/${port}.log` },
   });
   // targets:
   { name: 'before', engine: web({ viewport: viewports.phone, browser: recorder({ dpr: 3 }) }), app: app('before', 3001) },
   { name: 'after', engine: web({ viewport: viewports.phone, browser: recorder({ dpr: 3 }) }), app: app('..', 3002) },
   ```

3. One flow runs on both, so both get the same captions. Caption what the viewer should look for. Check the outcome the change fixes with a soft check that reads once, `expect.soft(await locator.textContent()).toBe('£5.50')`: the before run then fails after recording everything. A waiting check (`await expect.soft(locator).toHaveText(...)`) records its whole timeout, and a hard one stops the before video at the bug.
4. Record with `--retries 0`, then find each target's folder in `.e2e/report.json`: `run.results[]` has `targetId`, and its last `attempts[]` entry has the `clip.mp4` path among its `artifacts`.
5. Compose with both folders, before first (§5).

## 4. Record

From `.screen-capture/`:

```bash
<e2e> run --config e2e.config.ts
```

Run it twice when the flow has goals. The first run calls the agent and its thinking time lands in the video; the second replays the cached actions in seconds with no model calls (`Cache  N replayed`). Compose from the second.

On a device, the agent's taps report no point, so a replay draws no taps. Fill every fallback from the first run's cache, then record the take with `SCREEN_CAPTURE_AGENT=none <e2e> run ...`: each goal runs its exact steps, which log their taps.

Each attempt's `video/` folder (under `.e2e/results/`) holds `clip.mp4` and `clip.json`: the capture start, viewport, pixel size and events.

When the flow fails, fix it from what the run recorded:

1. Read the failure block: the failing line, expected against observed, and `❯ on screen` (the nodes nearest a failed locator) when shown. Then read the `trace.md` it names, whose `## Screen at failure` lists the screen one node per line.
2. Fix every later line that screen covers too, not only the failing one: each wrong line costs another full recording.
3. Rerun one test on one size: `<e2e> run --config e2e.config.ts flows/<name>.e2e.ts:<line of test(> --target <name> --action-timeout 5000 --retries 0`.

Compose only from a passing run; in a before and after, the before run fails only its soft check.

## 5. Compose

```bash
node <skill>/src/compose.ts <video dir> --size portrait --out .screen-capture/out/<name>-portrait.mp4
```

For a before and after, pass both folders, before first: `node <skill>/src/compose.ts <before dir> <after dir> --out ...`. Each caption then starts on the same frame in both panes, and between captions the faster side holds its last frame. Tall pages sit side by side and wide pages stack, each under its label: `--labels Bug,Fixed` renames them (default `Before,After`). Compose stops when the two clips' captions or page sizes differ.

`--help` lists the options: `--size`, `--panel none|side|bottom`, `--pointer cursor|tap|none`, `--crop x,y,w,h` in page CSS pixels or `none`, `--theme`, `--no-render`. The defaults follow the page: a crop to the area any frame shows content in (padded, the same for both panes; a page with a busy background keeps its full size), landscape with a side panel for wide pages, portrait with a bottom panel for tall ones, a cursor from 1024 px wide, taps below that. A render takes about 2 to 3 times the clip's length.

The HyperFrames project lands next to the MP4 (`<name>.hyperframes/`). To change the look, edit its `index.html`, then run `<skill>/node_modules/.bin/hyperframes render <project> --fps 60 --quality high --chroma-subsampling 444 --video-frame-format png -o <out>`.

## 6. Check

Done when, for every output:

- `ffprobe` reports `r_frame_rate=60/1` at the requested size. This only checks the container: the recorder always writes 60fps, repeating frames when the capture falls behind. Judder in the viewed frames is the real sign of a slow capture.
- You have viewed a frame at each caption and tap time compose printed, and each one shows the right caption, with the pointer on its target (in both panes for a before and after).
- Compose printed no upscaling warning, or you told the user about it.
- The crop cuts off nothing that matters, such as a toast near the edge. If it does, compose again with `--crop none` or a wider `--crop`, and tell the user.

Report the MP4 paths and anything the check turned up.
