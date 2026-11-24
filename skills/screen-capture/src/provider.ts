// An e2e BrowserProvider whose `record` replaces e2e's 25fps, 1x screencast with
// frames captured at the device pixel ratio, encoded to constant-rate H.264.
import { chromium } from 'playwright';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserProvider } from '@e2e-dev/web';
import { push, takeEvents, startEvents } from './events.ts';
import { resample } from './timeline.ts';

const procs = new Map<string, ChildProcess>();

export interface RecorderOptions {
  /** Device pixel ratio of the captured frames. */
  dpr?: number;
  fps?: number;
  /** Seconds the last frame stays on screen. */
  hold?: number;
}

export function recorder({ dpr = 2, fps = 60, hold = 1 }: RecorderOptions = {}): BrowserProvider {
  return {
    name: 'screen-capture',
    scope: 'attempt',
    async acquire() {
      const dataDir = mkdtempSync(path.join(tmpdir(), 'screen-capture-'));
      const child = spawn(chromium.executablePath(), [
        '--headless=new',
        '--remote-debugging-port=0',
        `--user-data-dir=${dataDir}`,
        `--force-device-scale-factor=${dpr}`,
        '--hide-scrollbars',
        'about:blank',
      ]);
      const ws = await new Promise<string>((resolve, reject) => {
        let log = '';
        child.stderr!.on('data', (d) => {
          log += d;
          const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
          if (m) resolve(m[1]);
        });
        child.on('exit', (code) => reject(new Error(`Chromium exited with ${code}: ${log}`)));
      });
      const id = String(child.pid);
      procs.set(id, child);
      child.on('exit', () => rmSync(dataDir, { recursive: true, force: true }));
      return { id, cdpEndpoint: ws };
    },
    async release(lease) {
      procs.get(lease.id)?.kill();
      procs.delete(lease.id);
    },
    async record(lease) {
      const browser = await chromium.connectOverCDP(lease.cdpEndpoint);
      const page = browser.contexts().flatMap((c) => c.pages()).at(-1)!;
      const work = mkdtempSync(path.join(tmpdir(), 'screen-capture-frames-'));
      const frames: number[] = [];
      startEvents({ pageTaps: true });
      // Every tap, from a helper, raw e2e or agent.act, is logged where and when the page receives it.
      await page.exposeBinding('__screenCaptureTap', (_source, x: number, y: number, t: number) =>
        push({ t, kind: 'tap', x, y }),
      );
      const listen = () =>
        addEventListener(
          'pointerdown',
          (e: PointerEvent) => (window as any).__screenCaptureTap(e.clientX, e.clientY, Date.now()),
          true,
        );
      await page.addInitScript(listen);
      await page.evaluate(listen);
      const t0 = Date.now();
      await page.screencast.start({
        quality: 95,
        size: { width: 8192, height: 8192 },
        onFrame: ({ data, timestamp }) => {
          // Frames go to disk as they arrive: a minute at 2x is about 1 GB in memory.
          writeFileSync(path.join(work, `${frames.length}.jpg`), data);
          frames.push(timestamp);
        },
      });
      return {
        startedAt: new Date(t0).toISOString(),
        async stop({ dir }) {
          // The last step can return before its effect is painted; let the final frames arrive.
          await new Promise((r) => setTimeout(r, 300));
          // Chrome sends frames only on change, so a still last screen ends at stop time, not its last frame.
          const end = Math.max(Date.now(), frames.at(-1) ?? 0) + hold * 1000;
          await page.screencast.stop().catch(() => {});
          await browser.close().catch(() => {});
          if (!frames.length) throw new Error('screen-capture: no frames were captured');
          // Constant-rate frames from t0 to `end`, each linked to the latest capture.
          // (The concat demuxer reads each JPEG as a 25fps stream and rounds its duration, losing frames.)
          const cfr = path.join(work, 'cfr');
          mkdirSync(cfr);
          resample(frames, t0, end, fps).forEach((i, k) =>
            linkSync(path.join(work, `${i}.jpg`), path.join(cfr, `${k}.jpg`)),
          );
          execFileSync('ffmpeg', [
            '-v', 'error', '-y', '-framerate', String(fps), '-i', path.join(cfr, '%d.jpg'),
            // H.264 4:2:0 needs even sizes: an odd edge (375px at 3x) loses one pixel.
            '-vf', 'crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium',
            '-g', String(fps), '-movflags', '+faststart', path.join(dir, 'clip.mp4'),
          ]);
          const size = execFileSync('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
            path.join(dir, 'clip.mp4'),
          ]).toString().trim().split(',').map(Number);
          writeFileSync(
            path.join(dir, 'clip.json'),
            JSON.stringify(
              {
                startedAt: t0,
                endedAt: end,
                // From the pixel ratio this recorder sets: frames sent around a failed check report other units.
                viewport: { width: Math.round(size[0] / dpr), height: Math.round(size[1] / dpr) },
                video: { width: size[0], height: size[1] },
                events: takeEvents(),
              },
              null,
              2,
            ),
          );
          rmSync(work, { recursive: true, force: true });
          return { file: 'clip.mp4' };
        },
      };
    },
  };
}
