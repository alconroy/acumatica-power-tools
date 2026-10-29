import type { FieldContext, PageContext } from '../../../packages/core/src/types';
export interface PanelServices {
  tabId?: number; page: PageContext | null; field: FieldContext | null;
  getTab(): Promise<chrome.tabs.Tab>;
  ensureInjected(tabId: number): Promise<void>;
  send(tabId: number, command: unknown, frameId?: number): Promise<unknown>;
  run(action: () => Promise<void>): Promise<void>;
  setField(field: FieldContext): void;
}
export interface PanelFeature {
  id: string; title: string; mount(container: HTMLElement): void;
  onPageContext(page: PageContext): void; onTabChanged(previousTabId?: number): void;
  onMessage?(message: any, sender: chrome.runtime.MessageSender): void;
}
