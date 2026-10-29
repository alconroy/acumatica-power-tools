import { buildScreenUrl, captureEnvironment, classifyEnvironment, environmentLabel, exportProfiles, filterProfiles, importProfiles, mergeProfiles, movePinned, normalizeProfile, profilePattern, setPinned, tenantFromUrl } from '../../../../../packages/core/src/environments';
import { storageGet, storageSet } from '../../../../../packages/core/src/chrome';
import type { EnvironmentKind, EnvironmentProfile, PageContext } from '../../../../../packages/core/src/types';

import type { PanelServices } from '../../services';
export function mountEnvironmentPanel(container: HTMLElement, services: PanelServices) {
const currentBadge = container.querySelector<HTMLElement>('#current')!;
const screenText = container.querySelector<HTMLElement>('#screen')!;
const status = container.querySelector<HTMLElement>('#status')!;
const search = container.querySelector<HTMLInputElement>('#environment-search')!;
const count = container.querySelector<HTMLElement>('#environment-count')!;
const captureButton = container.querySelector<HTMLButtonElement>('#capture-environment')!;
const addSection = container.querySelector<HTMLDetailsElement>('#add-environment')!;
const formTitle = container.querySelector<HTMLElement>('#profile-form-title')!;
const saveButton = container.querySelector<HTMLButtonElement>('#save-environment')!;
const cancelEdit = container.querySelector<HTMLButtonElement>('#cancel-edit')!;
const profilesElement = container.querySelector<HTMLElement>('#profiles')!;
const form = container.querySelector<HTMLFormElement>('#profile-form')!;
const transfer = container.querySelector<HTMLTextAreaElement>('#transfer')!;
let profiles: EnvironmentProfile[] = [];
let activeUrl = '';
let screenId = '';
let activePage: PageContext | null = null;
const KINDS: EnvironmentKind[] = ['PROD', 'TEST', 'DEV', 'SANDBOX'];
let draft: EnvironmentProfile | null = null;
let editingId: string | null = null;
let importedDraft: EnvironmentProfile[] | null = null;

function showStatus(text: string, error = false) { status.textContent = text; status.className = error ? 'error' : ''; }

async function synchronize() {
  const response = await chrome.runtime.sendMessage({ type: 'TOOLKIT_SYNC_BADGES' });
  if (response?.ok === false) throw new Error(response.error || 'Badge registration failed.');
}

function openIn(profile: EnvironmentProfile) {
  if (profile.kind === 'PROD' && !confirm(`Open ${screenId || 'the Acumatica home page'} in production environment “${environmentLabel(profile)}”?`)) return;
  const page: Pick<PageContext, 'screenId'> = { screenId: screenId ? { state:'available', value:screenId, source:'url' } : { state:'unavailable' } };
  void chrome.tabs.create({ url: buildScreenUrl(profile, page) });
}

// Pin order changes no site patterns, so badges need no re-registration.
async function reorder(next: EnvironmentProfile[], focus: { id: string; action: string }) {
  profiles = next; await storageSet('environmentProfiles', profiles); render();
  profilesElement.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(focus.id)}"] [data-action="${focus.action}"]:not(:disabled)`)?.focus();
}

