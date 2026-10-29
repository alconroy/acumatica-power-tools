import { copyText } from '../../../../../packages/core/src/chrome';
import { buildDacBrowserUrl, buildDacSourceUrl } from '../../../../../packages/core/src/links';
import type { CapturedValue, FieldContext, PageContext } from '../../../../../packages/core/src/types';

import type { PanelServices } from '../../services';
import { copyForAI } from '../../prompts';
export function mountInspectorPanel(container: HTMLElement, services: PanelServices) {
const inspectButton = container.querySelector<HTMLButtonElement>('#inspect')!;
const includeValue = container.querySelector<HTMLInputElement>('#include-value')!;
const status = container.querySelector<HTMLElement>('#status')!;
const resultCard = container.querySelector<HTMLElement>('#result')!;
const metadataQuality = container.querySelector<HTMLElement>('#metadata-quality')!;
const details = container.querySelector<HTMLElement>('#details')!;
const classicResolver = container.querySelector<HTMLElement>('#classic-resolver')!;
const resolveClassicButton = container.querySelector<HTMLButtonElement>('#resolve-classic')!;
const copyButton = container.querySelector<HTMLButtonElement>('#copy')!;
const search = container.querySelector<HTMLInputElement>('#search')!;
const historyElement = container.querySelector<HTMLElement>('#history')!;
const ui = container.querySelector<HTMLElement>('#ui')!;
let currentTabId: number | undefined;
let experimental = false;
const copyAiButton = container.querySelector<HTMLButtonElement>('#copy-ai')!;
const experimentalHint = container.querySelector<HTMLElement>('#experimental-hint')!;
let currentDocumentId = '';
let currentFrameId: number | undefined;
let selected: FieldContext | null = null;
let history: FieldContext[] = [];
let resolverEligible = false;
const copyFeedbackTimers = new Map<HTMLButtonElement, number>();
// Inspections of tabs the user switched away from, kept in panel memory only.
// A parked tab's entry is dropped when that tab navigates or closes.
const parked = new Map<number, { selected: FieldContext | null; history: FieldContext[]; documentId: string; frameId?: number }>();

function display(value: CapturedValue): string {
  if (value.source === 'user-disabled') return 'Not captured (turned off)';
  if (value.state === 'available' && value.value) return value.value;
  if (value.state === 'not-applicable') return 'Not applicable';
  if (value.state === 'unsupported') {
    if (value.source === 'user-disabled') return 'Not captured (turned off)';
    if (value.source?.includes('sensitive-or-hidden') || value.source === 'hidden-control') return 'Not captured (sensitive or hidden)';
    return 'Not captured';
  }
  return 'Not exposed by this UI';
}

function rows(field: FieldContext): Array<[string, CapturedValue]> {
  const dacSourceUrl = field.dac.state === 'available' && field.dac.value
    ? buildDacSourceUrl(field.page.url, field.dac.value)
    : null;
  const dacSource: CapturedValue = dacSourceUrl
    ? { state: 'available', value: dacSourceUrl, source: 'derived:verified-dac' }
    : field.dac.state === 'not-applicable'
      ? { state: 'not-applicable', source: 'applicability:dac-not-applicable' }
      : { state: 'unavailable', source: 'derived:dac-unavailable' };
  return [
    ['Screen', field.page.screenName], ['Screen ID', field.page.screenId], ['Graph', field.graph],
    ['Label', field.label], ['Field', field.field], ['View', field.view], ['DAC', field.dac], ['DAC source data', dacSource],
    ['Data type', field.dataType], ['Binding', field.binding], ['Properties', field.properties], ['Selector source', field.selector],
    ['Control ID', field.controlId], ['Control type', field.controlType], ['Container', field.container], ['Element path', field.elementPath],
    ['Value', field.currentValue]
  ];
}

function technicalText(field: FieldContext): string {
  return ['Acumatica field context', ...rows(field).map(([label, value]) => `${label}: ${display(value)}${value.source ? ` [${value.source}]` : ''}`)].join('\n');
}

function updateUi(page: PageContext) {
  ui.textContent = `${page.ui[0].toUpperCase()}${page.ui.slice(1)} UI`;
}

function renderResult() {
  details.replaceChildren();
  if (!selected) {
    resultCard.classList.add('empty');
    metadataQuality.textContent = '';
    metadataQuality.className = '';
    copyButton.disabled = true;
    copyAiButton.disabled = true;
    classicResolver.hidden = true;
    experimentalHint.hidden = true;
    return;
  }
  resultCard.classList.remove('empty');
  const verifiedCount = rows(selected).filter(([, value]) => value.source?.startsWith('framework:') || value.source?.startsWith('acumatica:')).length;
  metadataQuality.textContent = verifiedCount ? `Framework metadata found · ${verifiedCount} verified details` : 'DOM metadata only · use the native inspector for unavailable mappings';
  metadataQuality.className = verifiedCount ? 'quality framework' : 'quality dom-only';
  for (const [label, value] of rows(selected)) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd');
    const linkHref = label === 'DAC' && value.state === 'available' && value.value && selected
      ? buildDacBrowserUrl(selected.page.url, value.value)
      : label === 'DAC source data' && value.state === 'available' ? value.value : null;
    const renderedValue = linkHref ? document.createElement('a') : document.createElement('span');
    renderedValue.textContent = label === 'DAC source data' && linkHref ? 'Open source data' : display(value);
    if (renderedValue instanceof HTMLAnchorElement && linkHref) {
      renderedValue.href = linkHref;
      renderedValue.target = '_blank';
      renderedValue.rel = 'noopener noreferrer';
      renderedValue.title = label === 'DAC' ? 'Open this DAC in Acumatica DAC Browser' : 'Open source data for this DAC';
    }
    dd.append(renderedValue);
    if (value.state !== 'available') dd.className = value.state;
    if (value.source) {
      const source = document.createElement('small');
      source.className = 'source';
      source.textContent = value.source.startsWith('framework:modern') ? 'Modern field state' :
        value.source.startsWith('framework:classic') ? 'Classic client control' :
        value.source.startsWith('framework:screen') ? 'Screen service' :
        value.source.startsWith('acumatica:native-inspector') ? 'Acumatica native inspector' :
        value.source.startsWith('acumatica:classic-metadata') ? 'Acumatica field metadata service' :
        value.source.startsWith('applicability:') ? 'Does not apply to this control' :
        value.source.startsWith('derived:verified-dac') ? 'Built from verified DAC' :
        value.source.startsWith('derived:') ? 'Requires a verified DAC' :
        value.source === 'user-disabled' ? 'Capture setting' :
        value.source.includes('hidden-control') ? 'Privacy rule' :
        value.source.startsWith('url:') ? 'Page URL' : 'Page HTML';
      source.title = value.source;
      dd.append(source);
    }
    details.append(dt, dd);
  }
  copyButton.disabled = false;
  copyAiButton.disabled = false;
  const missingClassicMapping = selected.page.ui === 'classic' &&
    (selected.field.state === 'unavailable' || selected.dac.state === 'unavailable');
  classicResolver.hidden = !(experimental && resolverEligible && missingClassicMapping);
  experimentalHint.hidden = experimental || !missingClassicMapping;
}

