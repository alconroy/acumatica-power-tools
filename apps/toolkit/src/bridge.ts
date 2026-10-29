// Runs in the page's MAIN world. Acumatica keeps its exact field metadata on
// Aurelia controllers (Modern UI) and PX client controls (Classic UI), neither
// of which is visible from an extension's isolated content-script world.
export {};

import type { FrameworkFieldMetadata, FrameworkMetadataKey } from '../../../packages/core/src/types';
import { SCREEN_ID, SCREEN_ID_BODY } from '../../../packages/core/src/screens';

declare global {
  interface Window {
    __acumaticaToolkitBridge?: boolean | { dispose: () => void };
    __px_all?: (source: Window) => Record<string, any>;
    SendCallback?: (id: string) => void;
    arPanelElemInfo?: (...args: any[]) => void;
  }
  interface Element {
    au?: Record<string, { viewModel?: any }>;
    object?: any;
  }
}

const REQUEST_CHANNEL = 'ACUMATICA_TOOLKIT_BRIDGE_REQUEST_V3';
const RESPONSE_CHANNEL = 'ACUMATICA_TOOLKIT_BRIDGE_RESPONSE_V3';
const DAC_NAMESPACE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
const DAC_MEMBER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NET_TYPES: Record<number, string> = {
  0: 'Empty', 1: 'Object', 2: 'DBNull', 3: 'Boolean', 4: 'Char', 5: 'SByte', 6: 'Byte',
  7: 'Int16', 8: 'UInt16', 9: 'Int32', 10: 'UInt32', 11: 'Int64', 12: 'UInt64',
  13: 'Single', 14: 'Double', 15: 'Decimal', 16: 'DateTime', 18: 'String'
};

