import { openPanel, sidePanel, hasHostAccessRequest, offerHostAccess } from './browser';
import { isHostAccessError } from '../../../packages/core/src/chrome';
import { profilePattern } from '../../../packages/core/src/environments';
import type { EnvironmentProfile } from '../../../packages/core/src/types';

const SCRIPT_ID = 'acumatica-toolkit-badge';
let synchronization: Promise<void> = Promise.resolve();
export function synchronize(): Promise<void> {
  synchronization = synchronization.catch(() => undefined).then(async () => {
    const { environmentProfiles = [] } = await chrome.storage.local.get('environmentProfiles') as { environmentProfiles?: EnvironmentProfile[] };
    const patterns = [...new Set(environmentProfiles.map(profilePattern))];
    const granted: string[] = [];
    for (const pattern of patterns) if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    if (granted.length) {
      const registration: chrome.scripting.RegisteredContentScript = { id: SCRIPT_ID, matches: granted, js: ['content.js'], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true };
      try { await chrome.scripting.registerContentScripts([registration]); }
      catch (error) {
        // Firefox may reject persistence; only retry that explicitly named option.
        if (!/persistAcrossSessions/i.test(String(error))) throw error;
        delete registration.persistAcrossSessions;
        await chrome.scripting.registerContentScripts([registration]);
      }
    }
  });
  return synchronization;
}
if (sidePanel?.setPanelBehavior) void sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener(tab => {
  void openPanel(tab.id);
  if (typeof tab.id !== 'number') return;
  const tabId = tab.id;
  void (async () => {
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', files: ['bridge.js'] });
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'ISOLATED', files: ['content.js'] });
    } catch (error) {
      if (isHostAccessError(error) && hasHostAccessRequest()) {
        await offerHostAccess(tabId);
      }
    }
  })();
});

const syncBadges = () => void synchronize().catch(() => undefined);
chrome.runtime.onInstalled.addListener(() => {
  syncBadges();
  // Screens was retired in 1.0.16: drop its recent Screen IDs and new-tab preference from earlier installs.
  void Promise.resolve(chrome.storage.local.remove(['recentScreens', 'openScreensInNewTab'])).catch(() => undefined);
});
chrome.runtime.onStartup.addListener(syncBadges);
chrome.permissions.onAdded.addListener(syncBadges);
chrome.permissions.onRemoved.addListener(removed => {
  syncBadges();
  if (!removed.origins?.length) return;
  void chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.filter(tab => typeof tab.id === 'number').map(tab => chrome.tabs.sendMessage(tab.id!, { type: 'TOOLKIT_ACCESS_REVOKED', origins: removed.origins })))).catch(() => undefined);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'TOOLKIT_SYNC_BADGES') {
    void synchronize().then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === 'TOOLKIT_OPEN_PANEL') void openPanel(sender.tab?.id);
});
