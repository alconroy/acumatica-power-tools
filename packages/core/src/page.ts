import type { CapturedValue, FieldContext, PageContext, UiGeneration } from './types';
import { SCREEN_ID, SCREEN_ID_BODY } from './screens';

function available(value: string | null | undefined, source: string): CapturedValue {
  const clean = value?.trim();
  return clean ? { state: 'available', value: clean, source } : { state: 'unavailable' };
}

function firstAttr(element: Element, names: string[]): CapturedValue {
  const ancestors: Element[] = [];
  let cursor: Element | null = element;
  while (cursor && ancestors.length < 8) {
    ancestors.push(cursor);
    cursor = cursor.parentElement;
  }
  for (const node of ancestors) {
    for (const name of names) {
      const value = node.getAttribute(name);
      if (value?.trim()) return available(value, `dom:${name}`);
    }
  }
  return { state: 'unavailable' };
}

export function extractScreenId(location: Location, document: Document): CapturedValue {
  const url = new URL(location.href);
  for (const key of ['ScreenId', 'ScreenID', 'screenId', 'screenid']) {
    const candidate = url.searchParams.get(key);
    if (candidate && SCREEN_ID.test(candidate)) return available(candidate.toUpperCase(), `url:${key}`);
  }
  const pathMatch = url.pathname.match(new RegExp(`(?:^|/)(${SCREEN_ID_BODY})(?:/|$)`, 'i'));
  if (pathMatch) return available(pathMatch[1].toUpperCase(), 'url:path');
  const marked = document.querySelector('[data-screen-id], [data-screenid]');
  if (marked) {
    const value = marked.getAttribute('data-screen-id') || marked.getAttribute('data-screenid');
    if (value && SCREEN_ID.test(value)) return available(value.toUpperCase(), 'dom:data-screen-id');
  }
  const titleMatch = document.title.match(new RegExp(`\\b(${SCREEN_ID_BODY})\\b`));
  return titleMatch ? available(titleMatch[1].toUpperCase(), 'document:title') : { state: 'unavailable' };
}

export function detectUi(document: Document): UiGeneration {
  if (document.querySelector('qp-screen, qp-fieldset, qp-grid, qp-data-feed, [aurelia-app]')) return 'modern';
  if (document.querySelector('form#form1, .px-form, [id*="_ed"], [class*="PXGrid"]')) return 'classic';
  return 'unknown';
}

function visibleText(selectors: string[], document: Document): CapturedValue {
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element && element.offsetParent !== null && element.textContent?.trim()) {
      return available(element.textContent, `dom:${selector}`);
    }
  }
  return { state: 'unavailable' };
}

export function extractPageContext(document: Document, location: Location = window.location): PageContext {
  const screenId = extractScreenId(location, document);
  const heading = visibleText(['[data-screen-title]', '.screen-title', '.qp-screen-title', 'h1'], document);
  const title = document.title.replace(/\s*[-|]\s*Acumatica.*$/i, '').trim();
  const tenantMatch = location.pathname.match(/\/t\/([^/]+)/i);
  const companyId = Array.from(new URL(location.href).searchParams).find(([key, value]) => key.toLowerCase() === 'companyid' && value)?.[1];
  return {
    url: location.href,
    documentId: `${location.href}|${performance.timeOrigin}`,
    ui: detectUi(document),
    frame: window.top === window ? 'top' : 'same-origin-frame',
    screenId,
    screenName: heading.state === 'available' ? heading : available(title, 'document:title'),
    tenant: tenantMatch ? available(decodeURIComponent(tenantMatch[1]), 'url:tenant-path') : companyId ? available(companyId, 'url:CompanyID') : { state: 'unavailable' },
    company: visibleText(['[data-company-name]', '.company-selector .selected', '[aria-label="Company"] .selected'], document),
    branch: visibleText(['[data-branch-name]', '.branch-selector .selected', '[aria-label="Branch"] .selected'], document)
  };
}

function associatedLabel(element: HTMLElement): CapturedValue {
  if (element.id) {
    const label = Array.from(element.ownerDocument.querySelectorAll('label')).find(item => item.htmlFor === element.id);
    if (label?.textContent) return available(label.textContent, 'dom:label-for');
  }
  const aria = element.getAttribute('aria-label');
  if (aria) return available(aria, 'dom:aria-label');
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = element.ownerDocument.getElementById(labelledBy);
    if (label?.textContent) return available(label.textContent, 'dom:aria-labelledby');
  }
  const wrapper = element.closest('label, [data-label], qp-field');
  const explicit = wrapper?.getAttribute('data-label');
  if (explicit) return available(explicit, 'dom:data-label');
  const field = element.closest('qp-field, qp-inline-field');
  const renderedLabel = field?.querySelector('.label-wrapper qp-label-light, .label-wrapper label, .label-wrapper');
  if (renderedLabel?.textContent?.trim()) return available(renderedLabel.textContent, 'dom:rendered-label');
  const header = element.closest('td')?.getAttribute('data-column') || element.getAttribute('data-column');
  if (header) return available(header, 'dom:grid-column');
  const cell = element.closest('td');
  if (cell) {
    const index = cell.cellIndex;
    const table = cell.closest('table');
    const grid = table?.closest('qp-grid, [class*="PXGrid"], [id*="grid" i]') || table?.parentElement;
    const headings = grid?.querySelectorAll('th[role="columnheader"], th');
    const heading = headings?.item(index);
    const text = heading?.textContent?.trim();
    if (text) return available(text, 'dom:grid-header');
  }
  return { state: 'unavailable' };
}

