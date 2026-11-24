// Gets the skill ready to record; safe to rerun, it only does what is missing.
// Usage: node src/setup.js [--ios]
// Plain JavaScript, so an old Node prints the version it needs instead of failing on TypeScript.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const fail = (message) => {
  console.error(`setup: ${message}`);
  process.exit(1);
};
const has = (cmd, args) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const run = (cmd, args, env = process.env) => {
  console.log(`setup: ${cmd} ${args.join(' ')}`);
  if (spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env }).status !== 0) fail(`${cmd} ${args[0]} failed`);
};
const bin = (name) => path.join(root, 'node_modules', '.bin', name);

// e2e's own floor (package.json engines); these versions also run the skill's .ts files as they are.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
if (!(major >= 25 || (major === 24 && minor >= 8) || (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)))))
  fail(`Node ${pkg.engines.node} is needed, this is ${process.version}`);

const brew = process.platform === 'darwin' ? 'brew install ffmpeg' : 'your package manager, such as apt install ffmpeg';
for (const tool of ['ffmpeg', 'ffprobe']) if (!has(tool, ['-version'])) fail(`${tool} is missing: install it with ${brew}`);

if (process.argv.includes('--ios')) {
  if (process.platform !== 'darwin') fail('iOS Simulator capture needs macOS with Xcode');
  let list = '';
  try {
    list = execFileSync('xcrun', ['simctl', 'list', 'devices', 'available'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    fail('xcrun simctl is missing: install Xcode, then run xcode-select -s /Applications/Xcode.app');
  }
  if (!/iPhone/.test(list)) fail('no iPhone simulator: add one in Xcode > Settings > Components');
}

// Install only when a pinned package is missing or at another version: `npm ci` removes the adapter below.
const stale = Object.entries(pkg.dependencies).some(([name, version]) => {
  const file = path.join(root, 'node_modules', name, 'package.json');
  return !existsSync(file) || JSON.parse(readFileSync(file, 'utf8')).version !== version;
});
// A checkout with dev packages (TypeScript) keeps them; an installed skill never fetches them.
const omit = existsSync(path.join(root, 'node_modules', 'typescript')) ? [] : ['--omit=dev'];
if (stale) run('npm', ['ci', ...omit, '--no-audit', '--no-fund']);

// Both no-ops when their browser is already downloaded.
run(bin('playwright'), ['install', 'chromium']);
run(bin('hyperframes'), ['browser', 'ensure'], { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' });

// The adapter lets `agent.act` goals run on the harness's own login. Imported only now: agent.ts needs the packages.
const { adapters, inside, installed } = await import('./agent.ts');
const forced = process.env.SCREEN_CAPTURE_AGENT;
const want = forced === 'claude' || forced === 'codex' ? forced : forced === 'none' ? undefined : inside(process.env)[0];
if (!want) console.log('setup: no Claude Code or Codex here, so goals run their exact fallback steps');
else if (!installed(want)) run('npm', ['install', '--no-save', ...omit, '--no-audit', '--no-fund', adapters[want]]);

console.log('setup: ready');
