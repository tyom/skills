// Flow helpers: each one stamps an event on the same clock as the recorder's
// frames (Date.now()) and paces the flow so a viewer can follow it.
import type { Locator, TestFixtures } from 'e2e';
import { setTimeout as sleep } from 'node:timers/promises';
import { harness } from './agent.ts';

export type CaptureEvent =
  | { t: number; kind: 'caption'; text: string }
  | { t: number; kind: 'tap' | 'hover'; x: number; y: number }
  | { t: number; kind: 'begin' };

// One list per worker, shared across module copies; the recorder starts and takes it.
// `pageTaps`: the web recorder logs taps from the page itself, so the helpers log none there.
const key = Symbol.for('screen-capture.events');
const store = globalThis as unknown as Record<symbol, { events: CaptureEvent[]; pageTaps: boolean } | undefined>;

export function startEvents({ pageTaps }: { pageTaps: boolean }) {
  store[key] = { events: [], pageTaps };
}

export function takeEvents(): CaptureEvent[] {
  const events = store[key]?.events ?? [];
  store[key] = undefined;
  return events;
}

export function push(event: CaptureEvent) {
  store[key]?.events.push(event);
}

/** Logs a tap the page cannot log itself: on a device, after the tap lands. */
function pushTap(point: { x: number; y: number }) {
  if (store[key] && !store[key].pageTaps) push({ t: Date.now(), kind: 'tap', ...point });
}


/** Time for the drawn cursor to travel before an action; a device draws taps only, so it waits none. */
const LEAD = 600;
const lead = () => sleep(store[key]?.pageTaps === false ? 0 : LEAD);
/** Time to let the result of an action show before the next step. */
const SETTLE = 500;

async function centre(locator: Locator) {
  // A device has no scrollIntoView (UNSUPPORTED_CAPABILITY); its tap scrolls the target into view itself.
  await locator.scrollIntoView().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) throw new Error('screen-capture: the target has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Starts the video here: setup before it, such as signing in, is cut. */
export async function begin() {
  // Let the last setup step paint first, so the video opens on its result.
  await sleep(100);
  push({ t: Date.now(), kind: 'begin' });
}

/** Shows `text` in the panel from now until the next caption. */
export async function caption(text: string, readMs = 1200) {
  push({ t: Date.now(), kind: 'caption', text });
  await sleep(readMs);
}

export async function tap(locator: Locator) {
  const point = await centre(locator);
  await lead();
  await locator.tap();
  pushTap(point);
  await sleep(SETTLE);
}

export async function hover(locator: Locator) {
  const point = await centre(locator);
  await lead();
  await locator.hover();
  push({ t: Date.now(), kind: 'hover', ...point });
  await sleep(SETTLE);
}

/** Taps the field, then types visibly, one key at a time. */
export async function type(locator: Locator, text: string, keyDelay = 60) {
  const point = await centre(locator);
  await lead();
  await locator.tap();
  pushTap(point);
  await locator.pressSequentially(text, { delay: keyDelay });
  await sleep(SETTLE);
}

export const pause = sleep;

/**
 * Runs one `agent.act` goal paced like the helpers. Record twice: the first run calls the
 * model and fills the replay cache, the second replays it without the model's thinking time.
 * `fallback` holds the exact steps, run when no coding agent is available or the goal fails.
 */
export async function act(agent: TestFixtures['agent'], goal: string, fallback?: () => Promise<void>) {
  // No coding agent: run the exact steps without a doomed model call or a cache replay.
  if (fallback && harness() === 'none') return fallback();
  try {
    await agent.act(goal, {
      onBeforeAction: lead,
      onAction: async (event) => {
        if (event.action === 'hoverAt') push({ t: Date.now(), kind: 'hover', ...event.point });
        if (event.action === 'tapAt') pushTap(event.point);
        await sleep(SETTLE);
      },
    });
  } catch (error) {
    if (!fallback) throw error;
    console.warn(`screen-capture: "${goal}" failed (${error instanceof Error ? error.message : error}); running its exact steps`);
    await fallback();
  }
}
