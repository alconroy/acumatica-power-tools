import { expect, it, vi } from 'vitest';
import { mountInspector } from '../../apps/toolkit/src/features/inspector/content';
it('does not call a missing extension runtime when an obsolete content script receives a command', async () => {
  const inspector = mountInspector(undefined);
  expect(() => inspector.onMessage({ type: 'TOOLKIT_START_INSPECTION', includeValue: false })).not.toThrow();
  await Promise.resolve(); inspector.dispose();
});

it('does not deliver a delayed field result after the page route changes', async () => {
  document.body.innerHTML = '<input id="field" data-field="Description">';
  const notify = vi.fn().mockResolvedValue(undefined);
  const inspector = mountInspector({ sendMessage: notify } as unknown as typeof chrome.runtime);
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  await inspector.onMessage({ type: 'TOOLKIT_START_INSPECTION' });
  const input = document.querySelector('input')!;
  input.dispatchEvent(new Event('pointerover', { bubbles: true })); input.click();
  const request = post.mock.calls[0][0];
  expect(request.channel).toBe('ACUMATICA_TOOLKIT_BRIDGE_REQUEST_V3');
  history.replaceState({}, '', '/Main?ScreenId=AR303000'); window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new MessageEvent('message', { source: window, data: { channel: 'ACUMATICA_TOOLKIT_BRIDGE_RESPONSE_V3', requestId: request.requestId, metadata: { field: { value: 'OldField', source: 'framework:modern' } } } }));
  await Promise.resolve(); await Promise.resolve();
  expect(notify.mock.calls.some(([message]) => message.type === 'TOOLKIT_FIELD_RESULT')).toBe(false);
  inspector.dispose(); post.mockRestore();
});

it('draws the highlight as an overlay that a clipping Classic editor wrapper cannot hide, and removes it', async () => {
  document.body.innerHTML = '<div id="ctl00_phG_tab_t0_edLotSerClassID" style="overflow:hidden"><input id="ctl00_phG_tab_t0_edLotSerClassID_text"></div>';
  const inspector = mountInspector({ sendMessage: vi.fn().mockResolvedValue(undefined) } as unknown as typeof chrome.runtime);
  await inspector.onMessage({ type: 'TOOLKIT_START_INSPECTION' });
  const input = document.querySelector('input')!;
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, width: 200, height: 24 } as DOMRect);
  input.dispatchEvent(new Event('pointerover', { bubbles: true }));
  const overlay = document.querySelector<HTMLElement>('.acu-field-inspector-overlay')!;
  expect(overlay.parentElement).toBe(document.documentElement);
  expect(input.closest('div')!.contains(overlay)).toBe(false);
  expect(overlay.style).toMatchObject({ display: 'block', left: '95px', top: '45px', width: '210px', height: '34px' });
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(overlay.style.display).toBe('none');
  inspector.dispose();
  expect(document.querySelector('.acu-field-inspector-overlay')).toBeNull();
});
