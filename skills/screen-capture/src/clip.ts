// Writes a recorder's output: clip.mp4 (constant 60fps H.264) and clip.json, which compose reads.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { takeEvents } from './events.ts';
import type { Clip, Size } from './timeline.ts';

export const FPS = 60;

export type RecordedClip = Clip & { viewport: Size; video: Size };

/**
 * Encodes `input` (ffmpeg input args, then `filter` steps ending in a comma) from `t0` to `end` (ms),
 * and records the page size as the pixel size over `ratio`, the device pixels per CSS pixel.
 */
export function writeClip(dir: string, { input, filter = '', t0, end, ratio }: { input: string[]; filter?: string; t0: number; end: number; ratio: number }) {
  const file = path.join(dir, 'clip.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', ...input,
    // H.264 4:2:0 needs even sizes: an odd edge (375px at 3x) loses one pixel.
    '-vf', `${filter}crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
    '-t', ((end - t0) / 1000).toFixed(3), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium',
    '-g', String(FPS), '-movflags', '+faststart', file,
  ]);
  const [width, height] = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
  ]).toString().trim().split(',').map(Number);
  const clip: RecordedClip = {
    startedAt: t0,
    endedAt: end,
    viewport: { width: Math.round(width / ratio), height: Math.round(height / ratio) },
    video: { width, height },
    events: takeEvents(),
  };
  writeFileSync(path.join(dir, 'clip.json'), JSON.stringify(clip, null, 2));
  return { file: 'clip.mp4' };
}
