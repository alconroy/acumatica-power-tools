export const sidePanel = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.sidePanel;
export const sidebarAction = (globalThis as typeof globalThis & {
  browser?: { sidebarAction?: { open(): Promise<void> } }
}).browser?.sidebarAction;

/** Invoke synchronously in the user-action handler, before any await. */
export function openPanel(tabId?: number): Promise<void> {
  if (sidePanel?.open && typeof tabId === 'number') return sidePanel.open({ tabId }).catch(() => undefined);
  if (sidebarAction?.open) return sidebarAction.open().catch(() => undefined);
  return Promise.resolve();
}

export function hasHostAccessRequest(): boolean {
  return typeof hostAccessRequest === 'function';
}
// Optional Chromium capability; Firefox need not implement it.
const hostAccessRequest = Reflect.get(chrome.permissions, 'addHostAccessRequest') as
  ((request: { tabId: number }) => Promise<void>) | undefined;
export function offerHostAccess(tabId: number): Promise<void> {
  return hostAccessRequest?.call(chrome.permissions, { tabId }).catch(() => undefined) ?? Promise.resolve();
}
