import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chain, layout, resample, timeline } from './timeline.ts';

test('turns wall-clock events into clip seconds, each caption lasting until the next', () => {
  const clip = {
    startedAt: 1000,
    endedAt: 9000,
    events: [
      { t: 900, kind: 'caption' as const, text: 'A' },
      { t: 2250, kind: 'tap' as const, x: 10, y: 20 },
      { t: 4000, kind: 'caption' as const, text: 'B' },
      { t: 5000, kind: 'hover' as const, x: 30, y: 40 },
    ],
  };
  assert.deepEqual(timeline(clip), {
    offset: 0,
    duration: 8,
    captions: [
      { start: 0, end: 3, text: 'A' },
      { start: 3, end: 8, text: 'B' },
    ],
    pointer: [
      { t: 1.25, kind: 'tap', x: 10, y: 20 },
      { t: 4, kind: 'hover', x: 30, y: 40 },
    ],
  });
});

test('starts the clip at begin(), dropping what came before it', () => {
  // begin at 3000 is 2s into the capture; the clip then runs to 9000, 6s.
  const clip = {
    startedAt: 1000,
    endedAt: 9000,
    events: [
      { t: 1200, kind: 'caption' as const, text: 'Signing in' },
      { t: 1500, kind: 'tap' as const, x: 1, y: 2 },
      { t: 3000, kind: 'begin' as const },
      { t: 4000, kind: 'caption' as const, text: 'B' },
      { t: 5000, kind: 'tap' as const, x: 10, y: 20 },
    ],
  };
  assert.deepEqual(timeline(clip), {
    offset: 2,
    duration: 6,
    captions: [{ start: 1, end: 6, text: 'B' }],
    pointer: [{ t: 2, kind: 'tap', x: 10, y: 20 }],
  });
});

test('fits the cropped page beside a side panel, centred in the space left', () => {
  // 1920x1080, margin 32, panel 26% of the width (499):
  // video area 1920 - 499 - 3*32 = 1325 wide, 1080 - 2*32 = 1016 tall.
  // scale min(1325/800, 1016/600) = 1.65625 -> 1325x994 (993.75), centred: y = 32 + (1016 - 994) / 2.
  assert.deepEqual(layout({ width: 1920, height: 1080 }, 'side', { width: 800, height: 600 }), {
    slot: { x: 32, y: 43, width: 1325, height: 994, scale: 1.65625 },
    panel: { x: 1389, y: 32, width: 499, height: 1016 },
  });
});

test('resamples frames to a constant rate, each output frame showing the latest captured one', () => {
  // Output frames every 20ms from 990: 990 1010 1030 1050 1070 1090 (6 frames up to 1100).
  // Captured at 1000, 1016, 1040, 1100: 990 is before the first, so it shows the first.
  assert.deepEqual(resample([1000, 1016, 1040, 1100], 990, 1100, 50), [0, 0, 1, 2, 2, 2]);
});

test('keeps a bottom panel under a short page, the pair centred vertically', () => {
  // 1080x1920, margin 32, panel 20% of the height (384). Video area 1016 wide.
  // scale 1016/500 = 2.032 -> 1016x569 (568.96). Group 569 + 32 + 384 = 985 tall, top (1920 - 985) / 2 = 467.5 -> 468.
  assert.deepEqual(layout({ width: 1080, height: 1920 }, 'bottom', { width: 500, height: 280 }), {
    slot: { x: 32, y: 468, width: 1016, height: 569, scale: 2.032 },
    panel: { x: 32, y: 1069, width: 1016, height: 384 },
  });
});

test('keeps caption keyframes in order when captions come faster than they ease in', () => {
  // Line 0 opens 1 -> 1.45; line 1 arrives at 1.2, inside that ease, so line 0's fade to 0.45
  // starts at 1.45 instead of 1.2 and ends at 1.2 + 0.45 = 1.65. Line 1 opens 1.2 -> 1.65.
  const lines = chain([{ start: 1 }, { start: 1.2 }], 5);
  const round = (stops: { t: number; open: boolean; opacity: number }[]) =>
    stops.map((s) => ({ ...s, t: +s.t.toFixed(3) }));
  assert.deepEqual(lines.map(round), [
    [
      { t: 0, open: false, opacity: 0 },
      { t: 1, open: false, opacity: 0 },
      { t: 1.45, open: true, opacity: 1 },
      { t: 1.45, open: true, opacity: 1 },
      { t: 1.65, open: true, opacity: 0.45 },
      { t: 5, open: true, opacity: 0.45 },
    ],
    [
      { t: 0, open: false, opacity: 0 },
      { t: 1.2, open: false, opacity: 0 },
      { t: 1.65, open: true, opacity: 1 },
      { t: 5, open: true, opacity: 1 },
    ],
  ]);
});
