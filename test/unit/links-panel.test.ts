import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUILTIN_LINK_IDS, SCREEN_LINKS, mountLinksPanel } from '../../apps/toolkit/src/features/links/panel';
import { extractPageContext } from '../../packages/core/src/page';
import type { PanelServices } from '../../apps/toolkit/src/services';
// The panel reads and saves its layout in local storage; `stored` stands in for it.
function stubChrome(create=vi.fn().mockResolvedValue({}),stored:Record<string,unknown>={}) {
  const set=vi.fn(async(value:Record<string,unknown>)=>{Object.assign(stored,value);});
  vi.stubGlobal('chrome',{tabs:{create},storage:{local:{get:async(key:string)=>({[key]:stored[key]}),set},onChanged:{addListener(){}}}});
  return {create,set,stored};
}
it('disables links without context and opens safe tenant routes and only verified DACs', async () => {
  document.body.innerHTML=readFileSync('apps/toolkit/public/panel.html','utf8');
  const {create}=stubChrome();
  const services={page:null,field:null} as PanelServices;
  const container=document.querySelector<HTMLElement>('[data-feature=links]')!,feature=mountLinksPanel(container,services);
  expect([...container.querySelectorAll<HTMLButtonElement>('#screen-links button')].every(b=>b.disabled)).toBe(true);
  expect(container.textContent).toContain('Open an Acumatica page first.');
  services.page=extractPageContext(document);services.page.url='https://erp.example/ERP/t/Tenant%20A/Main?ScreenId=SO301000&key=fictional';
  services.page.screenId={state:'available',value:'SO301000'};feature.onPageContext(services.page);
  const buttons=[...container.querySelectorAll<HTMLButtonElement>('#screen-links button')];buttons.find(b=>b.textContent==='Trace')!.click();await Promise.resolve();
  expect(create).toHaveBeenCalledWith({url:'https://erp.example/ERP/t/Tenant%20A/Scripts/Trace/index.html'});
  expect(buttons.find(b=>b.textContent?.startsWith('DAC Browser'))!.disabled).toBe(true);vi.unstubAllGlobals();
});
it('leaves links disabled instead of throwing when the page has no site address', () => {
  document.body.innerHTML=readFileSync('apps/toolkit/public/panel.html','utf8');
  stubChrome(vi.fn());
  const page=extractPageContext(document);page.url='about:blank';page.screenId={state:'available',value:'SO301000'};
  const services={page,field:null} as PanelServices;
  const container=document.querySelector<HTMLElement>('[data-feature=links]')!;
  expect(()=>mountLinksPanel(container,services)).not.toThrow();
  expect([...container.querySelectorAll<HTMLButtonElement>('#screen-links button')].every(b=>b.disabled)).toBe(true);vi.unstubAllGlobals();
});
it('opens the administration screens added in 1.0.19 and 1.0.20 at their documented Screen IDs', async () => {
  document.body.innerHTML=readFileSync('apps/toolkit/public/panel.html','utf8');
  const {create}=stubChrome();
  const page=extractPageContext(document);page.url='https://erp.example/ERP/Main?CompanyID=Live&ScreenId=SO301000&OrderNbr=fictional';
  const container=document.querySelector<HTMLElement>('[data-feature=links]')!;mountLinksPanel(container,{page,field:null} as PanelServices);
  const expected={'Users':'SM201010','User Roles':'SM201005','System Monitor':'SM201530','Automation Schedules':'SM205020','Automation Schedule Statuses':'SM205030','Automation Schedule History':'SM205035','Business Events':'SM302050','Business Event History':'SM502030','Site Map':'SM200520','Apply Updates':'SM203510'};
  for(const [label,id] of Object.entries(expected)){
    [...container.querySelectorAll<HTMLButtonElement>('#screen-links button')].find(b=>b.textContent===label)!.click();await Promise.resolve();
    expect(create).toHaveBeenLastCalledWith({url:`https://erp.example/ERP/Main?ScreenId=${id}`});
  }
  const ids=SCREEN_LINKS.map(([,id])=>id);expect(new Set(ids).size).toBe(ids.length);vi.unstubAllGlobals();
});
const labels=(container:HTMLElement)=>[...container.querySelectorAll('#screen-links button')].map(b=>b.textContent);
const row=(container:HTMLElement,id:string)=>container.querySelector<HTMLElement>(`#link-rows [data-id="${id}"]`)!;
function mountWithPage(stored:Record<string,unknown>={}) {
  document.body.innerHTML=readFileSync('apps/toolkit/public/panel.html','utf8');
  const chrome=stubChrome(undefined,stored);
  const page=extractPageContext(document);page.url='https://erp.example/ERP/Main?CompanyID=Live&ScreenId=SO301000&OrderNbr=fictional';
  const container=document.querySelector<HTMLElement>('[data-feature=links]')!;mountLinksPanel(container,{page,field:null} as PanelServices);
  return {container,...chrome};
}
it('applies a saved order, hides hidden links and opens the user’s own screen links from the site root', async () => {
  const {container,create}=mountWithPage({linkLayout:[{id:'custom:a',label:'Service Orders',screenId:'FS3001PL'},{id:'trace'},{id:'SM208000',hidden:true}]});
  await vi.waitFor(()=>expect(labels(container)[0]).toBe('Service Orders'));
  expect(labels(container).slice(0,3)).toEqual(['Service Orders','Trace','Customization Projects']);
  expect(labels(container)).not.toContain('Generic Inquiries');
  // Built-in links missing from the saved layout still appear, in their default order.
  expect(labels(container).at(-1)).toBe('Copy link to this screen');
  [...container.querySelectorAll<HTMLButtonElement>('#screen-links button')][0].click();await Promise.resolve();
  expect(create).toHaveBeenCalledWith({url:'https://erp.example/ERP/Main?ScreenId=FS3001PL'});
});
it('edits the layout: move, hide, show, add, remove and reset are saved locally', async () => {
  vi.stubGlobal('confirm',vi.fn(()=>true));
  const {container,stored}=mountWithPage();
  const edit=container.querySelector<HTMLButtonElement>('#edit-links')!;edit.click();
  expect(edit.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector<HTMLElement>('#screen-links')!.hidden).toBe(true);
  expect(container.querySelector<HTMLElement>('#links-editor')!.hidden).toBe(false);
  expect(row(container,'SM208000').querySelector<HTMLButtonElement>('[data-action=up]')!.disabled).toBe(true);
  row(container,'SM204505').querySelector<HTMLButtonElement>('[data-action=up]')!.click();
  await vi.waitFor(()=>expect((stored.linkLayout as {id:string}[]).slice(0,2).map(e=>e.id)).toEqual(['SM204505','SM208000']));
  // Focus follows the moved link so keyboard users can keep moving it.
  expect(document.activeElement).toBe(row(container,'SM204505').querySelector('[data-action=down]'));
  row(container,'trace').querySelector<HTMLButtonElement>('[data-action=visibility]')!.click();
  expect(row(container,'trace').className).toContain('hidden-link');
  expect(row(container,'trace').querySelector('[data-action=visibility]')!.textContent).toBe('Show');
  const form=container.querySelector<HTMLFormElement>('#custom-link-form')!;
  (form.elements.namedItem('label') as HTMLInputElement).value='Service Orders';(form.elements.namedItem('screenId') as HTMLInputElement).value='Messages';
  form.dispatchEvent(new Event('submit',{cancelable:true}));
  expect(container.querySelector('[data-feature=links] [role=status]')!.textContent).toContain('Enter a Screen ID');
  (form.elements.namedItem('screenId') as HTMLInputElement).value='fs3001pl';
  form.dispatchEvent(new Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect(container.querySelector('[data-feature=links] [role=status]')!.textContent).toBe('Added “Service Orders”.'));
  const custom=(stored.linkLayout as {id:string,screenId?:string}[]).at(-1)!;
  expect(custom).toMatchObject({label:'Service Orders',screenId:'FS3001PL'});
  expect(row(container,custom.id).querySelector('[data-action=visibility]')).toBeNull();
  edit.click();
  expect(labels(container)).not.toContain('Trace');expect(labels(container).at(-1)).toBe('Service Orders');
  edit.click();
  container.querySelector<HTMLButtonElement>('#reset-links')!.click();
  await vi.waitFor(()=>expect((stored.linkLayout as {id:string}[]).slice(0,2).map(e=>e.id)).toEqual(['SM208000','SM204505']));
  expect((stored.linkLayout as {id:string,hidden?:boolean}[]).find(e=>e.id==='trace')).toEqual({id:'trace'});
  row(container,custom.id).querySelector<HTMLButtonElement>('[data-action=remove]')!.click();
  await vi.waitFor(()=>expect((stored.linkLayout as {id:string}[]).some(e=>e.id===custom.id)).toBe(false));
  vi.unstubAllGlobals();
});
it('explains how to bring links back when every link is hidden', async () => {
  const {container}=mountWithPage({linkLayout:BUILTIN_LINK_IDS.map(id=>({id,hidden:true}))});
  await vi.waitFor(()=>expect(container.querySelector('[data-feature=links] [role=status]')!.textContent).toBe('All links are hidden. Select Edit to show them.'));
  expect(labels(container)).toEqual([]);vi.unstubAllGlobals();
});