if (typeof window.__acumaticaToolkitBridge === 'object') window.__acumaticaToolkitBridge.dispose();
{

  function read<T>(operation: () => T): T | undefined {
    try { return operation(); } catch { return undefined; }
  }

  function text(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const clean = value.trim();
      return clean ? clean.slice(0, 500) : undefined;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  }

  function put(metadata: FrameworkFieldMetadata, key: FrameworkMetadataKey, value: unknown, source: string) {
    if (metadata[key]) return;
    const clean = text(value);
    if (clean) metadata[key] = { value: clean, source };
  }

  function putState(metadata: FrameworkFieldMetadata, key: FrameworkMetadataKey, state: 'not-applicable' | 'unsupported', source: string) {
    if (!metadata[key]) metadata[key] = { state, source };
  }

  function controllerViewModels(element: Element | null): any[] {
    if (!element?.au) return [];
    const result: any[] = [];
    const seen = new Set<any>();
    for (const controller of Object.values(element.au)) {
      const vm = read(() => controller?.viewModel);
      if (vm && !seen.has(vm)) {
        seen.add(vm);
        result.push(vm);
      }
    }
    return result;
  }

  function ancestorViewModels(element: Element): any[] {
    const result: any[] = [];
    const seen = new Set<any>();
    let cursor: Element | null = element;
    while (cursor) {
      for (const vm of controllerViewModels(cursor)) {
        if (!seen.has(vm)) { seen.add(vm); result.push(vm); }
      }
      cursor = cursor.parentElement;
    }
    return result;
  }

  function accessibleWindows(): Window[] {
    const result: Window[] = [];
    let current: Window = window;
    while (true) {
      if (read(() => current.location.href) === undefined) break;
      result.push(current);
      const parent = read(() => current.parent);
      if (!parent || parent === current) break;
      current = parent;
    }
    return result;
  }

  function allViewModels(doc: Document): any[] {
    const result: any[] = [];
    const seen = new Set<any>();
    const roots = [doc.body, doc.documentElement, doc.querySelector('[aurelia-app]')].filter(Boolean) as Element[];
    for (const root of roots) {
      const aurelia = read(() => (root as any).aurelia);
      for (const candidate of [aurelia?.root?.viewModel, aurelia?.container?.viewModel]) {
        if (candidate && !seen.has(candidate)) { seen.add(candidate); result.push(candidate); }
        const composed = read(() => candidate?.viewModel);
        if (composed && !seen.has(composed)) { seen.add(composed); result.push(composed); }
      }
    }
    for (const node of Array.from(doc.querySelectorAll('*')).slice(0, 6000)) {
      for (const vm of controllerViewModels(node)) {
        if (!seen.has(vm)) { seen.add(vm); result.push(vm); }
      }
    }
    return result;
  }

  function screenServices(target: Element): any[] {
    const result: any[] = [];
    const seen = new Set<any>();
    const add = (candidate: any) => {
      if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
      const looksLikeScreenService = 'screenID' in candidate || 'siteMapScreenID' in candidate ||
        (typeof candidate.getGraphInfo === 'function' && 'model' in candidate);
      if (looksLikeScreenService) { seen.add(candidate); result.push(candidate); }
    };
    for (const vm of ancestorViewModels(target)) {
      add(read(() => vm.screenService));
      add(read(() => vm.screen));
      add(vm);
    }
    for (const frame of accessibleWindows()) {
      const doc = read(() => frame.document);
      if (!doc) continue;
      for (const vm of allViewModels(doc)) {
        add(read(() => vm.screenService));
        add(read(() => vm.screen));
        add(vm);
      }
    }
    return result;
  }

  function addScreenMetadata(metadata: FrameworkFieldMetadata, target: Element) {
    for (const service of screenServices(target)) {
      put(metadata, 'screenId', read(() => service.siteMapScreenID) || read(() => service.screenID) || read(() => service.id), 'framework:screen-service.screenID');
      const model = read(() => service.model) || read(() => service.Model);
      const screenName = text(read(() => model.screenName)) || text(read(() => service.screenName)) || text(read(() => model.title));
      if (screenName && !/^(?:screens?|pages?)[\\/]/i.test(screenName) && !new RegExp(`^${SCREEN_ID_BODY}(?:[\\\\/]|$)`, 'i').test(screenName)) {
        put(metadata, 'screenName', screenName, 'framework:screen-model.title');
      }
      const graph = read(() => service.getGraphInfo?.()?.graphType) || read(() => service.graphInfo?.graphType) || read(() => model.graphInfo?.graphType);
      put(metadata, 'graph', graph, 'framework:screen-service.graphInfo');
    }
    if (!metadata.screenId) {
      for (const frame of accessibleWindows()) {
        const href = read(() => frame.location.href);
        if (!href) continue;
        const url = read(() => new URL(href));
        if (!url) continue;
        for (const key of ['ScreenId', 'ScreenID', 'screenId', 'screenid']) {
          const candidate = url.searchParams.get(key);
          if (candidate && SCREEN_ID.test(candidate)) put(metadata, 'screenId', candidate.toUpperCase(), `url:${key}`);
        }
        const pathId = url.pathname.match(new RegExp(`(?:^|/)(${SCREEN_ID_BODY})(?:/|$)`, 'i'))?.[1];
        if (pathId) put(metadata, 'screenId', pathId.toUpperCase(), 'url:path');
      }
    }
  }

  function typeName(value: unknown, explicit?: unknown): string | undefined {
    return text(explicit) || (typeof value === 'number' ? NET_TYPES[value] || `Type ${value}` : text(value));
  }

  function fieldProperties(state: any, column?: any): string | undefined {
    const values: string[] = [];
    const bool = (name: string, fallback?: string) => {
      const value = read(() => state?.[name]);
      if (value === true) values.push(fallback || name);
    };
    bool('required', 'Required');
    bool('primaryKey', 'Key field');
    bool('isUdf', 'Custom field');
    bool('commitChanges', 'Commits changes');
    const enabled = read(() => state?.enabled) ?? read(() => state?.getEnabled?.());
    const readOnly = read(() => state?.readOnly) ?? read(() => state?.getReadOnly?.());
    if (enabled === false) values.push('Disabled');
    else if (readOnly === true || read(() => column?.allowUpdate) === false) values.push('Read-only');
    else if (enabled === true || readOnly === false || read(() => column?.allowUpdate) === true) values.push('Editable');
    if (read(() => state?.nullable) === false || read(() => state?.allowNull) === false || read(() => column?.allowNull) === false) values.push('Non-nullable');
    const length = read(() => state?.length);
    if (typeof length === 'number' && length > 0) values.push(`Length ${length}`);
    const precision = read(() => state?.precision);
    const scale = read(() => state?.scale);
    if (typeof precision === 'number' && precision >= 0 && typeof scale === 'number' && scale >= 0) values.push(`Precision ${precision}, scale ${scale}`);
    return values.length ? Array.from(new Set(values)).join(' · ') : undefined;
  }

  function addFieldState(metadata: FrameworkFieldMetadata, state: any, source: string) {
    if (!state || typeof state !== 'object') return;
    put(metadata, 'field', read(() => state.name), `${source}.name`);
    put(metadata, 'label', read(() => state.displayName) || read(() => state.text), `${source}.displayName`);
    put(metadata, 'view', read(() => state.viewModelName) || read(() => state.view?.name) || read(() => state.viewName), `${source}.viewModelName`);
    put(metadata, 'dac', read(() => state.dacName) || read(() => state.fieldDacName), `${source}.dacName`);
    put(metadata, 'dataType', typeName(read(() => state.type), read(() => state.typeName)), `${source}.type`);
    const unbound = read(() => state.unbound);
    if (typeof unbound === 'boolean') put(metadata, 'binding', unbound ? 'Unbound' : 'DAC-bound', `${source}.unbound`);
    put(metadata, 'properties', fieldProperties(state), `${source}.properties`);
    const schemaObject = text(read(() => state.schemaObject));
    const schemaField = text(read(() => state.schemaField));
    if (schemaObject || schemaField) put(metadata, 'selector', [schemaObject, schemaField].filter(Boolean).join('.'), `${source}.schemaObject`);
  }

  function describeContainer(element: Element, vm: any): string {
    const tag = element.tagName.toLowerCase();
    const id = text(element.id) || text(read(() => vm.id)) || text(read(() => vm.config?.id));
    const caption = text(read(() => vm.caption)) || text(read(() => vm.gridCaption));
    const view = text(read(() => vm.viewName)) || text(read(() => vm.view?.name)) || text(read(() => vm.dataMember));
    const identity = `${tag}${id ? `#${id}` : ''}`;
    return [identity, caption, view].filter(Boolean).join(' · ');
  }

  function modernGridColumn(target: Element, gridElement: Element, grid: any): any {
    const cell = target.closest('td[role="gridcell"], td') as HTMLTableCellElement | null;
    if (!cell) return undefined;
    const visible = read(() => grid.visibleCols) || read(() => grid.columns?.filter((column: any) => column.visible !== false));
    if (!Array.isArray(visible)) return undefined;
    const row = cell.parentElement;
    const offset = row?.firstElementChild?.classList.contains('row-selector') ? 1 : 0;
    return visible[cell.cellIndex - offset];
  }

  function inspectModern(target: Element, metadata: FrameworkFieldMetadata): boolean {
    const fieldElement = target.closest('qp-field, qp-inline-field');
    if (fieldElement) {
      const field = controllerViewModels(fieldElement).find(vm => read(() => vm.controlState)) || controllerViewModels(fieldElement)[0];
      if (field) {
        const state = read(() => field.controlState) || read(() => field.state);
        put(metadata, 'label', read(() => field.label), 'framework:modern-field.label');
        put(metadata, 'controlId', read(() => field.effectiveId) || read(() => field.controlId) || read(() => field.id), 'framework:modern-field.effectiveId');
        put(metadata, 'controlType', read(() => field.effectiveControlType) || read(() => field.controlType), 'framework:modern-field.effectiveControlType');
        addFieldState(metadata, state, 'framework:modern-field-state');
      }
    }

    const gridElement = target.closest('qp-grid');
    if (gridElement) {
      const grid = controllerViewModels(gridElement).find(vm => Array.isArray(read(() => vm.visibleCols))) || controllerViewModels(gridElement)[0];
      if (grid) {
        const column = modernGridColumn(target, gridElement, grid);
        const key = read(() => grid.getColumnKey?.(column)) || read(() => column.field) || read(() => column.key);
        put(metadata, 'field', key, 'framework:modern-grid-column.field');
        put(metadata, 'label', read(() => column.caption), 'framework:modern-grid-column.caption');
        put(metadata, 'view', read(() => grid.viewName) || read(() => grid.view?.name), 'framework:modern-grid.viewName');
        // Acumatica's own wiki tooltip reads the grid column's DAC from fieldDacName; column.state may omit it.
        put(metadata, 'dac', read(() => column.fieldDacName), 'framework:modern-grid-column.fieldDacName');
        put(metadata, 'controlId', read(() => grid.config?.id) || read(() => grid.id), 'framework:modern-grid.id');
        put(metadata, 'controlType', read(() => grid.getCellEditorType?.(column)) || read(() => column.editorType) || 'qp-grid cell', 'framework:modern-grid-column.editorType');
        put(metadata, 'dataType', typeName(read(() => column.dataType), read(() => column.typeName)), 'framework:modern-grid-column.dataType');
        put(metadata, 'properties', fieldProperties(read(() => column.state), column), 'framework:modern-grid-column.properties');
        const state = read(() => column.state) || read(() => grid.view?.activeRow?.[key]);
        addFieldState(metadata, state, 'framework:modern-grid-field-state');
      }
    }

    const container = target.closest('qp-grid, qp-fieldset, qp-panel, qp-data-feed');
    if (container) {
      const vm = controllerViewModels(container)[0];
      put(metadata, 'container', describeContainer(container, vm), `framework:modern-${container.tagName.toLowerCase()}`);
    }
    return Boolean(fieldElement || gridElement);
  }

  function legacyRegistry(source: Window = window): Record<string, any> {
    const all = read(() => source.__px_all?.(source));
    return all && typeof all === 'object' ? all : {};
  }

  function objectElement(value: any): Element | undefined {
    const candidate = read(() => value.element) || read(() => value.elem) || read(() => value.getElement?.());
    return candidate instanceof Element ? candidate : undefined;
  }

  function legacyObjectsFor(target: Element, registry: Record<string, any>): any[] {
    const result: any[] = [];
    const seen = new Set<any>();
    let cursor: Element | null = target;
    while (cursor) {
      const candidate = read(() => cursor!.object);
      if (candidate && !seen.has(candidate)) { seen.add(candidate); result.push(candidate); }
      if (cursor.id && registry[cursor.id] && !seen.has(registry[cursor.id])) {
        seen.add(registry[cursor.id]); result.push(registry[cursor.id]);
      }
      cursor = cursor.parentElement;
    }
    for (const candidate of Object.values(registry).slice(0, 5000)) {
      const element = objectElement(candidate);
      if (element && (element === target || element.contains(target)) && !seen.has(candidate)) {
        seen.add(candidate); result.push(candidate);
      }
    }
    return result;
  }

  function legacyVisibleColumns(grid: any): any[] {
    const columns = read(() => grid.levels?.[0]?.columns);
    if (!Array.isArray(columns)) return [];
    return columns.filter(column => read(() => column.getVisible?.()) !== false && read(() => column.visible) !== false);
  }

  function legacyGridColumn(target: Element, grid: any): any {
    const cellElement = target.closest('td') as HTMLTableCellElement | null;
    if (!cellElement) return undefined;
    for (const candidate of [read(() => cellElement.object), read(() => (cellElement as any).cell), read(() => (cellElement as any)._cell)]) {
      const column = read(() => candidate.column);
      if (column) return column;
    }
    const rows = read(() => grid.rows?.items);
    if (Array.isArray(rows)) {
      for (const row of rows.slice(0, 1000)) {
        const cells = read(() => row.cells);
        if (!Array.isArray(cells)) continue;
        for (const cell of cells) {
          const element = objectElement(cell);
          if (element === cellElement || element?.contains(cellElement)) return read(() => cell.column);
        }
      }
    }
    const root = objectElement(grid);
    const header = legacyHeaderCell(target, root);
    const headerObject = read(() => header?.object);
    const directColumn = read(() => headerObject.column) || (headerObject && text(read(() => headerObject.dataField)) ? headerObject : undefined);
    if (directColumn) return directColumn;

    const columns = legacyVisibleColumns(grid);
    const cellRect = read(() => cellElement.getBoundingClientRect());
    if (cellRect && cellRect.width > 0) {
      const centerX = cellRect.left + cellRect.width / 2;
      const positionMatches = columns.filter(column => {
        const headers = read(() => column.getHeaders?.()) || [];
        return Array.from(headers as ArrayLike<Element>).some(header => {
          const rect = read(() => header.getBoundingClientRect());
          return Boolean(rect && rect.width > 0 && centerX >= rect.left && centerX <= rect.right);
        });
      });
      if (positionMatches.length === 1) return positionMatches[0];
    }
    const fieldHint = [cellElement, header].filter(Boolean).flatMap(element => [
      element!.getAttribute('data-field'), element!.getAttribute('datafield'), element!.getAttribute('field'), element!.getAttribute('key'), element!.id
    ]).filter(Boolean).join(' ').toLocaleLowerCase();
    const fieldMatches = columns.filter(column => {
      const field = text(read(() => column.dataField)) || text(read(() => column.fieldName));
      return field ? fieldHint.includes(field.toLocaleLowerCase()) : false;
    });
    if (fieldMatches.length === 1) return fieldMatches[0];

    const headerText = text(header?.textContent)?.replace(/\s+/g, ' ').toLocaleLowerCase();
    if (headerText) {
      const captionMatches = columns.filter(column => columnCaption(column)?.replace(/\s+/g, ' ').toLocaleLowerCase() === headerText);
      if (captionMatches.length === 1) return captionMatches[0];
    }
    // A visible-array offset is not reliable for Classic grids with frozen
    // columns. Returning no column is preferable to reporting the wrong field.
    return undefined;
  }

  function columnCaption(column: any): string | undefined {
    for (const value of [read(() => column.text), read(() => column.caption), read(() => column.headerText), read(() => column.displayName),
      read(() => column.getCaption?.()), read(() => column.getText?.()), read(() => column.getHeaderText?.())]) {
      const clean = text(value); if (clean) return clean;
    }
    return undefined;
  }

  function legacyHeaderCell(target: Element, root: Element | undefined): Element | undefined {
    const cell = target.closest('td') as HTMLTableCellElement | null;
    if (!cell || !root) return undefined;
    const explicit = root.querySelectorAll('th, [role="columnheader"]');
    if (explicit.length > cell.cellIndex) return explicit.item(cell.cellIndex);

    const dataTable = cell.closest('table');
    const scrollRoot = cell.closest('[id$="_scrollDiv"], [id*="_scrollDiv"]') || root;
    const rows = Array.from(scrollRoot.querySelectorAll('tr')).filter(row => !row.contains(cell) && row.cells.length > cell.cellIndex);
    const ranked = rows.sort((left, right) => {
      const score = (row: HTMLTableRowElement) => {
        const candidate = row.cells.item(cell.cellIndex);
        let value = 0;
        if (/header|caption|head/i.test(`${row.className} ${candidate?.className || ''} ${candidate?.id || ''}`)) value += 4;
        if (row.closest('table') !== dataTable) value += 2;
        if (candidate?.textContent?.trim()) value += 1;
        return value;
      };
      return score(right) - score(left);
    });
    return rows[0]?.cells.item(cell.cellIndex) || undefined;
  }

  function legacyHeader(target: Element, root: Element | undefined, column: any): string | undefined {
    return columnCaption(column) || text(legacyHeaderCell(target, root)?.textContent)?.replace(/\s+/g, ' ');
  }

  function legacyReference(value: any, registry: Record<string, any>): any {
    if (value && typeof value === 'object') return value;
    const id = text(value);
    if (!id) return undefined;
    if (registry[id]) return registry[id];
    const lower = id.toLocaleLowerCase();
    return Object.entries(registry).slice(0, 5000).find(([key, candidate]) =>
      key.toLocaleLowerCase() === lower ||
      text(read(() => candidate.ID))?.toLocaleLowerCase() === lower ||
      text(read(() => candidate.id))?.toLocaleLowerCase() === lower ||
      text(read(() => candidate.clientID))?.toLocaleLowerCase() === lower
    )?.[1];
  }

  function legacyRelations(seeds: any[], registry: Record<string, any>): any[] {
    const result: any[] = [];
    const seen = new Set<any>();
    const queue = seeds.slice(0, 64);
    while (queue.length && result.length < 128) {
      const candidate = legacyReference(queue.shift(), registry);
      if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
      seen.add(candidate);
      result.push(candidate);
      const element = objectElement(candidate);
      const related = [
        read(() => candidate.owner), read(() => candidate.parent), read(() => candidate.container),
        read(() => candidate.bindingContainer), read(() => candidate.bindingContainerID),
        read(() => candidate.form), read(() => candidate.panel), read(() => candidate.editor),
        read(() => candidate.control), read(() => candidate.dataSource), read(() => candidate.dataSourceID),
        read(() => element?.parentElement?.object)
      ];
      queue.push(...related.filter(Boolean));
    }
    return result;
  }

  function containsControl(controls: any, related: Set<any>): boolean {
    if (!controls || typeof controls !== 'object') return false;
    const seen = new Set<any>();
    const queue = [controls];
    let checked = 0;
    while (queue.length && checked++ < 500) {
      const candidate = queue.shift();
      if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) continue;
      if (related.has(candidate)) return true;
      seen.add(candidate);
      for (const value of Object.values(candidate).slice(0, 250)) {
        if (related.has(value)) return true;
        if (value && typeof value === 'object') queue.push(value);
      }
    }
    return false;
  }

  function legacyBindingContainer(relations: any[], registry: Record<string, any>, registryValues: any[], target: Element): any {
    for (const candidate of relations) {
      const container = legacyReference(read(() => candidate.bindingContainer) || read(() => candidate.bindingContainerID), registry);
      if (container && text(read(() => container.dataMember))) return container;
    }
    const relationSet = new Set(relations);
    return relations.find(candidate => text(read(() => candidate.dataMember)) && objectElement(candidate)?.contains(target)) ||
      registryValues.find(candidate => text(read(() => candidate.dataMember)) && containsControl(read(() => candidate.controls), relationSet));
  }

  function legacyDataSource(container: any, relations: any[], registry: Record<string, any>, registryValues: any[]): any {
    const direct = legacyReference(read(() => container?.dataSource) || read(() => container?.dataSourceID), registry);
    if (direct) return direct;
    return relations.find(candidate => /PX(?:Base)?DataSource/i.test(text(read(() => candidate.__className)) || '') || text(read(() => candidate.primaryView))) ||
      registryValues.find(candidate => /PX(?:Base)?DataSource/i.test(text(read(() => candidate.__className)) || '') && read(() => candidate.isDefault) === true);
  }

  function legacyViewMetadata(dataSource: any, viewName: string | undefined): any {
    if (!dataSource || !viewName) return undefined;
    for (const collection of [
      read(() => dataSource.views), read(() => dataSource.dataViews), read(() => dataSource.viewStates),
      read(() => dataSource.schema?.views), read(() => dataSource.model?.views)
    ]) {
      if (!collection || typeof collection !== 'object') continue;
      const direct = read(() => collection[viewName]);
      if (direct) return direct;
      const lower = viewName.toLocaleLowerCase();
      const matched = Object.entries(collection).find(([key]) => key.toLocaleLowerCase() === lower)?.[1];
      if (matched) return matched;
    }
    return undefined;
  }

  function enrichClassicBinding(metadata: FrameworkFieldMetadata, container: any, fieldOwner: any, relations: any[], registry: Record<string, any>, registryValues: any[]) {
    const viewName = text(read(() => container?.dataMember)) || text(read(() => fieldOwner?.dataMember));
    const dataSource = legacyDataSource(container, relations, registry, registryValues);
    const view = legacyViewMetadata(dataSource, viewName);
    put(metadata, 'graph',
      read(() => dataSource.graphType) || read(() => dataSource.graphName) || read(() => dataSource.dataGraphType) ||
      read(() => dataSource.typeName) || read(() => dataSource.graphInfo?.graphType),
      'framework:classic-data-source.graphType');
    put(metadata, 'dac',
      read(() => fieldOwner.dacName) || read(() => fieldOwner.dataClass) || read(() => fieldOwner.cacheType) ||
      read(() => view?.dacName) || read(() => view?.dataClass) || read(() => view?.cacheType) || read(() => view?.itemType) ||
      read(() => container?.dacName) || read(() => container?.dataClass) || read(() => container?.cacheType),
      'framework:classic-view.cacheType');
    const unbound = read(() => fieldOwner?.unbound);
    if (typeof unbound === 'boolean') put(metadata, 'binding', unbound ? 'Unbound' : 'DAC-bound', 'framework:classic-control.unbound');
    else if (metadata.field && viewName) put(metadata, 'binding', metadata.dac ? 'DAC-bound' : 'View-bound', 'framework:classic-control.bindingContainer');
  }

  function inspectClassic(target: Element, metadata: FrameworkFieldMetadata): boolean {
    const registry = legacyRegistry();
    const objects = legacyObjectsFor(target, registry);
    const registryValues = Object.values(registry).slice(0, 5000);
    const grid = objects.find(candidate => Array.isArray(read(() => candidate.levels?.[0]?.columns)));
    if (grid) {
      const root = objectElement(grid);
      const gridId = text(read(() => grid.ID) || read(() => grid.id) || root?.id);
      const targetCellId = text(target.closest('td')?.id);
      const nonDataArea = Boolean(gridId && targetCellId && [`${gridId}_ab`, `${gridId}_at`].includes(targetCellId));
      const column = nonDataArea ? undefined : legacyGridColumn(target, grid);
      const relations = legacyRelations([column, grid, ...objects], registry);
      put(metadata, 'field', read(() => column.dataField) || read(() => column.fieldName), 'framework:classic-grid-column.dataField');
      put(metadata, 'label', legacyHeader(target, root, column), 'framework:classic-grid-column.header');
      put(metadata, 'view', read(() => grid.dataMember), 'framework:classic-grid.dataMember');
      put(metadata, 'dac', read(() => column.dacName) || read(() => column.dataClass) || read(() => grid.dacName), 'framework:classic-grid-column.dacName');
      put(metadata, 'controlId', read(() => grid.id) || read(() => grid.clientID) || root?.id, 'framework:classic-grid.id');
      put(metadata, 'controlType', nonDataArea ? 'PXGrid status/action area' : read(() => column.editorType) || read(() => column.__className) || 'PXGrid cell', 'framework:classic-grid-column.editorType');
      put(metadata, 'container', ['PXGrid', text(read(() => grid.id) || root?.id), text(read(() => grid.dataMember))].filter(Boolean).join(' · '), 'framework:classic-grid');
      put(metadata, 'dataType', typeName(read(() => column.dataType), read(() => column.dataTypeName)), 'framework:classic-grid-column.dataType');
      put(metadata, 'properties', fieldProperties(column, column), 'framework:classic-grid-column.properties');
      const unbound = read(() => column.unbound);
      if (typeof unbound === 'boolean') put(metadata, 'binding', unbound ? 'Unbound' : 'DAC-bound', 'framework:classic-grid-column.unbound');
      enrichClassicBinding(metadata, grid, column, relations, registry, registryValues);
      if (nonDataArea) {
        for (const key of ['label', 'field', 'dac', 'dataType', 'binding', 'properties', 'selector', 'currentValue'] as const) {
          putState(metadata, key, 'not-applicable', 'applicability:classic-grid-status-area');
        }
      }
      return true;
    }

    const relations = legacyRelations(objects, registry);
    const control = relations.find(candidate => text(read(() => candidate.dataField))) ||
      relations.find(candidate => text(read(() => candidate.bindingContainer)) || text(read(() => candidate.serverID)));
    if (!control) return false;
    const controlElement = objectElement(control);
    const fieldOwner = relations.find(candidate => text(read(() => candidate.dataField)) || text(read(() => candidate.fieldName))) || control;
    put(metadata, 'field', read(() => fieldOwner.dataField) || read(() => fieldOwner.fieldName), 'framework:classic-control.dataField');
    put(metadata, 'controlId', read(() => control.ID) || read(() => control.id) || read(() => control.clientID) || controlElement?.id, 'framework:classic-control.id');
    put(metadata, 'controlType', read(() => control.__className) || read(() => control.constructor?.name), 'framework:classic-control.className');
    put(metadata, 'label', read(() => control.getLabelText?.()) || read(() => control.label?.text) || read(() => control.caption) || read(() => control.labelText), 'framework:classic-control.label');
    put(metadata, 'dac', read(() => fieldOwner.dacName) || read(() => fieldOwner.dataClass) || read(() => fieldOwner.cacheType), 'framework:classic-control.dacName');
    put(metadata, 'dataType', typeName(read(() => fieldOwner.dataType), read(() => fieldOwner.dataTypeName)), 'framework:classic-control.dataType');
    put(metadata, 'properties', fieldProperties(fieldOwner, fieldOwner), 'framework:classic-control.properties');
    const form = legacyBindingContainer(relations, registry, registryValues, target);
    if (form) {
      put(metadata, 'view', read(() => form.dataMember), 'framework:classic-form.dataMember');
      put(metadata, 'container', ['PXFormView', text(read(() => form.ID) || read(() => form.id) || objectElement(form)?.id), text(read(() => form.dataMember))].filter(Boolean).join(' · '), 'framework:classic-form');
      put(metadata, 'dac', read(() => form.dacName) || read(() => form.dataClass), 'framework:classic-form.dacName');
    }
    enrichClassicBinding(metadata, form, fieldOwner, relations, registry, registryValues);
    return true;
  }

  function collect(target: Element): FrameworkFieldMetadata {
    const metadata: FrameworkFieldMetadata = {};
    const modern = inspectModern(target, metadata);
    if (!modern) inspectClassic(target, metadata);
    addScreenMetadata(metadata, target);
    return metadata;
  }

  function classicApplicationLocation(): { endpoint: URL; pagePath: string } {
    const segments = location.pathname.split('/').filter(Boolean);
    const routeIndex = segments.findIndex(segment => /^(?:Pages|Frames|Main|Screens|Scripts|Customization|dacBrowser)$/i.test(segment));
    const appSegments = routeIndex >= 0 ? segments.slice(0, routeIndex) : [];
    const pageSegments = routeIndex >= 0 ? segments.slice(routeIndex) : segments;
    const appPath = `/${appSegments.length ? `${appSegments.join('/')}/` : ''}`;
    return {
      endpoint: new URL(`${appPath}Customization/WikiTooltip.aspx`, location.origin),
      pagePath: `~/${pageSegments.join('/')}`
    };
  }

  function verifiedClassicClientId(target: Element, metadata: FrameworkFieldMetadata): string | undefined {
    const candidates = [metadata.controlId?.value, target.id, target.closest('[id]')?.id];
    for (const candidate of candidates) {
      const clean = text(candidate)?.replace(/_(?:text|input)$/i, '');
      if (clean && /^[A-Za-z0-9_$:-]{1,300}$/.test(clean)) return clean;
    }
    return undefined;
  }

  function nativeClassicTargetId(target: Element): string | undefined {
    const registry = legacyRegistry();
    const objects = legacyObjectsFor(target, registry);
    const grid = objects.find(candidate => Array.isArray(read(() => candidate.levels?.[0]?.columns)));
    if (grid) {
      const gridId = text(read(() => grid.ID) || read(() => grid.id) || objectElement(grid)?.id);
      const targetCellId = text(target.closest('td')?.id);
      if (gridId && targetCellId && [`${gridId}_ab`, `${gridId}_at`].includes(targetCellId)) return undefined;
      const column = legacyGridColumn(target, grid);
      const dataField = text(read(() => column.dataField) || read(() => column.fieldName));
      if (!column || !dataField || !DAC_MEMBER.test(dataField)) return undefined;
      const levelIndex = read(() => column.level?.index) ?? 0;
      const columnIndex = read(() => column.index) ?? read(() => column.initialIndex);
      const headerId = text(read(() => column.getElementID?.('colHS'))) ||
        (gridId && typeof columnIndex === 'number' ? `${gridId}_colHS_${levelIndex}_${columnIndex}` : undefined);
      return headerId ? `${headerId}|dataField=${dataField}` : undefined;
    }
    const id = text(target.id) || text(target.closest('[id]')?.id);
    return id && /^[A-Za-z0-9_$:-]{1,300}$/.test(id) ? id : undefined;
  }

  function nativeInspectorValue(registry: Record<string, any>, fieldName: string, doc: Document = document): string | undefined {
    const suffix = fieldName.toLocaleLowerCase();
    const candidates = Object.entries(registry).filter(([key, candidate]) => {
      const identity = [key, read(() => candidate.ID), read(() => candidate.id), read(() => candidate.serverID), objectElement(candidate)?.id]
        .map(value => text(value)?.toLocaleLowerCase()).filter(Boolean) as string[];
      return identity.some(value => value === suffix || value.endsWith(`_${suffix}`) || value.endsWith(`_${suffix}_text`));
    });
    for (const [, candidate] of candidates) {
      for (const value of [read(() => candidate.getValue?.()), read(() => candidate.getText?.()), read(() => candidate.elemText?.value), read(() => (objectElement(candidate) as HTMLInputElement)?.value)]) {
        const clean = text(value);
        if (clean) return clean;
      }
    }
    for (const element of Array.from(doc.querySelectorAll<HTMLInputElement>('input[id], textarea[id]')).slice(0, 6000)) {
      const id = element.id.toLocaleLowerCase();
      if (id === suffix || id.endsWith(`_${suffix}`) || id.endsWith(`_${suffix}_text`)) {
        const clean = text(element.value);
        if (clean) return clean;
      }
    }
    return undefined;
  }

  function closeNativeInspector(registry: Record<string, any>) {
    const panel = Object.entries(registry).find(([key, candidate]) => {
      const identity = `${key} ${text(read(() => candidate.ID)) || ''} ${text(read(() => candidate.id)) || ''}`;
      return /(?:^|_)PanelElemInfo(?:\s|$)/i.test(identity) && typeof read(() => candidate.hide) === 'function';
    })?.[1];
    read(() => panel?.hide?.());
  }

  async function nativeInspectorMetadata(target: Element): Promise<{
    metadata: { field?: string; view?: string; dac?: string; graph?: string };
    detail: string;
  }> {
    const targetId = nativeClassicTargetId(target);
    if (!targetId) return { metadata: {}, detail: 'selected-element-has-no-native-field-id' };
    const host = accessibleWindows().find(frame => typeof read(() => frame.SendCallback) === 'function');
    if (!host) return { metadata: {}, detail: 'native-inspector-callback-not-found' };
    const hostDocument = read(() => host.document);
    if (!hostDocument) return { metadata: {}, detail: 'native-inspector-document-not-accessible' };
    const beforeRegistry = legacyRegistry(host);
    const before = ['FieldName', 'ViewName', 'CacheType', 'GraphName'].map(name => nativeInspectorValue(beforeRegistry, name, hostDocument)).join('|');
    const previous = host.arPanelElemInfo;
    let repainted = false;
    host.arPanelElemInfo = function (this: unknown, ...args: any[]) {
      try { previous?.apply(this, args); } finally { repainted = true; }
    };
    try {
      host.SendCallback!(targetId);
      let registry = beforeRegistry;
      let result: { field?: string; view?: string; dac?: string; graph?: string } = {};
      let changed = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 100));
        registry = legacyRegistry(host);
        result = {
          field: nativeInspectorValue(registry, 'FieldName', hostDocument),
          view: nativeInspectorValue(registry, 'ViewName', hostDocument),
          dac: nativeInspectorValue(registry, 'CacheType', hostDocument),
          graph: nativeInspectorValue(registry, 'GraphName', hostDocument)
        };
        const signature = [result.field, result.view, result.dac, result.graph].join('|');
        changed = Boolean(signature && signature !== before);
        if ((repainted || changed) && Object.values(result).some(Boolean)) break;
      }
      if (!Object.values(result).some(Boolean)) return { metadata: {}, detail: repainted ? 'native-inspector-returned-no-field-data' : 'native-inspector-callback-timed-out' };
      closeNativeInspector(registry);
      return { metadata: result, detail: repainted ? 'native-inspector-repaint-completed' : changed ? 'native-inspector-values-updated' : 'native-inspector-values-read-after-timeout' };
    } catch {
      return { metadata: {}, detail: 'native-inspector-callback-threw' };
    } finally {
      if (host.arPanelElemInfo !== previous) {
        if (previous) host.arPanelElemInfo = previous;
        else delete host.arPanelElemInfo;
      }
    }
  }

  function dacPartsFromLink(rawHref: string | null): { dac?: string; field?: string } {
    if (!rawHref) return {};
    const { endpoint } = classicApplicationLocation();
    const normalized = rawHref.trim().replace(/^~\//, endpoint.pathname.replace(/Customization\/WikiTooltip\.aspx$/i, ''));
    const url = read(() => new URL(normalized, endpoint));
    if (!url || url.origin !== location.origin) return {};
    const segments = url.pathname.split('/').filter(Boolean).map(segment => read(() => decodeURIComponent(segment)) || '');
    const dacIndex = segments.findIndex(segment => segment.toLocaleLowerCase() === 'dacbrowser');
    if (dacIndex < 0 || segments.length < dacIndex + 3) return {};
    const namespace = segments[dacIndex + 1];
    const entity = segments[dacIndex + 2];
    const field = segments[dacIndex + 3];
    if (!DAC_NAMESPACE.test(namespace) || !DAC_MEMBER.test(entity)) return {};
    return {
      dac: `${namespace}.${entity}`,
      field: field && DAC_MEMBER.test(field) ? field : undefined
    };
  }

  async function resolveClassicMetadata(target: Element, metadata: FrameworkFieldMetadata): Promise<{
    status: 'resolved' | 'unavailable' | 'failed'; detail: string;
  }> {
    if (metadata.controlType?.value?.startsWith('qp-')) return { status: 'unavailable', detail: 'not-a-classic-control' };
    if (metadata.controlType?.value === 'PXGrid status/action area') return { status: 'unavailable', detail: 'selected-grid-area-is-not-a-data-field' };
    const knownBefore = Object.keys(metadata).length;
    const nativeResult = await nativeInspectorMetadata(target);
    const native = nativeResult.metadata;
    put(metadata, 'field', native.field, 'acumatica:native-inspector');
    put(metadata, 'view', native.view, 'acumatica:native-inspector');
    put(metadata, 'graph', native.graph, 'acumatica:native-inspector');
    const nativeQualifiedDac = native.dac && native.dac.includes('.') ? native.dac : undefined;
    put(metadata, 'dac', nativeQualifiedDac, 'acumatica:native-inspector');

    const { endpoint, pagePath } = classicApplicationLocation();
    const field = metadata.field?.value;
    const view = metadata.view?.value;
    const clientId = verifiedClassicClientId(target, metadata);
    if ((!field || !view) && !clientId) {
      put(metadata, 'dac', native.dac, 'acumatica:native-inspector');
      return Object.keys(metadata).length > knownBefore
        ? { status: 'resolved', detail: nativeResult.detail }
        : { status: 'unavailable', detail: nativeResult.detail };
    }

    if (metadata.screenId?.value) endpoint.searchParams.set('screenId', metadata.screenId.value);
    if (metadata.label?.value) endpoint.searchParams.set('labelText', metadata.label.value);
    if (metadata.screenName?.value) endpoint.searchParams.set('screenTitle', metadata.screenName.value);
    endpoint.searchParams.set('path', pagePath);
    if (field && view) {
      endpoint.searchParams.set('fieldName', field);
      endpoint.searchParams.set('viewName', view);
    } else if (clientId) {
      endpoint.searchParams.set('clientId', clientId);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        put(metadata, 'dac', native.dac, 'acumatica:native-inspector');
        return Object.keys(metadata).length > knownBefore
          ? { status: 'resolved', detail: nativeResult.detail }
          : { status: 'failed', detail: `field-help-http-${response.status}; ${nativeResult.detail}` };
      }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const fieldLink = dacPartsFromLink(doc.querySelector<HTMLAnchorElement>('#dacBrowserToFieldRef')?.getAttribute('href') || null);
      const entityLink = dacPartsFromLink(doc.querySelector<HTMLAnchorElement>('#dacBrowserToEntityRef')?.getAttribute('href') || null);
      const resolvedDac = fieldLink.dac || entityLink.dac;
      const resolvedField = fieldLink.field;
      if (!resolvedDac && !resolvedField) {
        put(metadata, 'dac', native.dac, 'acumatica:native-inspector');
        return Object.keys(metadata).length > knownBefore
          ? { status: 'resolved', detail: nativeResult.detail }
          : { status: 'unavailable', detail: `field-help-returned-no-dac-link; ${nativeResult.detail}` };
      }
      put(metadata, 'dac', resolvedDac, 'acumatica:classic-metadata-service');
      put(metadata, 'field', resolvedField, 'acumatica:classic-metadata-service');
      if (metadata.dac && metadata.field && metadata.view) {
        put(metadata, 'binding', 'DAC-bound', 'acumatica:classic-metadata-service');
      }
      return { status: 'resolved', detail: `${nativeResult.detail}; field-help-dac-link-resolved` };
    } catch {
      put(metadata, 'dac', native.dac, 'acumatica:native-inspector');
      return Object.keys(metadata).length > knownBefore
        ? { status: 'resolved', detail: nativeResult.detail }
        : { status: 'failed', detail: `field-help-request-failed; ${nativeResult.detail}` };
    } finally {
      window.clearTimeout(timer);
    }
  }

  const bridgeMessageListener = (event: MessageEvent) => {
    if (event.source !== window || event.data?.channel !== REQUEST_CHANNEL || typeof event.data?.requestId !== 'string') return;
    const requestId = event.data.requestId as string;
    const token = event.data.token as string;
    const target = Array.from(document.querySelectorAll('[data-acu-inspector-token]')).find(element => element.getAttribute('data-acu-inspector-token') === token);
    void (async () => {
      let metadata: FrameworkFieldMetadata = {};
      let resolverStatus: 'resolved' | 'unavailable' | 'failed' | undefined;
      let resolverDetail: string | undefined;
      try {
        if (target) {
          metadata = collect(target);
          if (event.data?.resolveClassic === true) {
            const resolution = await resolveClassicMetadata(target, metadata);
            resolverStatus = resolution.status;
            resolverDetail = resolution.detail;
          }
        }
      } catch {
        resolverStatus = event.data?.resolveClassic === true ? 'failed' : undefined;
        resolverDetail = event.data?.resolveClassic === true ? 'bridge-resolution-error' : undefined;
      }
      window.postMessage({ channel: RESPONSE_CHANNEL, requestId, metadata, resolverStatus, resolverDetail }, '*');
    })();
  };
  window.addEventListener('message', bridgeMessageListener);
  window.__acumaticaToolkitBridge = {
    dispose() { window.removeEventListener('message', bridgeMessageListener); }
  };
}
