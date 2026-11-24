import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHarness } from './agent.ts';

test('picks the override, then the harness it runs in, then an installed adapter, else none', () => {
  const both = () => true;
  const none = () => false;
  const onlyCodex = (h: string) => h === 'codex';
  assert.equal(pickHarness({ SCREEN_CAPTURE_AGENT: 'codex', CLAUDECODE: '1' }, both), 'codex');
  assert.equal(pickHarness({ SCREEN_CAPTURE_AGENT: 'none' }, both), 'none');
  assert.equal(pickHarness({ CODEX_THREAD_ID: 'x' }, both), 'codex');
  assert.equal(pickHarness({ CLAUDECODE: '1' }, both), 'claude');
  // Inside Claude Code without its adapter: use the one that is installed.
  assert.equal(pickHarness({ CLAUDECODE: '1' }, onlyCodex), 'codex');
  assert.equal(pickHarness({}, both), 'claude');
  assert.equal(pickHarness({}, none), 'none');
});
