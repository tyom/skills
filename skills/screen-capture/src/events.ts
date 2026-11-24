// Flow helpers: each one stamps an event on the same clock as the recorder's
// frames (Date.now()) and paces the flow so a viewer can follow it.
import type { Locator, TestFixtures } from 'e2e';

export type CaptureEvent =
  | { t: number; kind: 'caption'; text: string }
  | { t: number; kind: 'tap' | 'hover'; x: number; y: number }
  | { t: number; kind: 'begin' };

// One list per worker, shared across module copies; the recorder starts and takes it.
const key = Symbol.for('screen-capture.events');
const store = globalThis as unknown as Record<symbol, CaptureEvent[] | undefined>;

export function startEvents() {
  store[key] = [];
}

export function takeEvents(): CaptureEvent[] {
  const events = store[key] ?? [];
  store[key] = undefined;
  return events;
}

export function push(event: CaptureEvent) {
  store[key]?.push(event);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Time for the drawn cursor to travel before an action. */
const LEAD = 600;
/** Time to let the result of an action show before the next step. */
const SETTLE = 500;

async function centre(locator: Locator) {
  await locator.scrollIntoView();
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

// Taps are not pushed here: the recorder logs every pointerdown from the page itself.
export async function tap(locator: Locator) {
  await centre(locator);
  await sleep(LEAD);
  await locator.tap();
  await sleep(SETTLE);
}

export async function hover(locator: Locator) {
  const point = await centre(locator);
  await sleep(LEAD);
  await locator.hover();
  push({ t: Date.now(), kind: 'hover', ...point });
  await sleep(SETTLE);
}

/** Taps the field, then types visibly, one key at a time. */
export async function type(locator: Locator, text: string, keyDelay = 60) {
  await centre(locator);
  await sleep(LEAD);
  await locator.tap();
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
  try {
    await agent.act(goal, {
      onBeforeAction: () => sleep(LEAD),
      onAction: async (event) => {
        if (event.action === 'hoverAt') push({ t: Date.now(), kind: 'hover', ...event.point });
        await sleep(SETTLE);
      },
    });
  } catch (error) {
    if (!fallback) throw error;
    console.warn(`screen-capture: "${goal}" failed (${error instanceof Error ? error.message : error}); running its exact steps`);
    await fallback();
  }
}