function renderHistory() {
  historyElement.replaceChildren();
  const query = search.value.toLocaleLowerCase();
  for (const item of history.filter(entry => technicalText(entry).toLocaleLowerCase().includes(query))) {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.textContent = `${display(item.label)} · ${display(item.field)}`;
    button.addEventListener('click', () => { selected = item; resolverEligible = false; renderResult(); });
    historyElement.append(button);
  }
}

function clearPage() {
  selected = null;
  history = [];
  currentDocumentId = '';
  currentFrameId = undefined;
  resolverEligible = false;
  renderResult();
  renderHistory();
}

async function dispatch() {
  const tab = await services.getTab();
  currentTabId = tab.id;
  await services.ensureInjected(tab.id!);
  await services.send(tab.id!, { type: 'TOOLKIT_START_INSPECTION', includeValue: includeValue.checked });
  status.textContent = 'Inspection active. Click a highlighted field; press Escape to cancel.';
}
inspectButton.addEventListener('click', () => void services.run(dispatch));
function showCopied(button: HTMLButtonElement, label: string) {
  clearTimeout(copyFeedbackTimers.get(button));
  button.textContent = 'Copied ✓';
  button.classList.add('copied');
  copyFeedbackTimers.set(button, window.setTimeout(() => {
    button.textContent = label;
    button.classList.remove('copied');
    copyFeedbackTimers.delete(button);
  }, 2000));
}

copyAiButton.addEventListener('click', async () => {
  if (!selected) return;
  try {
    await copyText(await copyForAI(technicalText(selected), selected.page));
    status.textContent = 'AI context copied.'; status.className = '';
    showCopied(copyAiButton, 'Copy for AI');
  } catch {
    status.textContent = 'Clipboard access failed. Keep the panel open and try again.'; status.className = 'error';
  }
});

copyButton.addEventListener('click', async () => {
  if (!selected) return;
  try {
    await copyText(technicalText(selected));
    status.textContent = 'Technical context copied.'; status.className = '';
    showCopied(copyButton, 'Copy technical context');
  } catch {
    status.textContent = 'Clipboard access failed. Keep the panel open and try again.'; status.className = 'error';
  }
});

resolveClassicButton.addEventListener('click', async () => {
  if (!experimental || !currentTabId || currentFrameId === undefined || !selected) return;
  resolveClassicButton.disabled = true;
  resolveClassicButton.textContent = 'Resolving…';
  status.className = '';
  status.textContent = 'Running Acumatica’s native metadata lookup for the selected control…';
  try {
    await services.send(currentTabId, { type: 'TOOLKIT_RESOLVE_CLASSIC_METADATA' }, currentFrameId);
  } catch (error) {
    resolveClassicButton.disabled = false;
    resolveClassicButton.textContent = 'Resolve missing Classic metadata (experimental)';
    status.className = 'error';
    status.textContent = error instanceof Error ? error.message : 'The Classic metadata request could not start.';
  }
});

