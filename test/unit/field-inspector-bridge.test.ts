import { expect, it, vi } from 'vitest';
import type { FrameworkFieldMetadata } from '../../packages/core/src/types';

async function requestMetadata(token: string): Promise<FrameworkFieldMetadata> {
  return (await requestBridge(token)).metadata;
}

async function requestBridge(token: string, resolveClassic = false): Promise<{ metadata: FrameworkFieldMetadata; resolverStatus?: string }> {
  const requestId = crypto.randomUUID();
  return new Promise(resolve => {
    const listener = (event: MessageEvent) => {
      if (event.data?.channel !== 'ACUMATICA_TOOLKIT_BRIDGE_RESPONSE_V3' || event.data?.requestId !== requestId) return;
      window.removeEventListener('message', listener);
      resolve({ metadata: event.data.metadata as FrameworkFieldMetadata, resolverStatus: event.data.resolverStatus as string | undefined });
    };
    window.addEventListener('message', listener);
    window.dispatchEvent(new MessageEvent('message', {
      data: { channel: 'ACUMATICA_TOOLKIT_BRIDGE_REQUEST_V3', requestId, token, resolveClassic },
      source: window
    }));
  });
}

it('reads the Modern grid column DAC from fieldDacName when the column state omits it', async () => {
  await import('../../apps/toolkit/src/bridge');

  document.body.innerHTML = '<div aurelia-app="main"><qp-grid id="grid-Details"><table><tbody><tr><td class="row-selector"></td><td role="gridcell"><span data-acu-inspector-token="modern-grid-case">618.00</span></td></tr></tbody></table></qp-grid></div>';
  const gridElement = document.querySelector('qp-grid') as Element & { au?: unknown };
  const column = {
    field: 'CuryUnitPrice',
    caption: 'Unit Price',
    fieldDacName: 'PX.Objects.SO.SOLine',
    state: { name: 'CuryUnitPrice', viewModelName: 'Transactions', typeName: 'System.Decimal', unbound: false }
  };
  gridElement.au = { controller: { viewModel: { id: 'grid-Details', viewName: 'Transactions', visibleCols: [column] } } };

  const modernGrid = await requestMetadata('modern-grid-case');
  expect(modernGrid.field?.value).toBe('CuryUnitPrice');
  expect(modernGrid.view?.value).toBe('Transactions');
  expect(modernGrid.dac).toEqual({ value: 'PX.Objects.SO.SOLine', source: 'framework:modern-grid-column.fieldDacName' });
  expect(modernGrid.binding?.value).toBe('DAC-bound');
});

