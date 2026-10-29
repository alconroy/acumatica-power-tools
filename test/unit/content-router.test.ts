import { expect, it, vi } from 'vitest';

it('replaces a previous bundle with one runtime listener and one badge', async () => {
  const listeners = new Set<unknown>();
  const changed = new Set<unknown>();
  document.title = 'Acumatica fixture';
  const chromeStub = {
    runtime: { sendMessage: vi.fn().mockResolvedValue(undefined), onMessage: { addListener: (fn: unknown) => listeners.add(fn), removeListener: (fn: unknown) => listeners.delete(fn) } },
    storage: { local: { get: async () => ({ environmentProfiles: [{ id: 'test', name: 'Fixture TEST', baseUrl: location.origin, kind: 'TEST', color: '#1769aa' }] }) }, onChanged: { addListener: (fn: unknown) => changed.add(fn), removeListener: (fn: unknown) => changed.delete(fn) } }
  };
  vi.stubGlobal('chrome', chromeStub);
  await import('../../apps/toolkit/src/content'); await Promise.resolve();
  const previous = globalThis.__acumaticaToolkit!; const dispose = vi.spyOn(previous, 'dispose');
  vi.resetModules(); await import('../../apps/toolkit/src/content'); await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce(); expect(listeners.size).toBe(1); expect(changed.size).toBe(1);
  expect(document.querySelectorAll('#acumatica-toolkit-badge')).toHaveLength(1);
  // Centred at the bottom, clear of the pager and navigation buttons in the bottom-right corner.
  const { style } = document.getElementById('acumatica-toolkit-badge')!;
  expect([style.left, style.right, style.bottom, style.transform]).toEqual(['50%', '', '12px', 'translateX(-50%)']);
  globalThis.__acumaticaToolkit!.dispose(); expect(listeners.size).toBe(0); expect(changed.size).toBe(0);
  vi.unstubAllGlobals();
});

it('can load and dispose with an invalidated extension runtime', async () => {
  vi.stubGlobal('chrome', { runtime: undefined }); vi.resetModules();
  await expect(import('../../apps/toolkit/src/content')).resolves.toBeDefined();
  expect(() => globalThis.__acumaticaToolkit!.dispose()).not.toThrow(); vi.unstubAllGlobals();
});
