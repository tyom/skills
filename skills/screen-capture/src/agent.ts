// Which coding agent runs `agent.act` steps: Claude Code or Codex over ACP, or none.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { claudeCode, codex } from '@e2e-dev/acp';

export type Harness = 'claude' | 'codex' | 'none';

export const adapters = {
  claude: '@agentclientprotocol/claude-agent-acp@0.112.0',
  codex: '@agentclientprotocol/codex-acp@2.12.0',
} as const;

/** `SCREEN_CAPTURE_AGENT` wins; then the harness this runs inside; then any installed adapter. */
export function pickHarness(env: Record<string, string | undefined>, installed: (h: 'claude' | 'codex') => boolean): Harness {
  const forced = env.SCREEN_CAPTURE_AGENT;
  if (forced === 'claude' || forced === 'codex' || forced === 'none') return forced;
  const inside: Harness[] = [];
  if (env.CODEX_THREAD_ID || env.CODEX_SANDBOX || env.CODEX_CI) inside.push('codex');
  if (env.CLAUDECODE) inside.push('claude');
  for (const h of [...inside, 'claude', 'codex'] as const) if (h !== 'none' && installed(h)) return h;
  return 'none';
}

const installed = (h: 'claude' | 'codex') => {
  const name = adapters[h].slice(0, adapters[h].lastIndexOf('@'));
  return existsSync(path.join(import.meta.dirname, '..', 'node_modules', name, 'package.json'));
};

export const harness = (): Harness => pickHarness(process.env, installed);

/** Stands in when no coding agent is available: each goal fails at once, so `act()` runs its exact steps. */
const unavailable = {
  name: 'screen-capture-none',
  async runStep(): Promise<never> {
    throw new Error(`no coding agent: install one adapter in the skill (bun add --no-save ${adapters.claude} or ${adapters.codex})`);
  },
};

/** The config's `agents`: the picked coding agent, or the stand-in. */
export function agents() {
  const h = harness();
  const executor = h === 'claude' ? claudeCode({ model: 'sonnet' }) : h === 'codex' ? codex() : unavailable;
  return { default: { executor } };
}
