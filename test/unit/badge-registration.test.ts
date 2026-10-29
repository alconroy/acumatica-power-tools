import { expect, it, vi } from 'vitest';

it('registers only granted profile origins and removes the registration with the last profile', async () => {
  let profiles = [
    { id: 'test', name: 'TEST', baseUrl: 'https://test.example', kind: 'TEST', color: '#1769aa' },
    { id: 'dev', name: 'DEV', baseUrl: 'https://dev.example', kind: 'DEV', color: '#1769aa' }
  ];
  let registered: chrome.scripting.RegisteredContentScript[] = [];
  const hooks: Record<string, Function> = {};
  const event = (name: string) => ({ addListener: (fn: Function) => { hooks[name] = fn; } });
  const remove = vi.fn(async () => undefined);
  const register = vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => { registered = scripts; });
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({ environmentProfiles: profiles }), remove } },
    permissions: { contains: async ({ origins }: { origins: string[] }) => origins[0] === 'https://test.example/*', onAdded: event('added'), onRemoved: event('removed') },
    scripting: { getRegisteredContentScripts: async () => registered, unregisterContentScripts: async () => { registered = []; }, registerContentScripts: register },
    runtime: { onInstalled: event('installed'), onStartup: event('startup'), onMessage: event('message') },
    action: { onClicked: event('click') }, tabs: { query: async () => [] }
  });
  vi.resetModules(); const { synchronize } = await import('../../apps/toolkit/src/background');
  await synchronize(); expect(registered).toHaveLength(1);
  expect(registered[0].matches).toEqual(['https://test.example/*']); expect(registered[0].js).toEqual(['content.js']);
  expect(registered[0].allFrames).toBe(true); expect(hooks.installed).toBeTypeOf('function'); expect(hooks.startup).toBeTypeOf('function');
  hooks.installed(); expect(remove).toHaveBeenCalledWith(['recentScreens', 'openScreensInNewTab']);
  profiles = []; await synchronize(); expect(registered).toHaveLength(0);
  vi.unstubAllGlobals();
});
