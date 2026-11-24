// Pure mapping from a recorded clip (clip.json) to composition time and layout.
import type { CaptureEvent } from './events.ts';

export interface Clip {
  startedAt: number;
  endedAt: number;
  events: CaptureEvent[];
}

const sec = (ms: number) => Math.round(Math.max(0, ms)) / 1000;

export function timeline({ startedAt, endedAt, events }: Clip) {
  // begin() moves the clip's start; everything stamped before it is dropped.
  const mark = events.findLast((e) => e.kind === 'begin')?.t;
  const begin = mark ?? startedAt;
  const duration = sec(endedAt - begin);
  const sorted = events.filter((e) => mark === undefined || e.t >= mark).sort((a, b) => a.t - b.t);
  const texts = sorted.filter((e) => e.kind === 'caption');
  const captions = texts.map((e, i) => ({
    start: sec(e.t - begin),
    end: i + 1 < texts.length ? sec(texts[i + 1].t - begin) : duration,
    text: e.text,
  }));
  const pointer = sorted
    .filter((e) => e.kind === 'tap' || e.kind === 'hover')
    .map(({ t, kind, x, y }) => ({ t: sec(t - begin), kind, x, y }));
  return { offset: sec(begin - startedAt), duration, captions, pointer };
}

export type Panel = 'none' | 'side' | 'bottom';
interface Size {
  width: number;
  height: number;
}

/** Places the cropped page (`page`, CSS px) and the text panel on a `canvas` of output pixels. */
export function layout(canvas: Size, panel: Panel, page: Size, margin = 32) {
  const inner = { width: canvas.width - 2 * margin, height: canvas.height - 2 * margin };
  let area = { x: margin, y: margin, ...inner };
  let text: (Size & { x: number; y: number }) | null = null;
  if (panel === 'side') {
    const width = Math.round(canvas.width * 0.26);
    area = { ...area, width: inner.width - width - margin };
    text = { x: canvas.width - margin - width, y: margin, width, height: inner.height };
  } else if (panel === 'bottom') {
    const height = Math.round(canvas.height * 0.2);
    area = { ...area, height: inner.height - height - margin };
    text = { x: margin, y: canvas.height - margin - height, width: inner.width, height };
  }
  const scale = Math.min(area.width / page.width, area.height / page.height);
  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);
  const slot = {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + (area.height - height) / 2),
    width,
    height,
    scale,
  };
  // The panel stays next to the page, and the pair is centred, so a short page leaves no gap.
  if (text && panel === 'side') {
    slot.x = Math.round((canvas.width - (width + margin + text.width)) / 2);
    text.x = slot.x + width + margin;
  } else if (text && panel === 'bottom') {
    slot.y = Math.round((canvas.height - (height + margin + text.height)) / 2);
    text.y = slot.y + height + margin;
  }
  return { slot, panel: text };
}

/**
 * For each output frame of a constant-rate clip from `start` to `end` (ms), the index of the
 * latest captured frame at that moment (`frames` are capture times, ascending).
 */
export function resample(frames: number[], start: number, end: number, fps: number) {
  const count = Math.ceil(((end - start) * fps) / 1000);
  const picks: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const t = start + (k * 1000) / fps;
    while (j + 1 < frames.length && frames[j + 1] <= t) j++;
    picks.push(j);
  }
  return picks;
}

/** Opacity of a caption line when it is the newest, then one, two and three lines older. */
const FADE = [1, 0.45, 0.18, 0];
/** Seconds a caption line takes to open, or to fade one step. */
const EASE = 0.45;

/**
 * Keyframes for the caption chain, one list per caption (times in seconds). A line opens at its
 * start, pushing older lines up; each newer caption fades it one step, until it leaves.
 */
export function chain(captions: { start: number }[], duration: number) {
  return captions.map((c, i) => {
    const stops = [
      { t: 0, open: false, opacity: 0 },
      { t: c.start, open: false, opacity: 0 },
      { t: c.start + EASE, open: true, opacity: 1 },
    ];
    for (let k = 1; k < FADE.length && i + k < captions.length; k++) {
      const t = captions[i + k].start;
      stops.push({ t, open: true, opacity: FADE[k - 1] }, { t: t + EASE, open: true, opacity: FADE[k] });
    }
    stops.push({ ...stops.at(-1)!, t: duration });
    // Captions closer than EASE apart would put stops out of order.
    for (let k = 1; k < stops.length; k++) stops[k].t = Math.max(stops[k].t, stops[k - 1].t);
    return stops;
  });
}

/**
 * Keyframes for the drawn cursor (times in seconds, points in page CSS px): it rests where the
 * last action was, leaves once that has played, arrives just before the next, and presses on taps.
 */
export function cursor(pointer: { t: number; kind: 'tap' | 'hover'; x: number; y: number }[], start: Point, duration: number) {
  const stops: { t: number; x: number; y: number; scale: number; ease: boolean }[] = [];
  const at = (t: number, p: Point, scale = 1, ease = false) => stops.push({ t, x: p.x, y: p.y, scale, ease });
  let prev = { t: 0, ...start };
  at(0, prev);
  for (const e of pointer) {
    at(Math.max(prev.t + 0.15, e.t - 0.55), prev, 1, true);
    at(e.t - 0.08, e);
    if (e.kind === 'tap') {
      at(e.t, e, 0.82);
      at(e.t + 0.14, e);
    }
    prev = e;
  }
  at(duration, prev);
  return stops;
}

interface Point {
  x: number;
  y: number;
}
