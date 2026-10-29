import { expect, it, vi } from 'vitest';
import { mountInspector } from '../../apps/toolkit/src/features/inspector/content';
it('ignores a resolver command while the stored experimental setting is off', async () => {
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ experimentalClassicResolver: false }) } } });
  const notify = vi.fn().mockResolvedValue(undefined);
  const inspector = mountInspector({ sendMessage: notify } as unknown as typeof chrome.runtime);
  const bridge = vi.spyOn(window, 'postMessage');
  await inspector.onMessage({ type: 'TOOLKIT_RESOLVE_CLASSIC_METADATA' });
  expect(bridge).not.toHaveBeenCalled(); expect(notify).toHaveBeenCalledTimes(1);
  inspector.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
