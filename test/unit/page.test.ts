import { beforeEach, describe, expect, it } from 'vitest';
import { detectUi, extractFieldContext, extractPageContext, extractScreenId, pickTarget, preferPageContext } from '../../packages/core/src/page';
import { mergeFrameworkMetadata } from '../../packages/core/src/metadata';

beforeEach(() => {
  document.documentElement.innerHTML = '<head><title>Acumatica</title></head><body></body>';
  history.replaceState({}, '', '/');
});

describe('Classic and Modern adapters', () => {
  it('detects and extracts a Classic form field', () => {
    history.replaceState({}, '', '/Frames/Default.aspx?ScreenId=SO301000&OrderNbr=SO123');
    document.body.innerHTML = '<form id="form1"><label for="ctl00_phF_form_edCustomerID">Customer</label><input id="ctl00_phF_form_edCustomerID" data-field="CustomerID" data-view="Document" data-dac="SOOrder" value="C00042"></form>';
    expect(detectUi(document)).toBe('classic');
    const context = extractFieldContext(document.querySelector('input')!, true);
    expect(context.page.screenId.value).toBe('SO301000');
    expect(context.label.value).toBe('Customer');
    expect(context.field.value).toBe('CustomerID');
    expect(context.currentValue.value).toBe('C00042');
  });

  it('detects a Modern field and reports genuinely missing metadata', () => {
    history.replaceState({}, '', '/acumatica/Main?ScreenId=AR303000');
    document.body.innerHTML = '<div aurelia-app="main"><qp-field data-label="Customer name"><input aria-label="Customer name" value="Northwind"></qp-field></div>';
    expect(detectUi(document)).toBe('modern');
    const context = extractFieldContext(document.querySelector('input')!, false);
    expect(context.label.value).toBe('Customer name');
    expect(context.field.state).toBe('unavailable');
    expect(context.dac.state).toBe('unavailable');
    expect(context.currentValue.source).toBe('user-disabled');
  });

  it('handles grid cells and dialog fields', () => {
    document.body.innerHTML = '<qp-panel><table><tr><td role="gridcell" data-column="Inventory ID" data-field-name="InventoryID">A100</td></tr></table></qp-panel>';
    const context = extractFieldContext(document.querySelector('td')!, true);
    expect(context.label.value).toBe('Inventory ID');
    expect(context.field.value).toBe('InventoryID');
    expect(context.currentValue.value).toBe('A100');
  });

  it('merges framework metadata without replacing the opt-in DOM value', () => {
    document.body.innerHTML = '<qp-field><input value="Current value"></qp-field>';
    const dom = extractFieldContext(document.querySelector('input')!, true);
    const context = mergeFrameworkMetadata(dom, {
      screenId: { value: 'FS300200', source: 'framework:screen-service.screenID' },
      field: { value: 'ServiceTier', source: 'framework:modern-field-state.name' },
      view: { value: 'ServiceOrderRecords', source: 'framework:modern-field-state.viewModelName' }
    });
    expect(context.page.screenId.value).toBe('FS300200');
    expect(context.field.value).toBe('ServiceTier');
    expect(context.view.value).toBe('ServiceOrderRecords');
    expect(context.currentValue.value).toBe('Current value');
  });

  it('never captures password or hidden values', () => {
    document.body.innerHTML = '<input type="password" data-field="Password" value="secret"><input type="hidden" data-field="Token" value="token">';
    expect(extractFieldContext(document.querySelector('input[type=password]')!, true).currentValue.state).toBe('unsupported');
    expect(extractFieldContext(document.querySelector('input[type=hidden]')!, true).currentValue.state).toBe('unsupported');
  });

  it('extracts path Screen IDs and tenant context', () => {
    history.replaceState({}, '', '/acumatica/t/Demo/SO301000/Details?RefNbr=123');
    document.title = 'Sales Orders (SO301000) - Acumatica';
    expect(extractScreenId(location, document).value).toBe('SO301000');
    const page = extractPageContext(document);
    expect(page.tenant.value).toBe('Demo');
    expect(page.screenName.value).toBe('Sales Orders (SO301000)');
  });
});

