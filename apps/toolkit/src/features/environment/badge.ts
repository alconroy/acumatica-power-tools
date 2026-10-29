import { classifyEnvironment, environmentLabel } from '../../../../../packages/core/src/environments';
import type { EnvironmentProfile } from '../../../../../packages/core/src/types';

export function mountBadge(extensionRuntime: typeof chrome.runtime | undefined) {
  if (!extensionRuntime?.sendMessage) return { onMessage(_message: unknown) {}, dispose() {} };
  let disposed = false;
  const ID = 'acumatica-toolkit-badge';
  let profiles: EnvironmentProfile[] = [];
  let lastHref = '';
  let accessRevoked = false;

  function remove() { document.getElementById(ID)?.remove(); }

  function render() {
    lastHref = location.href;
    const profile = classifyEnvironment(location.href, profiles);
    remove();
    const looksLikeAcumatica = /\/(?:Main|Frames)(?:\/|\?|$)/i.test(location.pathname) || /Acumatica/i.test(document.title) || Boolean(document.querySelector('qp-screen, [aurelia-app], form#form1'));
    if (disposed || !profile || accessRevoked || !looksLikeAcumatica || window.top !== window) return;
    const badge = document.createElement('button');
    badge.id = ID;
    badge.type = 'button';
    badge.textContent = environmentLabel(profile);
    badge.title = `${environmentLabel(profile)} — open Acumatica Power Tools`;
    // Bottom centre: the bottom-right corner holds Acumatica's grid pager and record navigation buttons.
    Object.assign(badge.style, { position:'fixed', left:'50%', bottom:'12px', transform:'translateX(-50%)', zIndex:'2147483647', border:'2px solid white', borderRadius:'6px', padding:'6px 10px', color:'white', background:profile.color, font:'700 12px system-ui', maxWidth:'45vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxShadow:'0 2px 8px #0006', cursor:'pointer' });
    badge.addEventListener('click', () => {
      if (!extensionRuntime?.sendMessage || disposed) return;
      try { void extensionRuntime.sendMessage({ type: 'TOOLKIT_OPEN_PANEL', frameUrl: location.href }).catch(() => undefined); } catch { /* extension reload */ }
    });
    document.documentElement.append(badge);
  }

  async function load() {
    if (disposed) return;
    const result = await chrome.storage.local.get('environmentProfiles');
    if (disposed) return;
    profiles = (result.environmentProfiles as EnvironmentProfile[] | undefined) || [];
    render();
  }

  const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes.environmentProfiles) void load().catch(() => undefined);
  };
  const storageEvents = chrome.storage.onChanged;
  storageEvents.addListener(storageChanged);
  const onMessage = (message: any) => {
    if (message?.type !== 'TOOLKIT_ACCESS_REVOKED') return;
    const revoked = (message.origins as string[]).some(pattern => pattern.startsWith(`${location.origin}/`));
    if (revoked) { accessRevoked = true; remove(); }
  };
  window.addEventListener('popstate', render);
  window.addEventListener('hashchange', render);
  const poll = setInterval(() => { if (location.href !== lastHref) render(); }, 1000);
  void load().catch(() => undefined);
  return { onMessage, dispose() {
    disposed = true; remove(); clearInterval(poll);
    window.removeEventListener('popstate', render); window.removeEventListener('hashchange', render);
    try { storageEvents.removeListener(storageChanged); } catch { /* extension reload */ }
  } };
}
