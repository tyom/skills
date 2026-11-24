// The one module flows and configs import, so they share this skill's single copy of e2e.
export { test, expect } from 'e2e';
export type { E2EConfig } from 'e2e';
export { web } from '@e2e-dev/web';
export { recorder } from './provider.ts';
export { simulator } from './simulator.ts';
export { mobile } from '@e2e-dev/mobile';
export { act, begin, caption, tap, hover, type, pause } from './events.ts';
export { agents } from './agent.ts';

/** Viewports in CSS pixels. */
export const viewports = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
} as const;
