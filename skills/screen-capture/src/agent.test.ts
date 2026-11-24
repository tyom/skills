import { expect, test } from 'bun:test';
import { pickHarness } from './agent.ts';

test('picks the override, then the harness it runs in, then an installed adapter, else none', () => {
  const both = () => true;
  const none = () => false;
  const onlyCodex = (h: string) => h === 'codex';
  expect(pickHarness({ SCREEN_CAPTURE_AGENT: 'codex', CLAUDECODE: '1' }, both)).toBe('codex');
  expect(pickHarness({ SCREEN_CAPTURE_AGENT: 'none' }, both)).toBe('none');
  expect(pickHarness({ CODEX_THREAD_ID: 'x' }, both)).toBe('codex');
  expect(pickHarness({ CLAUDECODE: '1' }, both)).toBe('claude');
  // Inside Claude Code without its adapter: use the one that is installed.
  expect(pickHarness({ CLAUDECODE: '1' }, onlyCodex)).toBe('codex');
  expect(pickHarness({}, both)).toBe('claude');
  expect(pickHarness({}, none)).toBe('none');
});