function render() {
  const current = activeUrl ? classifyEnvironment(activeUrl, profiles) : null;
  currentBadge.textContent = current ? environmentLabel(current) : 'UNCLASSIFIED';
  currentBadge.style.background = current?.color || '#68717b';
  screenText.textContent = screenId ? `Current screen: ${screenId}` : 'No validated Screen ID detected.';
  const matches = filterProfiles(profiles, search.value);
  count.textContent = !profiles.length ? 'No environments yet. Capture or add one below.'
    : search.value.trim() ? `${matches.length} of ${profiles.length} environments` : `${profiles.length} environments`;
  profilesElement.replaceChildren();
  const pinnedCount = profiles.filter(profile => profile.pinned !== undefined).length;
  for (const profile of matches) {
    const pinned = profile.pinned !== undefined;
    const row = document.createElement('div'); row.dataset.id = profile.id;
    row.className = ['environment-row', pinned ? 'pinned' : '', profile.id === current?.id ? 'current' : ''].filter(Boolean).join(' ');
    const pin = document.createElement('button'); pin.className = 'environment-pin'; pin.dataset.action = 'pin';
    pin.textContent = pinned ? '★' : '☆'; pin.setAttribute('aria-pressed', String(pinned));
    pin.setAttribute('aria-label', `Pin ${environmentLabel(profile)} to the top`); pin.title = pinned ? 'Unpin' : 'Pin to the top';
    pin.addEventListener('click', () => void reorder(setPinned(profiles, profile.id, !pinned), { id: profile.id, action: 'pin' }));
    row.append(pin);
    const swatch = document.createElement('span'); swatch.className = 'environment-swatch'; swatch.style.background = profile.color;
    const text = document.createElement('span'); text.className = 'environment-text'; text.textContent = environmentLabel(profile);
    const detail = document.createElement('small'); detail.textContent = [new URL(profile.baseUrl).host, profile.tenant].filter(Boolean).join(' · ');
    text.append(detail); row.append(swatch, text);
    const actions = document.createElement('span'); actions.className = 'environment-actions';
    if (profile.id === current?.id) {
      const here = document.createElement('small'); here.textContent = 'Current'; actions.append(here);
    } else {
      const open = document.createElement('button'); open.textContent = 'Open screen'; open.title = `Open the current screen in ${environmentLabel(profile)}`;
      open.addEventListener('click', () => openIn(profile)); actions.append(open);
    }
    if (pinned) {
      for (const [action, label, offset] of [['up', '↑', -1], ['down', '↓', 1]] as const) {
        const move = document.createElement('button'); move.textContent = label; move.dataset.action = action;
        move.setAttribute('aria-label', `Move ${environmentLabel(profile)} ${action}`); move.title = `Move ${action}`;
        move.disabled = offset < 0 ? profile.pinned === 0 : profile.pinned === pinnedCount - 1;
        move.addEventListener('click', () => void reorder(movePinned(profiles, profile.id, offset), { id: profile.id, action }));
        actions.append(move);
      }
    }
    const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.title = `Edit ${environmentLabel(profile)}`;
    edit.addEventListener('click', () => startEditing(profile));
    const remove = document.createElement('button'); remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove environment “${environmentLabel(profile)}”?`)) return;
      profiles = profiles.filter(item => item.id !== profile.id);
      if (editingId === profile.id) stopEditing();
      await storageSet('environmentProfiles', profiles); await synchronize(); render();
    });
    actions.append(edit, remove); row.append(actions); profilesElement.append(row);
  }
}

search.addEventListener('input', render);
search.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  const current = activeUrl ? classifyEnvironment(activeUrl, profiles) : null;
  const first = filterProfiles(profiles, search.value).find(profile => profile.id !== current?.id);
  if (first) { event.preventDefault(); openIn(first); }
});

// A new customer site has not granted access yet, so no page context arrives. Fall back to the
// tab's address, which still gives the base URL and CompanyID tenant.
async function captureSource(): Promise<Parameters<typeof captureEnvironment>[0] | null> {
  if (activePage) return activePage;
  const tab = await services.getTab().catch(() => null);
  if (!tab?.url || !/^https?:/i.test(tab.url)) return null;
  const tenant = tenantFromUrl(new URL(tab.url));
  return { url: tab.url, tenant: tenant ? { state: 'available', value: tenant, source: 'url:tenant' } : { state: 'unavailable' } };
}

function field<T extends HTMLElement>(name: string): T { return form.elements.namedItem(name) as T; }

function stopEditing() {
  editingId = null; form.reset(); readDraft();
  formTitle.textContent = 'Add environment'; saveButton.textContent = 'Grant access and save'; cancelEdit.hidden = true;
}

function startEditing(profile: EnvironmentProfile) {
  editingId = profile.id;
  field<HTMLInputElement>('name').value = profile.name;
  field<HTMLInputElement>('baseUrl').value = profile.baseUrl;
  field<HTMLInputElement>('tenant').value = profile.tenant || '';
  field<HTMLSelectElement>('kind').value = profile.kind;
  field<HTMLInputElement>('color').value = profile.color;
  formTitle.textContent = `Edit ${environmentLabel(profile)}`; saveButton.textContent = 'Save changes'; cancelEdit.hidden = false;
  addSection.open = true; readDraft();
  showStatus(`Editing ${environmentLabel(profile)}.`);
  field<HTMLInputElement>('name').focus();
}

cancelEdit.addEventListener('click', () => { stopEditing(); addSection.open = false; showStatus('Edit cancelled.'); });

captureButton.addEventListener('click', () => void captureSource().then(source => {
  if (!source) {
    showStatus('The toolkit cannot read this tab yet. Click the toolkit toolbar button while on the site, then capture again.', true);
    return;
  }
  const captured = captureEnvironment(source);
  const existing = classifyEnvironment(source.url, profiles);
  stopEditing();
  field<HTMLInputElement>('baseUrl').value = captured.baseUrl;
  field<HTMLInputElement>('tenant').value = captured.tenant;
  addSection.open = true; readDraft();
  showStatus(existing ? `This site is already saved as ${environmentLabel(existing)}. Review before adding another.`
    : `Captured ${captured.baseUrl}. Enter a name and choose a type.`);
  field<HTMLInputElement>('name').focus();
}));

function readDraft() {
  const data = new FormData(form);
  const kind = String(data.get('kind')) as EnvironmentKind;
  if (!KINDS.includes(kind)) { draft = null; return; }
  try { draft = normalizeProfile({ id: editingId || crypto.randomUUID(), name: String(data.get('name')), baseUrl: String(data.get('baseUrl')), tenant: String(data.get('tenant')) || undefined, kind, color: String(data.get('color')) }); }
  catch { draft = null; }
}
form.addEventListener('input', readDraft); form.addEventListener('change', readDraft); readDraft();
form.addEventListener('submit', event => {
  const permission = chrome.permissions.request({ origins: draft ? [profilePattern(draft)] : [] });
  event.preventDefault();
  const profile = draft;
  void permission.then(async granted => {
    if (!profile) { showStatus('Enter a name, an HTTP(S) base URL and a type.', true); return; }
    if (!granted) { showStatus('Site access was denied; the environment was not saved.', true); return; }
    const editing = profiles.some(item => item.id === profile.id);
    // The form has no pin field, so an edit keeps the saved pin.
    profiles = editing ? profiles.map(item => item.id === profile.id ? (item.pinned === undefined ? profile : { ...profile, pinned: item.pinned }) : item) : [...profiles, profile];
    await storageSet('environmentProfiles', profiles); await synchronize();
    stopEditing(); addSection.open = false; showStatus(`${editing ? 'Updated' : 'Saved'} ${environmentLabel(profile)}.`); render();
  }).catch(error => showStatus(String(error), true));
});

container.querySelector('#export')!.addEventListener('click', async () => {
  transfer.value = exportProfiles(profiles); transfer.select();
  importedDraft = [...profiles];
  try { await navigator.clipboard.writeText(transfer.value); showStatus('Configuration copied.'); } catch { showStatus('Configuration placed in the text box.'); }
});

transfer.addEventListener('input', () => { try { importedDraft = importProfiles(transfer.value); } catch { importedDraft = null; } });
container.querySelector('#import')!.addEventListener('click', () => {
  const permission = chrome.permissions.request({ origins: [...new Set((importedDraft || []).map(profilePattern))] });
  const imported = importedDraft;
  void permission.then(async granted => {
    if (!imported) { showStatus('Paste a valid environment export first.', true); return; }
    if (!granted) { showStatus('Site access was denied; nothing was imported.', true); return; }
    // Merge: new profiles are added and matching ones amended; nothing absent from the import is removed.
    const merge = mergeProfiles(profiles, imported);
    profiles = merge.profiles; await storageSet('environmentProfiles', profiles); await synchronize();
    showStatus(`Imported ${merge.added} new and ${merge.updated} updated; ${merge.kept} other environment${merge.kept === 1 ? '' : 's'} unchanged.`); render();
  }).catch(error => showStatus(String(error), true));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.environmentProfiles) { profiles = changes.environmentProfiles.newValue || []; render(); }
});
void storageGet<EnvironmentProfile[]>('environmentProfiles', []).then(value => { profiles = value; render(); });
render();
return {
  id: 'environment', title: 'Environment', mount() {},
  onPageContext(page: PageContext) { activePage = page; activeUrl = page.url; screenId = page.screenId.value || ''; render(); },
  onTabChanged() { activePage = null; activeUrl = ''; screenId = ''; render(); }
};
}
