import { expect, it, vi } from 'vitest';
import { normalizeTheme, watchTheme } from '../../apps/toolkit/src/theme';

it('applies the stored theme and later changes even without a callback, as in the panel', async () => {
  const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ theme: 'dark' }) }, onChanged: { addListener: (fn: never) => listeners.push(fn) } } });
  watchTheme();
  await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  listeners[0]({ theme: { newValue: 'light' } }, 'local');
  expect(document.documentElement.dataset.theme).toBe('light');
  listeners[0]({ theme: { newValue: 'dark' } }, 'sync');
  expect(document.documentElement.dataset.theme).toBe('light');
  vi.unstubAllGlobals();
});

it('falls back to the system theme for unknown values or missing storage', () => {
  expect(normalizeTheme('purple')).toBe('system');
  vi.stubGlobal('chrome', undefined);
  expect(() => watchTheme()).not.toThrow();
  expect(document.documentElement.dataset.theme).toBe('system');
  vi.unstubAllGlobals();
});
