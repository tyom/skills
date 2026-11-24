// An e2e BrowserProvider whose `record` replaces e2e's 25fps, 1x screencast with
// frames captured at the device pixel ratio, encoded to constant-rate H.264.
import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BrowserProvider } from '@e2e-dev/web';
import { push, startEvents } from './events.ts';
import { FPS, writeClip } from './clip.ts';
import { resample } from './timeline.ts';

const procs = new Map<string, ChildProcess>();

export interface RecorderOptions {
  /** Device pixel ratio of the captured frames. */
  dpr?: number;
  /** Seconds the last frame stays on screen. */
  hold?: number;
}

export function recorder({ dpr = 2, hold = 1 }: RecorderOptions = {}): BrowserProvider {
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
        const onData = (d: Buffer) => {
          log += d;
          const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
          if (!m) return;
          child.stderr!.off('data', onData);
          resolve(m[1]);
        };
        child.stderr!.on('data', onData);
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
      const writes: Promise<void>[] = [];
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
          // Frames go to disk as they arrive, off the event loop: a minute at 2x is about 1 GB in memory.
          writes.push(writeFile(path.join(work, `${frames.length}.jpg`), data));
          frames.push(timestamp);
        },
      });
      return {
        startedAt: new Date(t0).toISOString(),
        async stop({ dir }) {
          // The last step can return before its effect is painted; let the final frames arrive.
          await sleep(300);
          // Chrome sends frames only on change, so a still last screen ends at stop time, not its last frame.
          const end = Math.max(Date.now(), frames.at(-1) ?? 0) + hold * 1000;
          await page.screencast.stop().catch(() => {});
          await browser.close().catch(() => {});
          if (!frames.length) throw new Error('screen-capture: no frames were captured');
          await Promise.all(writes);
          // Constant-rate frames from t0 to `end`, each linked to the latest capture.
          // (The concat demuxer reads each JPEG as a 25fps stream and rounds its duration, losing frames.)
          const cfr = path.join(work, 'cfr');
          mkdirSync(cfr);
          resample(frames, t0, end, FPS).forEach((i, k) =>
            linkSync(path.join(work, `${i}.jpg`), path.join(cfr, `${k}.jpg`)),
          );
          // The pixel ratio this recorder sets: frames sent around a failed check report other units.
          const clip = writeClip(dir, { input: ['-framerate', String(FPS), '-i', path.join(cfr, '%d.jpg')], t0, end, ratio: dpr });
          rmSync(work, { recursive: true, force: true });
          return clip;
        },
      };
    },
  };
}
