import { activeTab, isHostAccessError, isTransientNavigationError } from '../../../packages/core/src/chrome';
import { classifyEnvironment, environmentLabel } from '../../../packages/core/src/environments';
import { isApplicationUrl, preferPageContext } from '../../../packages/core/src/page';
import type { EnvironmentProfile, PageContext } from '../../../packages/core/src/types';
import { mountInspectorPanel } from './features/inspector/panel';
import { mountEnvironmentPanel } from './features/environment/panel';
import { mountLinksPanel } from './features/links/panel';
import type { PanelServices, PanelFeature } from './services';
import { watchTheme } from './theme';
watchTheme();
const status = document.querySelector<HTMLElement>('#site-status')!;
const grant = document.querySelector<HTMLButtonElement>('#grant-access')!;
let pending: (() => Promise<void>) | null = null;
let pendingOrigin = '';
let retrying = false;
let generation = 0;
const services: PanelServices = {
  page: null, field: null,
  async getTab() {
    const tab = await activeTab();
    if (services.tabId !== tab.id) { const previousTabId = services.tabId; services.tabId = tab.id; clear(previousTabId); }
    return tab;
  },
  async ensureInjected(tabId) {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN', files: ['bridge.js'] });
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'ISOLATED', files: ['content.js'] });
  },
  send(tabId, command, frameId) { return chrome.tabs.sendMessage(tabId, command, frameId === undefined ? undefined : { frameId }); },
  async run(action) {
    try {
      await action(); pending = null; grant.hidden = true; status.textContent = '';
    } catch (error) {
      if (isHostAccessError(error)) {
        const tab = await services.getTab(); requestSiteAccess(tab.url, action);
      } else if (!isTransientNavigationError(error)) status.textContent = error instanceof Error ? error.message : 'This page is unavailable.';
    }
  },
  setField(field) { services.field = field; const page = preferPageContext(services.page, field.page); if (page) updateContext(page); }
};
const features: PanelFeature[] = [
  mountInspectorPanel(document.querySelector('[data-feature="inspect"]')!, services),
  mountEnvironmentPanel(document.querySelector('[data-feature="environment"]')!, services),
  mountLinksPanel(document.querySelector('[data-feature="links"]')!, services)
];
for (const feature of features) feature.mount(document.querySelector('[data-feature="' + feature.id + '"]')!);
function clear(previousTabId?: number) {
  generation++;
  services.page = null; services.field = null; pending = null; pendingOrigin = ''; grant.hidden = true;
  document.querySelector('#page-context')!.textContent = 'Open an Acumatica page first.';
  document.querySelector('#environment-badge')!.textContent = 'UNCLASSIFIED';
  // Features run last so a restored tab's context is not overwritten by the reset above.
  for (const feature of features) feature.onTabChanged(previousTabId);
}
function updateContext(page: PageContext) {
  services.page = page;
  document.querySelector('#page-context')!.textContent = (page.screenId.value || 'Not exposed by this UI') + ' · ' + page.ui + ' UI';
  for (const feature of features) feature.onPageContext(page);
  const currentGeneration = generation;
  void chrome.storage.local.get('environmentProfiles').then(settings => {
    if (currentGeneration !== generation) return;
    const profile = classifyEnvironment(page.url, (settings.environmentProfiles || []) as EnvironmentProfile[]);
    const badge = document.querySelector<HTMLElement>('#environment-badge')!;
    badge.textContent = profile ? environmentLabel(profile) : 'UNCLASSIFIED'; badge.style.background = profile?.color || '#68717b';
  });
}
function requestSiteAccess(url: string | undefined, action: () => Promise<void>) {
  if (!url || !/^https?:/.test(url)) {
    status.textContent = 'Click the toolbar button while on the Acumatica tab, then try again.'; return;
  }
  pending = action; pendingOrigin = new URL(url).origin + '/*';
  status.textContent = 'Grant site access to continue.';
  grant.textContent = 'Grant access to ' + new URL(url).origin; grant.hidden = false;
}
async function retryPending() {
  if (!pending || retrying) return;
  const action = pending; retrying = true;
  try { await services.run(action); } finally { retrying = false; }
}
grant.addEventListener('click', () => {
  const permission = chrome.permissions.request({ origins: [pendingOrigin] });
  void permission.then(granted => { if (granted) return retryPending(); status.textContent = 'Site access was denied.'; }).catch(error => { status.textContent = String(error); });
});
chrome.permissions.onAdded.addListener(() => void retryPending());
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab?.id !== services.tabId) return;
  // A blank or srcdoc frame has no site address, so its page reports never change the context.
  if ((message.type === 'TOOLKIT_PAGE_READY' || message.type === 'TOOLKIT_PAGE_CHANGED') && isApplicationUrl(message.page?.url || '')) {
    const previous = services.page;
    if (message.type === 'TOOLKIT_PAGE_CHANGED') clear();
    const page = preferPageContext(previous, message.page);
    if (page) updateContext(page);
  }
  for (const feature of features) feature.onMessage?.(message, sender);
});
chrome.tabs.onActivated.addListener(() => {
  // getTab clears and reports the previous tab when the active tab changed.
  void services.getTab().then(tab => services.run(() => services.ensureInjected(tab.id!))).catch(() => clear());
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (id !== services.tabId) return;
  if (change.status === 'loading' || change.url) clear();
  if (change.status === 'complete' || (change.url && change.status !== 'loading')) void services.run(() => services.ensureInjected(id));
});
chrome.storage.onChanged.addListener(() => { if (services.page) updateContext(services.page); });
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll<HTMLElement>('[data-feature]').forEach(section => { section.hidden = section.dataset.feature !== button.dataset.tab; });
    document.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
  });
});
document.querySelector('#options')!.addEventListener('click', () => void chrome.runtime.openOptionsPage());
void services.getTab().then(tab => services.run(() => services.ensureInjected(tab.id!))).catch(() => undefined);