search.addEventListener('input', renderHistory);

function onMessage(message: any, sender: chrome.runtime.MessageSender) {
  if (sender.tab?.id !== currentTabId) return;
  if (message.type === 'TOOLKIT_PAGE_READY') {
    const page = message.page as PageContext;
    // Every frame announces itself on (re)injection; only the inspected frame's document decides staleness.
    if (currentDocumentId && sender.frameId === currentFrameId && currentDocumentId !== page.documentId) clearPage();
    updateUi(page);
  } else if (message.type === 'TOOLKIT_FIELD_RESULT') {
    const field = message.result as FieldContext;
    if (currentDocumentId && currentDocumentId !== field.page.documentId) clearPage();
    updateUi(field.page);
    currentDocumentId = field.page.documentId;
    selected = field;
    services.setField(field);
    currentFrameId = sender.frameId;
    resolverEligible = true;
    if (message.replaceCurrent === true && history.length) history[0] = field;
    else history.unshift(field);
    renderResult(); renderHistory();
    resolveClassicButton.disabled = false;
    resolveClassicButton.textContent = 'Resolve missing Classic metadata (experimental)';
    if (message.resolverStatus === 'resolved') {
      resolverEligible = field.field.state !== 'available' || field.dac.state !== 'available';
      status.textContent = 'Classic metadata resolved from Acumatica’s native inspector.'; status.className = '';
    } else if (message.resolverStatus === 'unavailable') {
      status.textContent = `Acumatica’s native inspector did not return an additional mapping for this control.${message.resolverDetail ? ` Diagnostic: ${message.resolverDetail}.` : ''}`;
      status.className = 'error';
    } else if (message.resolverStatus === 'failed') {
      status.textContent = `Acumatica’s native metadata lookup could not complete.${message.resolverDetail ? ` Diagnostic: ${message.resolverDetail}.` : ''}`;
      status.className = 'error';
    } else if (field.controlType.value === 'PXGrid status/action area') {
      resolverEligible = false;
      renderResult();
      status.textContent = 'This is the grid status/action area, not a data field. Select a rendered data cell or column header.';
      status.className = '';
    } else {
      status.textContent = 'Field selected.'; status.className = '';
    }
  } else if (message.type === 'TOOLKIT_INSPECTION_CANCELLED') {
    status.textContent = 'Inspection cancelled.';
  } else if (message.type === 'TOOLKIT_PAGE_CHANGED') {
    clearPage(); updateUi(message.page as PageContext); status.textContent = 'Page changed; inspection history cleared.';
  } else if (message.type === 'TOOLKIT_CLASSIC_METADATA_STATUS' && message.resolverStatus === 'stale') {
    resolveClassicButton.disabled = false;
    resolveClassicButton.textContent = 'Resolve missing Classic metadata (experimental)';
    resolverEligible = false;
    renderResult();
    status.textContent = 'The selected control is no longer on this page. Inspect it again before resolving metadata.';
    status.className = 'error';
  }
}
const settingsChanged = () => void chrome.storage.local.get('experimentalClassicResolver').then(settings => { experimental = settings.experimentalClassicResolver === true; renderResult(); });
chrome.storage.onChanged.addListener(settingsChanged);
chrome.tabs?.onUpdated?.addListener((tabId, change) => { if (change.status === 'loading' || change.url) parked.delete(tabId); });
chrome.tabs?.onRemoved?.addListener(tabId => { parked.delete(tabId); });
settingsChanged();
renderResult();

// previousTabId is set only when the user switched tabs; without it this is a navigation clear.
function onTabChanged(previousTabId?: number) {
  if (previousTabId !== undefined && previousTabId === currentTabId && history.length) {
    parked.set(previousTabId, { selected, history, documentId: currentDocumentId, frameId: currentFrameId });
  }
  currentTabId = services.tabId;
  clearPage();
  const restored = previousTabId !== undefined && currentTabId !== undefined ? parked.get(currentTabId) : undefined;
  if (!restored) { status.textContent = 'Open an Acumatica screen, then start inspection.'; return; }
  parked.delete(currentTabId!);
  selected = restored.selected; history = restored.history;
  currentDocumentId = restored.documentId; currentFrameId = restored.frameId;
  renderResult(); renderHistory();
  if (selected) services.setField(selected);
  status.textContent = 'Inspection restored for this tab.'; status.className = '';
}
return {
  id: 'inspect', title: 'Inspect', mount() {}, onMessage,
  onPageContext(page: PageContext) { updateUi(page); },
  onTabChanged
};
}