it('reads exact Modern field state plus Classic grid and form metadata from Acumatica client controls', async () => {
  await import('../../apps/toolkit/src/bridge');

  document.body.innerHTML = '<div aurelia-app="main"><qp-field id="tier"><input data-acu-inspector-token="modern-case"></qp-field></div>';
  const field = document.querySelector('qp-field') as Element & { au?: unknown };
  field.au = {
    controller: {
      viewModel: {
        effectiveId: 'edServiceOrderRecords-FSEquipment__UsrNAWTKMServiceTier_text',
        effectiveControlType: 'qp-selector',
        label: 'Service Tier',
        screenService: {
          siteMapScreenID: 'FS300200',
          model: { title: 'Service Orders' },
          getGraphInfo: () => ({ graphType: 'PX.Objects.FS.ServiceOrderEntry' })
        },
        controlState: {
          name: 'FSEquipment__UsrNAWTKMServiceTier',
          displayName: 'Service Tier',
          viewModelName: 'ServiceOrderRecords',
          dacName: 'PX.Objects.FS.FSEquipment',
          typeName: 'System.String',
          unbound: false,
          required: true,
          isUdf: true,
          enabled: true,
          length: 60
        }
      }
    }
  };

  const modern = await requestMetadata('modern-case');
  expect(modern.screenId?.value).toBe('FS300200');
  expect(modern.field?.value).toBe('FSEquipment__UsrNAWTKMServiceTier');
  expect(modern.view?.value).toBe('ServiceOrderRecords');
  expect(modern.dac?.value).toBe('PX.Objects.FS.FSEquipment');
  expect(modern.label?.value).toBe('Service Tier');
  expect(modern.properties?.value).toContain('Custom field');

  document.body.innerHTML = '<div id="grid"><table><tbody><tr class="GridHeader"><td>Ext. Price</td></tr></tbody></table><table><tbody><tr><td data-acu-inspector-token="classic-case">4,615.20</td></tr></tbody></table></div>';
  const gridElement = document.querySelector('#grid') as Element & { object?: unknown };
  const column = { dataField: 'CuryExtPrice', caption: 'Ext. Price', dataType: 15, allowUpdate: true, getVisible: () => true };
  const cellElement = document.querySelector('[data-acu-inspector-token="classic-case"]') as Element & { object?: unknown };
  cellElement.object = { column };
  const grid = {
    id: 'gridTransactions',
    element: gridElement,
    dataMember: 'Transactions',
    levels: [{ columns: [column] }],
    rows: { items: [] }
  };
  gridElement.object = grid;
  (window as any).__px_all = () => ({ gridTransactions: grid });

  const classic = await requestMetadata('classic-case');
  expect(classic.field?.value).toBe('CuryExtPrice');
  expect(classic.view?.value).toBe('Transactions');
  expect(classic.label?.value).toBe('Ext. Price');
  expect(classic.dataType?.value).toBe('Decimal');
  expect(classic.controlType?.value).toBe('PXGrid cell');

  document.body.innerHTML = `
    <div id="ctl00_phDS_ds"></div>
    <div id="ctl00_phF_form">
      <span id="ctl00_phF_form_t0_edPSDefaultSiteID">
        <input id="ctl00_phF_form_t0_edPSDefaultSiteID_text" data-acu-inspector-token="classic-form-case">
      </span>
    </div>`;
  const selectorElement = document.querySelector('#ctl00_phF_form_t0_edPSDefaultSiteID') as Element & { object?: unknown };
  const selectorInput = document.querySelector('[data-acu-inspector-token="classic-form-case"]') as Element & { object?: unknown };
  const formElement = document.querySelector('#ctl00_phF_form') as Element & { object?: unknown };
  const dataSourceElement = document.querySelector('#ctl00_phDS_ds') as Element & { object?: unknown };
  const selector = {
    ID: 'ctl00_phF_form_t0_edPSDefaultSiteID',
    element: selectorElement,
    __className: 'PXSegmentMask',
    serverID: 'edPSDefaultSiteID',
    dataField: 'DefaultSiteID',
    bindingContainer: 'ctl00_phF_form',
    allowNull: false,
    required: true,
    commitChanges: true,
    getEnabled: () => true,
    getReadOnly: () => false,
    getLabelText: () => 'Preferred Warehouse ID:'
  };
  const form = {
    ID: 'ctl00_phF_form',
    element: formElement,
    __className: 'PXFormView',
    dataMember: 'Document',
    dataSourceID: 'ctl00_phDS_ds',
    controls: { ctl00_phF_form_t0_edPSDefaultSiteID: selector }
  };
  const dataSource = {
    ID: 'ctl00_phDS_ds',
    element: dataSourceElement,
    __className: 'PXBaseDataSource',
    primaryView: 'Document',
    graphType: 'PX.Objects.SO.SOOrderEntry',
    views: { Document: { cacheType: 'PX.Objects.SO.SOOrder' } }
  };
  selectorElement.object = selector;
  selectorInput.object = selector;
  formElement.object = form;
  dataSourceElement.object = dataSource;
  const classicRegistry: Record<string, any> = {
    ctl00_phDS_ds: dataSource,
    ctl00_phF_form: form,
    ctl00_phF_form_t0_edPSDefaultSiteID: selector
  };
  (window as any).__px_all = () => classicRegistry;

  const classicForm = await requestMetadata('classic-form-case');
  expect(classicForm.field?.value).toBe('DefaultSiteID');
  expect(classicForm.field?.value).not.toBe('edPSDefaultSiteID');
  expect(classicForm.view?.value).toBe('Document');
  expect(classicForm.dac?.value).toBe('PX.Objects.SO.SOOrder');
  expect(classicForm.graph?.value).toBe('PX.Objects.SO.SOOrderEntry');
  expect(classicForm.binding?.value).toBe('DAC-bound');
  expect(classicForm.properties?.value).toContain('Required');
  expect(classicForm.properties?.value).toContain('Editable');
  expect(classicForm.container?.value).toContain('Document');

  delete (selector as any).dataField;
  delete (dataSource as any).graphType;
  (dataSource as any).views = {};
  const hideNativePanel = vi.fn();
  (window as any).SendCallback = (targetId: string) => {
    expect(targetId).toBe('ctl00_phF_form_t0_edPSDefaultSiteID_text');
    Object.assign(classicRegistry, {
      ctl00_FormElemInfo_FieldName: { ID: 'ctl00_FormElemInfo_FieldName', getValue: () => 'DefaultSiteID' },
      ctl00_FormElemInfo_ViewName: { ID: 'ctl00_FormElemInfo_ViewName', getValue: () => 'Document' },
      ctl00_FormElemInfo_CacheType: { ID: 'ctl00_FormElemInfo_CacheType', getValue: () => 'SOOrder' },
      ctl00_FormElemInfo_GraphName: { ID: 'ctl00_FormElemInfo_GraphName', getValue: () => 'SOOrderEntry' },
      ctl00_PanelElemInfo: { ID: 'ctl00_PanelElemInfo', hide: hideNativePanel }
    });
    window.setTimeout(() => (window as any).arPanelElemInfo?.(), 0);
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`
    <a id="dacBrowserToEntityRef" href="~/dacBrowser/PX.Objects.SO/SOOrder">SOOrder</a>
    <a id="dacBrowserToFieldRef" href="~/dacBrowser/PX.Objects.SO/SOOrder/DefaultSiteID">DefaultSiteID</a>
  `, { status: 200, headers: { 'content-type': 'text/html' } })));

  const resolved = await requestBridge('classic-form-case', true);
  expect(resolved.resolverStatus).toBe('resolved');
  expect(resolved.metadata.field?.value).toBe('DefaultSiteID');
  expect(resolved.metadata.dac?.value).toBe('PX.Objects.SO.SOOrder');
  expect(resolved.metadata.graph?.value).toBe('SOOrderEntry');
  expect(resolved.metadata.field?.source).toBe('acumatica:native-inspector');
  expect(hideNativePanel).toHaveBeenCalledOnce();
  const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
  expect(requestUrl).toContain('/Customization/WikiTooltip.aspx?');
  expect(requestUrl).toContain('fieldName=DefaultSiteID');
  expect(requestUrl).toContain('viewName=Document');
  expect(requestUrl).not.toContain('03+-+Hose+Assembly+Center+Warehouse');

  document.body.innerHTML = '<div id="gridStatus"><table><tbody><tr><td id="gridStatus_ab" data-acu-inspector-token="classic-status-case">On Hand 40 EA</td></tr></tbody></table></div>';
  const statusGridElement = document.querySelector('#gridStatus') as Element & { object?: unknown };
  const statusGrid = { ID: 'gridStatus', element: statusGridElement, dataMember: 'Transactions', levels: [{ columns: [] }], rows: { items: [] } };
  statusGridElement.object = statusGrid;
  (window as any).__px_all = () => ({ gridStatus: statusGrid });
  const statusArea = await requestMetadata('classic-status-case');
  expect(statusArea.controlType?.value).toBe('PXGrid status/action area');
  expect(statusArea.field?.state).toBe('not-applicable');
  expect(statusArea.dac?.state).toBe('not-applicable');
  expect(statusArea.currentValue?.state).toBe('not-applicable');
});
