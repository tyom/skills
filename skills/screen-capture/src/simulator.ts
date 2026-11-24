// An e2e DeviceProvider for a local iOS Simulator whose `record` writes the same
// clip.mp4 and clip.json as the web recorder: native pixels, constant 60fps H.264.
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DeviceProvider } from '@e2e-dev/mobile';
import { startEvents, takeEvents } from './events.ts';

export interface SimulatorOptions {
  /** Simulator name, such as `iPhone 17 Pro`. Default: a booted iPhone, else the last one listed (the newest iOS). */
  device?: string;
  /** Pixels per point: 3 on current iPhones, 2 on iPads. */
  scale?: number;
  fps?: number;
  /** Seconds the last frame stays on screen. */
  hold?: number;
}

interface Sim {
  udid: string;
  name: string;
  state: string;
}

const simctl = (...args: string[]) => execFileSync('xcrun', ['simctl', ...args]).toString();

function pick(name: string | undefined): Sim {
  const runtimes: Record<string, Sim[]> = JSON.parse(simctl('list', 'devices', 'available', '-j')).devices;
  const sims = Object.entries(runtimes)
    .filter(([runtime]) => runtime.includes('iOS'))
    // simctl lists runtimes in no set order: sort by version (`…SimRuntime.iOS-26-4`), oldest first.
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .flatMap(([, list]) => list);
  const named = name ? sims.filter((s) => s.name === name) : sims.filter((s) => s.name.startsWith('iPhone'));
  const sim = named.find((s) => s.state === 'Booted') ?? named.at(-1);
  if (!sim) throw new Error(`screen-capture: no iOS simulator named "${name ?? 'iPhone*'}" (xcrun simctl list devices)`);
  return sim;
}

export function simulator({ device, scale = 3, fps = 60, hold = 1 }: SimulatorOptions = {}): DeviceProvider {
  return {
    name: 'screen-capture-simulator',
    async acquire() {
      const sim = pick(device);
      if (sim.state !== 'Booted') simctl('bootstatus', sim.udid, '-b');
      // The status bar every product shot uses, instead of the Mac's clock and battery.
      simctl('status_bar', sim.udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100',
        '--cellularBars', '4', '--wifiBars', '3');
      // `client: {}` drives the device through the local agent-device daemon.
      return { id: sim.udid, deviceId: sim.udid, client: {} };
    },
    async release(lease) {
      simctl('status_bar', lease.id, 'clear');
    },
    async record(lease) {
      const work = mkdtempSync(path.join(tmpdir(), 'screen-capture-sim-'));
      const raw = path.join(work, 'raw.mp4');
      startEvents({ pageTaps: false });
      const child: ChildProcess = spawn('xcrun', ['simctl', 'io', lease.id, 'recordVideo', '--codec=h264', '--force', raw]);
      // simctl writes the first frame when it prints this line: that is the clip's time zero.
      await new Promise<void>((resolve, reject) => {
        let log = '';
        const onData = (d: Buffer) => {
          log += d;
          if (log.includes('Recording started')) resolve();
        };
        child.stdout!.on('data', onData);
        child.stderr!.on('data', onData);
        child.on('exit', (code) => reject(new Error(`simctl recordVideo exited with ${code}: ${log}`)));
      });
      const t0 = Date.now();
      return {
        startedAt: new Date(t0).toISOString(),
        async stop({ dir }) {
          // Let the last step's effect paint, then hold the final screen.
          await new Promise((r) => setTimeout(r, 300));
          const end = Date.now() + hold * 1000;
          await new Promise((r) => setTimeout(r, end - Date.now()));
          // A recorder that already died has fired its exit event; waiting for it would hang.
          if (child.exitCode === null && child.signalCode === null) {
            const exited = new Promise((r) => child.once('exit', r));
            child.kill('SIGINT');
            await exited;
          }
          const seconds = ((end - t0) / 1000).toFixed(3);
          // simctl writes frames only on change: resample to a constant rate and pad a still ending to `end`.
          execFileSync('ffmpeg', [
            '-v', 'error', '-y', '-i', raw,
            '-vf', `fps=${fps},tpad=stop_mode=clone:stop_duration=${seconds},crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`,
            '-t', seconds, '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-g', String(fps),
            '-movflags', '+faststart', path.join(dir, 'clip.mp4'),
          ]);
          const [width, height] = execFileSync('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0',
            path.join(dir, 'clip.mp4'),
          ]).toString().trim().split(',').map(Number);
          writeFileSync(
            path.join(dir, 'clip.json'),
            JSON.stringify(
              {
                startedAt: t0,
                endedAt: end,
                viewport: { width: Math.round(width / scale), height: Math.round(height / scale) },
                video: { width, height },
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
