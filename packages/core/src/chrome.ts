export async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  // A side-panel page can receive a perfectly usable Tab with its URL omitted.
  // activeTab authorizes scripting against the tab ID after the toolbar action
  // is clicked, so requiring `url` here rejects a valid Chrome response.
  if (typeof tab?.id !== 'number') throw new Error('No active browser tab is available.');
  return tab;
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function isHostAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cannot access contents|must request permission|missing host permission|cannot access.*url/i.test(message);
}

/** Chrome errors raised when a tab or frame navigates or closes mid-injection; the next page load injects again. */
export function isTransientNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /frame with id \d+ was removed|no frame with id|no tab with id|the tab was closed/i.test(message);
}

export async function requestCurrentSiteAccess(tabId: number): Promise<void> {
  await chrome.permissions.addHostAccessRequest({ tabId });
}

export function storageGet<T>(key: string, fallback: T): Promise<T> {
  return chrome.storage.local.get(key).then(result => (result[key] as T | undefined) ?? fallback);
}

export function storageSet<T>(key: string, value: T): Promise<void> {
  return chrome.storage.local.set({ [key]: value });
}
