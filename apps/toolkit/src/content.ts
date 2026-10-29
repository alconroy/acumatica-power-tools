import { mountInspector } from './features/inspector/content';
import { mountBadge } from './features/environment/badge';
declare global { var __acumaticaToolkit: { dispose(): void } | undefined; }
globalThis.__acumaticaToolkit?.dispose();
const extensionRuntime = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.runtime;
const inspector = mountInspector(extensionRuntime);
const badge = mountBadge(extensionRuntime);
const listener = (message: any) => {
  void inspector.onMessage(message);
  badge.onMessage(message);
};
extensionRuntime?.onMessage.addListener(listener);
globalThis.__acumaticaToolkit = {
  dispose() {
    inspector.dispose();
    badge.dispose();
    try { extensionRuntime?.onMessage.removeListener(listener); } catch { /* extension reload */ }
  }
};
