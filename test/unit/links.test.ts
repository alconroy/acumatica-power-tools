import { describe, expect, it } from 'vitest';
import type { PageContext } from '../../packages/core/src/types';
import { buildDacBrowserUrl, buildDacSourceUrl, buildSafeScreenLink, siteRoot, buildSiteScreenUrl, buildSiteRouteUrl } from '../../packages/core/src/links';
import { classifyApplicability } from '../../packages/core/src/metadata';
import { extractFieldContext } from '../../packages/core/src/page';

describe('Field Inspector links and wording states', () => {
  it('builds a DAC Browser link under the current application and tenant path', () => {
    expect(buildDacBrowserUrl(
      'https://erp.example.com/Acumatica/t/Turn-Key/screens/FS/FS300100/FS300100',
      'PX.Objects.FS.FSServiceOrder'
    )).toBe('https://erp.example.com/Acumatica/t/Turn-Key/dacBrowser/PX.Objects.FS/FSServiceOrder');
  });

  it('builds a DAC Browser link from a Classic Frames URL', () => {
    expect(buildDacBrowserUrl(
      'https://erp.example.com/erp/Frames/Default.aspx?ScreenId=SO301000',
      'PX.Objects.SO.SOOrder'
    )).toBe('https://erp.example.com/erp/dacBrowser/PX.Objects.SO/SOOrder');
  });

  it('removes the Scripts route used by a Modern screen frame', () => {
    expect(buildDacBrowserUrl(
      'https://erp.example.com/Acumatica/Scripts/Screens/FS/FS300100.html',
      'PX.Objects.FS.FSServiceOrder'
    )).toBe('https://erp.example.com/Acumatica/dacBrowser/PX.Objects.FS/FSServiceOrder');
  });

  it('builds the Generic Inquiry DAC source-data link', () => {
    expect(buildDacSourceUrl(
      'https://erp.example.com/Acumatica/Scripts/Screens/FS/FS300100.html',
      'PX.Objects.FS.FSServiceOrder'
    )).toBe('https://erp.example.com/Acumatica/GenericInquiry/GenericInquiry.aspx?dac=PX.Objects.FS.FSServiceOrder');
  });

  it('rejects unqualified or unsafe DAC values', () => {
    expect(buildDacBrowserUrl('https://erp.example.com/Main', 'FSServiceOrder')).toBeNull();
    expect(buildDacBrowserUrl('https://erp.example.com/Main', 'PX.Objects.FS/../../bad')).toBeNull();
    expect(buildDacSourceUrl('https://erp.example.com/Main', 'PX.Objects.FS/../../bad')).toBeNull();
  });

  it('marks selector metadata as not applicable only for non-selector controls', () => {
    document.body.innerHTML = '<input><button>Save</button>';
    const input = classifyApplicability(extractFieldContext(document.querySelector('input')!, false));
    expect(input.selector.state).toBe('not-applicable');

    const selector = classifyApplicability({
      ...input,
      controlType: { state: 'available', value: 'qp-selector' },
      selector: { state: 'unavailable' }
    });
    expect(selector.selector.state).toBe('unavailable');

    const action = classifyApplicability(extractFieldContext(document.querySelector('button')!, false));
    expect(action.field.state).toBe('not-applicable');
    expect(action.dac.state).toBe('not-applicable');
  });
});

describe('Toolkit site links', () => {
  it.each([
    ['https://erp.example/Main?ScreenId=SO301000&OrderNbr=SO-FICTION-001#record','https://erp.example/'],
    ['https://erp.example/AcumaticaERP/Main?ScreenId=SO301000','https://erp.example/AcumaticaERP/'],
    ['https://erp.example/t/Tenant%20A/Main?ScreenId=SO301000','https://erp.example/t/Tenant%20A/'],
    ['https://erp.example/ERP/Frames/Default.aspx?ScreenId=SO301000','https://erp.example/ERP/'],
    ['https://erp.example/ERP/Scripts/Screens/SO/SO301000.html?key=fictional','https://erp.example/ERP/'],
    ['https://erp.example/ERP/screens/SO/SO301000/SO301000','https://erp.example/ERP/'],
    ['https://erp.example/ERP/SO301000','https://erp.example/ERP/'],
    ['https://erp.example/ERP/Default.aspx','https://erp.example/ERP/'],
    ['https://erp.example/(W(63))/entity/swagger.json','https://erp.example/(W(63))/'],
    ['https://erp.example/ERP/entity/Default/24.200.001/swagger.json','https://erp.example/ERP/'],
    ['https://erp.example/ERP/odata/Tenant%20A/Customers','https://erp.example/ERP/']
  ])('builds routes from %s without record parameters', (page, root) => {
    expect(siteRoot(page)).toBe(root);
    expect(buildSiteScreenUrl(page,'sm208000')).toBe(root+'Main?ScreenId=SM208000');
    expect(buildSiteScreenUrl(page,'fs3001pl')).toBe(root+'Main?ScreenId=FS3001PL');
    expect(buildSiteRouteUrl(page,'entity/swagger.json')).toBe(root+'entity/swagger.json');
    expect(buildSiteRouteUrl(page,'Scripts/Trace/index.html')).toBe(root+'Scripts/Trace/index.html');
  });
  it('rejects invalid screens and routes outside the app', () => {
    for(const id of ['SO30100','SO301000&key=secret','12345678','../../Main']) expect(buildSiteScreenUrl('https://erp.example/Main',id)).toBeNull();
    for(const route of ['../secret','%2e%2e/secret','https://other.example/','/outside','entity/swagger.json?record=secret']) expect(()=>buildSiteRouteUrl('https://erp.example/ERP/Main',route)).toThrow();
    expect(()=>siteRoot('file:///local.html')).toThrow();
  });
});

describe('safe screen links', () => {
  it('constructs a route rather than retaining record parameters, fragments, or tenant', () => {
    const page = { url:'https://customer.example/acumatica/t/SecretTenant/Main?ScreenId=SO301000&OrderNbr=SO123#tab-details', screenId:{ state:'available', value:'SO301000' } } as PageContext;
    const safe = buildSafeScreenLink(page, false);
    expect(safe).toBe('/acumatica/Main?ScreenId=SO301000');
    expect(safe).not.toMatch(/SecretTenant|OrderNbr|SO123|#/);
    expect(buildSafeScreenLink(page, true)).toBe('https://customer.example/acumatica/Main?ScreenId=SO301000');
  });
});
