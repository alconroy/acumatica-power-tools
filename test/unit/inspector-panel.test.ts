import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mountInspectorPanel } from '../../apps/toolkit/src/features/inspector/panel';
import { extractFieldContext } from '../../packages/core/src/page';
import type { PanelServices } from '../../apps/toolkit/src/services';

it('shows the Classic resolver only when enabled and preserves technical rows and history', async () => {
  let flag = false;
  const changed: (() => void)[] = [];
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ experimentalClassicResolver: flag }) }, onChanged: { addListener: (fn: () => void) => changed.push(fn) } } });
  document.body.innerHTML = '<input id="sample" data-field="Description">';
  const result = extractFieldContext(document.querySelector('input')!, false); result.page.ui = 'classic';
  result.field = { state: 'unavailable' }; result.dac = { state: 'unavailable' };
  document.body.innerHTML = readFileSync('apps/toolkit/public/panel.html', 'utf8');
  const services = { tabId: 7, page: null, field: null, setField: vi.fn() } as unknown as PanelServices;
  const feature = mountInspectorPanel(document.querySelector('[data-feature="inspect"]')!, services);
  feature.onTabChanged(); await Promise.resolve();
  feature.onMessage({ type: 'TOOLKIT_FIELD_RESULT', result }, { tab: { id: 7 }, frameId: 0 } as chrome.runtime.MessageSender);
  expect(document.querySelector<HTMLElement>('#classic-resolver')!.hidden).toBe(true);
  expect(document.querySelector('#details')!.textContent).toContain('Not exposed by this UI');
  expect(document.querySelector('#history')!.children).toHaveLength(1);
  flag = true; changed[0](); await Promise.resolve();
  expect(document.querySelector<HTMLElement>('#classic-resolver')!.hidden).toBe(false);
  feature.onTabChanged(); expect(document.querySelector('#history')!.children).toHaveLength(0);
  vi.unstubAllGlobals();
});

function mountWithTabs() {
  const updated: ((tabId: number, change: { status?: string; url?: string }) => void)[] = [];
  const removed: ((tabId: number) => void)[] = [];
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => undefined } },
    tabs: { onUpdated: { addListener: (fn: never) => updated.push(fn) }, onRemoved: { addListener: (fn: never) => removed.push(fn) } }
  });
  document.body.innerHTML = '<input id="sample" data-field="Description">';
  const result = extractFieldContext(document.querySelector('input')!, false);
  document.body.innerHTML = readFileSync('apps/toolkit/public/panel.html', 'utf8');
  const services = { tabId: 7, page: null, field: null, setField: vi.fn() } as unknown as PanelServices;
  const feature = mountInspectorPanel(document.querySelector('[data-feature="inspect"]')!, services);
  feature.onTabChanged();
  feature.onMessage!({ type: 'TOOLKIT_FIELD_RESULT', result }, { tab: { id: 7 }, frameId: 3 } as chrome.runtime.MessageSender);
  const switchTo = (tabId: number) => { const previous = services.tabId; services.tabId = tabId; feature.onTabChanged(previous); };
  return { feature, services, result, updated, removed, switchTo };
}

const history = () => document.querySelector('#history')!.children.length;

it('restores a tab\'s inspection after switching away, as when a DAC link opens a new tab', () => {
  const { feature, services, result, switchTo } = mountWithTabs();
  expect(history()).toBe(1);
  switchTo(8);
  expect(history()).toBe(0);
  switchTo(7);
  expect(history()).toBe(1);
  expect(services.setField).toHaveBeenLastCalledWith(result);
  // Reinjection announces every frame; another frame's document must not clear the restored field.
  feature.onMessage!({ type: 'TOOLKIT_PAGE_READY', page: { ...result.page, documentId: 'top-frame' } }, { tab: { id: 7 }, frameId: 0 } as chrome.runtime.MessageSender);
  expect(history()).toBe(1);
  // A new document in the inspected frame is navigation and still clears.
  feature.onMessage!({ type: 'TOOLKIT_PAGE_READY', page: { ...result.page, documentId: 'reloaded' } }, { tab: { id: 7 }, frameId: 3 } as chrome.runtime.MessageSender);
  expect(history()).toBe(0);
  vi.unstubAllGlobals();
});

it('drops a parked inspection when its tab navigates or closes, and never restores on a navigation clear', () => {
  const navigated = mountWithTabs();
  navigated.switchTo(8);
  navigated.updated.forEach(fn => fn(7, { status: 'loading' }));
  navigated.switchTo(7);
  expect(history()).toBe(0);
  vi.unstubAllGlobals();

  const closed = mountWithTabs();
  closed.switchTo(8);
  closed.removed.forEach(fn => fn(7));
  closed.switchTo(7);
  expect(history()).toBe(0);
  vi.unstubAllGlobals();

  const reloaded = mountWithTabs();
  reloaded.feature.onTabChanged();
  expect(history()).toBe(0);
  vi.unstubAllGlobals();
});

it('shows Copied feedback on Copy for AI as on Copy technical context', async () => {
  mountWithTabs();
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const copyAi = document.querySelector<HTMLButtonElement>('#copy-ai')!;
  copyAi.click();
  await vi.waitFor(() => expect(copyAi.textContent).toBe('Copied ✓'));
  expect(copyAi.classList.contains('copied')).toBe(true);
  expect(writeText).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