describe('inspection picker', () => {
  it('never picks a Classic tab layout cell and maps a field wrapper to its single control', () => {
    document.body.innerHTML = `
      <table id="ctl00_phG_tab"><tbody><tr><td id="ctl00_phG_tab_cont">
        <div id="col1">
          <div id="ctl00_phG_tab_t0_lblItemClassID"><label id="itemClassLabel" for="ctl00_phG_tab_t0_edItemClassID_text">Item Class</label></div>
          <div id="ctl00_phG_tab_t0_edItemClassID"><input id="ctl00_phG_tab_t0_edItemClassID_text" value="MERCH - Merchandise"><input type="hidden" value="state"><span class="btn"></span></div>
          <div id="lotWrapper"><label id="lotLabel">Lot/Serial Class</label><div id="ctl00_phG_tab_t0_edLotSerClassID"><input id="ctl00_phG_tab_t0_edLotSerClassID_text"></div></div>
        </div>
      </td></tr></tbody></table>
      <table id="grid"><tbody><tr><td id="cell">4,615.20</td></tr></tbody></table>`;
    const byId = (id: string) => document.getElementById(id);
    expect(pickTarget(byId('ctl00_phG_tab_cont'))).toBeNull();
    expect(pickTarget(byId('col1'))).toBeNull();
    expect(pickTarget(byId('ctl00_phG_tab_t0_edLotSerClassID_text'))).toBe(byId('ctl00_phG_tab_t0_edLotSerClassID_text'));
    expect(pickTarget(byId('lotLabel'))).toBe(byId('ctl00_phG_tab_t0_edLotSerClassID_text'));
    expect(pickTarget(document.querySelector('#ctl00_phG_tab_t0_edItemClassID .btn'))).toBe(byId('ctl00_phG_tab_t0_edItemClassID_text'));
    expect(pickTarget(byId('itemClassLabel'))).toBe(byId('ctl00_phG_tab_t0_edItemClassID_text'));
    expect(pickTarget(byId('cell'))).toBe(byId('cell'));
  });
});

describe('custom Screen IDs and CompanyID tenants', () => {
  it('reads FS3001PL and the CompanyID tenant from the URL', () => {
    history.replaceState({}, '', '/Main?CompanyID=Live&ScreenId=FS3001PL');
    const page = extractPageContext(document, window.location);
    expect(page.screenId).toEqual({ state: 'available', value: 'FS3001PL', source: 'url:ScreenId' });
    expect(page.tenant).toEqual({ state: 'available', value: 'Live', source: 'url:CompanyID' });
  });
});

describe('page context across frames', () => {
  it('keeps the top frame context when nested frames report after it', () => {
    history.replaceState({}, '', '/Main?CompanyID=Live&ScreenId=SO301000');
    const top = extractPageContext(document, window.location);
    const nested = { ...top, frame: 'same-origin-frame' as const, url: 'https://erp.example/Frames/Blank.aspx', screenId: { state: 'unavailable' as const } };
    const nestedWithScreen = { ...nested, screenId: { state: 'available' as const, value: 'SO301000', source: 'url:path' } };
    expect(preferPageContext(top, nested)).toBe(top);
    expect(preferPageContext(nested, top)).toBe(top);
    expect(preferPageContext(null, nested)).toBe(nested);
    expect(preferPageContext(nested, nestedWithScreen)).toBe(nestedWithScreen);
    expect(preferPageContext(nestedWithScreen, nested)).toBe(nestedWithScreen);
    const blank = { ...nested, url: 'about:blank' }, srcdoc = { ...top, url: 'about:srcdoc' };
    expect(preferPageContext(top, blank)).toBe(top);
    expect(preferPageContext(nested, srcdoc)).toBe(nested);
    expect(preferPageContext(null, blank)).toBeNull();
  });
});
