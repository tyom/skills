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
  const captions = texts.map((e) => ({ start: sec(e.t - begin), text: e.text }));
  const pointer = sorted.flatMap((e) =>
    e.kind === 'tap' || e.kind === 'hover' ? [{ t: sec(e.t - begin), kind: e.kind, x: e.x, y: e.y }] : [],
  );
  return { offset: sec(begin - startedAt), duration, captions, pointer };
}

export type Panel = 'none' | 'side' | 'bottom';
export interface Size {
  width: number;
  height: number;
}

/**
 * Places the cropped page (`page`, CSS px) and the text panel on a `canvas` of output pixels.
 * Two `panes` show two clips of the page: side by side, or one above the other with `stack`,
 * each under a `label` row of that many pixels.
 */
export function layout(canvas: Size, panel: Panel, page: Size, { panes = 1, stack = false, label = 0 } = {}) {
  const margin = 32;
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
  const cols = stack ? 1 : panes;
  const rows = stack ? panes : 1;
  const scale = Math.min(
    (area.width - (cols - 1) * margin) / (cols * page.width),
    (area.height - (rows - 1) * margin - rows * label) / (rows * page.height),
  );
  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);
  const group = { width: cols * width + (cols - 1) * margin, height: rows * (label + height) + (rows - 1) * margin };
  let x = Math.round(area.x + (area.width - group.width) / 2);
  let y = Math.round(area.y + (area.height - group.height) / 2);
  // The panel stays next to the panes, and the whole is centred, so a short page leaves no gap.
  if (text && panel === 'side') {
    x = Math.round((canvas.width - (group.width + margin + text.width)) / 2);
    text.x = x + group.width + margin;
  } else if (text && panel === 'bottom') {
    y = Math.round((canvas.height - (group.height + margin + text.height)) / 2);
    text.y = y + group.height + margin;
  }
  const slots = Array.from({ length: panes }, (_, i) => ({
    x: stack ? x : x + i * (width + margin),
    y: y + label + (stack ? i * (label + height + margin) : 0),
    width,
    height,
    scale,
  }));
  return { slots, panel: text };
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

/** The part of a clip from `from` to `to` (clip seconds) plays from `at` (output seconds). */
export interface Segment {
  from: number;
  to: number;
  at: number;
}

/**
 * Lines up clips of the same flow so each caption starts at the same output time in all of them.
 * Every stretch between captions lasts as long as the slowest clip's; a faster clip holds its last
 * frame for the rest. All clips must have the same number of captions.
 */
export function align(clips: { captions: { start: number }[]; duration: number }[]) {
  const bounds = clips.map((c) => [0, ...c.captions.map((x) => x.start), c.duration]);
  const lengths = bounds[0].slice(1).map((_, k) => Math.max(...bounds.map((b) => b[k + 1] - b[k])));
  const ats = lengths.reduce((acc, len) => [...acc, acc.at(-1)! + len], [0]);
  return {
    duration: ats.at(-1)!,
    starts: ats.slice(1, -1),
    segments: bounds.map((b) => lengths.map((_, k) => ({ from: b[k], to: b[k + 1], at: ats[k] }))),
  };
}

/** Output time of clip time `t`. */
export function retime(segments: Segment[], t: number) {
  const seg = segments.find((s) => t < s.to) ?? segments.at(-1)!;
  return seg.at - seg.from + t;
}

/**
 * The smallest box (pixels) holding every pixel that differs from the background in any of the
 * RGB frames packed in `data`, each `width` x `height`; null when every frame is background.
 * The background is the most common colour on the first frame's edges.
 */
export function contentBox(data: Uint8Array, width: number, height: number, tolerance = 4) {
  const counts = new Map<number, number>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) continue;
      const i = (y * width + x) * 3;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  const bg = [...counts].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
  const [r, g, b] = [bg >> 16, (bg >> 8) & 255, bg & 255];
  let [left, top, right, bottom] = [width, height, -1, -1];
  for (let i = 0; i + 2 < data.length; i += 3) {
    if (Math.max(Math.abs(data[i] - r), Math.abs(data[i + 1] - g), Math.abs(data[i + 2] - b)) <= tolerance) continue;
    const p = (i / 3) % (width * height);
    const x = p % width;
    const y = Math.floor(p / width);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