function elementPath(element: HTMLElement): CapturedValue {
  const parts: string[] = [];
  let cursor: HTMLElement | null = element;
  while (cursor && parts.length < 6) {
    let part = cursor.tagName.toLowerCase();
    if (cursor.id) {
      const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(cursor.id)
        : cursor.id.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
      part += `#${escapedId}`;
      parts.unshift(part);
      break;
    }
    const parentElement: HTMLElement | null = cursor.parentElement;
    if (parentElement) {
      const peers = Array.from(parentElement.children).filter((node: Element) => node.tagName === cursor!.tagName);
      if (peers.length > 1) part += `:nth-of-type(${peers.indexOf(cursor) + 1})`;
    }
    parts.unshift(part);
    cursor = parentElement;
  }
  return available(parts.join(' > '), 'dom:element-path');
}

function safeCurrentValue(element: HTMLElement, includeValue: boolean): CapturedValue {
  if (!includeValue) return { state: 'unavailable', source: 'user-disabled' };
  const input = element.matches('input, select, textarea') ? element as HTMLInputElement : element.querySelector('input, select, textarea') as HTMLInputElement | null;
  if (input) {
    if (input.type === 'password' || input.type === 'hidden' || input.hidden || input.getAttribute('aria-hidden') === 'true') {
      return { state: 'unsupported', source: 'sensitive-or-hidden-control' };
    }
    return available(input.value, 'dom:control-value');
  }
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return { state: 'unsupported', source: 'hidden-control' };
  return available(element.textContent, 'dom:visible-text');
}

export function extractFieldContext(element: HTMLElement, includeValue: boolean): FieldContext {
  const control = element.closest('input, select, textarea, button, [role="gridcell"], td, qp-field, [data-field], [data-field-name]') as HTMLElement | null || element;
  const metadataRoot = control.closest('[data-field], [data-field-name], [data-view], [data-dac], qp-field, td') || control;
  return {
    page: extractPageContext(document, window.location),
    label: associatedLabel(control),
    controlId: available(control.id, 'dom:id'),
    controlType: available(control.getAttribute('role') || control.tagName.toLowerCase(), 'dom:control-type'),
    container: { state: 'unavailable' },
    field: firstAttr(metadataRoot, ['data-field', 'data-field-name', 'datafield', 'field']),
    view: firstAttr(metadataRoot, ['data-view', 'data-view-name', 'datamember']),
    dac: firstAttr(metadataRoot, ['data-dac', 'data-class']),
    graph: { state: 'unavailable' },
    dataType: { state: 'unavailable' },
    binding: { state: 'unavailable' },
    properties: { state: 'unavailable' },
    selector: { state: 'unavailable' },
    elementPath: elementPath(control),
    currentValue: safeCurrentValue(control, includeValue)
  };
}

export function isInspectable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(element.closest('input, select, textarea, button, td, [role="gridcell"], qp-field, [data-field], [data-field-name]'));
}

// Every injected frame reports its own page context. The top frame's URL carries the Screen ID and
// CompanyID tenant, so a nested frame's report must never replace it.
/** Only an HTTP(S) document can be an Acumatica page; about:blank and srcdoc frames have no site address. */
export function isApplicationUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function preferPageContext(current: PageContext | null, incoming: PageContext): PageContext | null {
  if (!isApplicationUrl(incoming.url)) return current;
  if (incoming.frame === 'top' || !current) return incoming;
  if (current.frame === 'top') return current;
  return incoming.screenId.state === 'available' || current.screenId.state !== 'available' ? incoming : current;
}

const FORM_CONTROL ='input:not([type="hidden"]), select, textarea';

// Chooses the element the inspector highlights for the element under the pointer.
// Classic forms lay out whole tabs inside table cells (for example td#ctl00_phG_tab_cont),
// so a cell that holds a nested table or several controls is layout, never a field.
// Inside such a cell, the nearest wrapper holding exactly one control picks that control.
export function pickTarget(element: Element | null): HTMLElement | null {
  const candidate = element?.closest('input, select, textarea, button, td, [role="gridcell"], qp-field, [data-field], [data-field-name]');
  if (!(candidate instanceof HTMLElement)) return null;
  if (candidate.tagName !== 'TD') return candidate;
  const layout = Boolean(candidate.querySelector('td, th')) || candidate.querySelectorAll(FORM_CONTROL).length > 1;
  if (!layout) return candidate;
  const label = element!.closest('label');
  if (label instanceof HTMLLabelElement && label.control instanceof HTMLElement && candidate.contains(label.control)) return label.control;
  for (let cursor: Element | null = element!; cursor && cursor !== candidate; cursor = cursor.parentElement) {
    const controls = cursor.querySelectorAll<HTMLElement>(FORM_CONTROL);
    if (controls.length === 1) return controls[0];
    if (controls.length > 1) break;
  }
  return null;
}
