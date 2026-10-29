import { extractFieldContext, extractPageContext, isApplicationUrl, pickTarget } from '../../../../../packages/core/src/page';
import { mergeFrameworkMetadata } from '../../../../../packages/core/src/metadata';
import type { FrameworkFieldMetadata } from '../../../../../packages/core/src/types';

export function mountInspector(extensionRuntime: typeof chrome.runtime | undefined) {
  let disposed = false;
  // Blank and srcdoc frames still allow inspection but never report page context.
  const reportsPage = isApplicationUrl(location.href);
  const pending = new Set<() => void>();
  let pageGeneration = 0;
  let highlighted: HTMLElement | null = null;
  let lastInspected: HTMLElement | null = null;
  let includeValue = false;
  let lastHref = location.href;

  const style = document.createElement('style');
  style.textContent = '.acu-field-inspector-highlight{cursor:crosshair!important}' +
    '.acu-field-inspector-overlay{position:fixed;z-index:2147483647;pointer-events:none;box-sizing:border-box;border:3px solid #1769aa;border-radius:3px;display:none}';
  document.documentElement.append(style);
  // An outline on the control itself is clipped by Classic editor wrappers, so the box is a separate overlay.
  const overlay = document.createElement('div');
  overlay.className = 'acu-field-inspector-overlay';

  function positionOverlay() {
    if (!highlighted) { overlay.style.display = 'none'; return; }
    const rect = highlighted.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block', left: `${rect.left - 5}px`, top: `${rect.top - 5}px`, width: `${rect.width + 10}px`, height: `${rect.height + 10}px`
    });
    if (!overlay.isConnected) document.documentElement.append(overlay);
  }

  function notify(message: unknown): Promise<unknown> {
    if (disposed || !extensionRuntime?.sendMessage) return Promise.resolve();
    try { return extensionRuntime.sendMessage(message).catch(() => undefined); }
    catch { return Promise.resolve(); }
  }

  function clearHighlight() {
    highlighted?.classList.remove('acu-field-inspector-highlight');
    highlighted = null;
    positionOverlay();
  }

  function stop() {
    clearHighlight();
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', positionOverlay, true);
    window.removeEventListener('resize', positionOverlay);
  }

  function onOver(event: Event) {
    const next = pickTarget(event.target as Element | null);
    if (next === highlighted) return;
    clearHighlight();
    if (next) {
      highlighted = next;
      highlighted.classList.add('acu-field-inspector-highlight');
      positionOverlay();
    }
  }

  function onClick(event: MouseEvent) {
    if (!highlighted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = highlighted;
    stop();
    void inspect(target);
  }

  async function frameworkMetadata(target: HTMLElement, resolveClassic = false): Promise<{ metadata: FrameworkFieldMetadata | null; resolverStatus?: string; resolverDetail?: string }> {
    const requestId = crypto.randomUUID();
    const token = crypto.randomUUID();
    target.setAttribute('data-acu-inspector-token', token);
    return new Promise(resolve => {
      const finish = (value: { metadata: FrameworkFieldMetadata | null; resolverStatus?: string; resolverDetail?: string }) => {
        pending.delete(cancel);
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        if (target.getAttribute('data-acu-inspector-token') === token) target.removeAttribute('data-acu-inspector-token');
        resolve(value);
      };
      const cancel = () => finish({ metadata: null });
      pending.add(cancel);
      const listener = (event: MessageEvent) => {
        if (event.source !== window || event.data?.channel !== 'ACUMATICA_TOOLKIT_BRIDGE_RESPONSE_V3' || event.data?.requestId !== requestId) return;
        finish({
          metadata: event.data.metadata as FrameworkFieldMetadata,
          resolverStatus: event.data.resolverStatus as string | undefined,
          resolverDetail: event.data.resolverDetail as string | undefined
        });
      };
      const timer = window.setTimeout(() => finish({ metadata: null, resolverStatus: resolveClassic ? 'failed' : undefined }), resolveClassic ? 20000 : 2000);
      window.addEventListener('message', listener);
      window.postMessage({ channel: 'ACUMATICA_TOOLKIT_BRIDGE_REQUEST_V3', requestId, token, resolveClassic }, '*');
    });
  }

  async function inspect(target: HTMLElement) {
    const generation = pageGeneration;
    lastInspected = target;
    const dom = extractFieldContext(target, includeValue);
    const bridge = await frameworkMetadata(target);
    if (generation !== pageGeneration || disposed) return;
    const result = mergeFrameworkMetadata(dom, bridge.metadata);
    await notify({ type: 'TOOLKIT_FIELD_RESULT', result, frameUrl: location.href });
  }

  async function resolveLastClassicMetadata() {
    const generation = pageGeneration;
    const target = lastInspected;
    if (!target?.isConnected) {
      await notify({ type: 'TOOLKIT_CLASSIC_METADATA_STATUS', resolverStatus: 'stale', frameUrl: location.href });
      return;
    }
    const dom = extractFieldContext(target, includeValue);
    const bridge = await frameworkMetadata(target, true);
    if (generation !== pageGeneration || disposed) return;
    const result = mergeFrameworkMetadata(dom, bridge.metadata);
    await notify({
      type: 'TOOLKIT_FIELD_RESULT', result, frameUrl: location.href, replaceCurrent: true,
      resolverStatus: bridge.resolverStatus || 'failed', resolverDetail: bridge.resolverDetail
    });
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    stop();
    void notify({ type: 'TOOLKIT_INSPECTION_CANCELLED', frameUrl: location.href });
  }

  function start(value: boolean) {
    stop();
    includeValue = value;
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', positionOverlay, true);
    window.addEventListener('resize', positionOverlay);
    if (reportsPage) void notify({ type: 'TOOLKIT_PAGE_READY', page: extractPageContext(document), frameUrl: location.href });
  }

  async function onMessage(message: any) {
    if (message?.type === 'TOOLKIT_START_INSPECTION') start(Boolean(message.includeValue));
    if (message?.type === 'TOOLKIT_STOP_INSPECTION') stop();
    if (message?.type === 'TOOLKIT_RESOLVE_CLASSIC_METADATA') {
      try {
        const settings = await chrome.storage.local.get('experimentalClassicResolver');
        if (settings.experimentalClassicResolver === true && !disposed) await resolveLastClassicMetadata();
      } catch { /* unavailable or reloaded extension: no resolver request */ }
    }
  }

  const watch = new MutationObserver(() => {
    if (location.href === lastHref) return;
    pageGeneration++;
    lastHref = location.href;
    stop();
    lastInspected = null;
    if (reportsPage) void notify({ type: 'TOOLKIT_PAGE_CHANGED', page: extractPageContext(document), frameUrl: location.href });
  });
  watch.observe(document.documentElement, { childList: true, subtree: true });
  const routeChanged = () => { if (location.href !== lastHref) { pageGeneration++; lastHref = location.href; stop(); lastInspected = null; if (reportsPage) void notify({ type:'TOOLKIT_PAGE_CHANGED', page:extractPageContext(document), frameUrl:location.href }); } };
  window.addEventListener('popstate', routeChanged);
  window.addEventListener('hashchange', routeChanged);

  if (reportsPage) void notify({ type: 'TOOLKIT_PAGE_READY', page: extractPageContext(document), frameUrl: location.href });
  return { onMessage,
    dispose() {
      disposed = true;
      for (const cancel of pending) cancel();
      stop();
      watch.disconnect();
      style.remove();
      overlay.remove();
      window.removeEventListener('popstate', routeChanged);
      window.removeEventListener('hashchange', routeChanged);
    }
  };
}
