import { buildDacBrowserUrl, buildSiteRouteUrl, buildSiteScreenUrl } from '../../../../../packages/core/src/links';
import { addCustomLink, isCustomLink, moveLink, removeCustomLink, resetLinkLayout, resolveLinkLayout, setLinkHidden, type LinkEntry } from '../../../../../packages/core/src/link-layout';
import { storageGet, storageSet } from '../../../../../packages/core/src/chrome';
import type { PanelFeature, PanelServices } from '../../services';
import { STORE_LINKS, primaryStore } from '../../tool-links';
export const SCREEN_LINKS = [
  ['Generic Inquiries','SM208000'],['Customization Projects','SM204505'],['Web Service Endpoints','SM207060'],
  ['Request Profiler','SM205070'],['Data Providers','SM206015'],['Import Scenarios','SM206025'],['Import by Scenario','SM206036'],['Record Audit History','SM205540'],['Audit History by Screen','SM205530'],
  ['Access Rights by Screen','SM201020'],['Access Rights by Role','SM201025'],['Access Rights by User','SM201055'],
  ['Users','SM201010'],['User Roles','SM201005'],['System Monitor','SM201530'],['Automation Schedules','SM205020'],
  ['Automation Schedule Statuses','SM205030'],['Automation Schedule History','SM205035'],
  ['Business Events','SM302050'],['Business Event History','SM502030'],['Site Map','SM200520'],['Apply Updates','SM203510']
] as const;
const ROUTE_LINKS = [['trace','Trace','Scripts/Trace/index.html'],['openapi','OpenAPI document','entity/swagger.json']] as const;
/** Saved layouts refer to built-in links by these IDs; a screen link's ID is its Screen ID. */
export const BUILTIN_LINK_IDS: readonly string[] = [...SCREEN_LINKS.map(([,id])=>id), ...ROUTE_LINKS.map(([id])=>id), 'dac-browser', 'copy-link'];
interface LinkTarget { label: string; detail: string; build(): string | null; copy?: boolean }
export function mountLinksPanel(container: HTMLElement, services: PanelServices): PanelFeature {
  const status = container.querySelector<HTMLElement>('[role=status]')!;
  const list = container.querySelector<HTMLElement>('#screen-links')!;
  const editToggle = container.querySelector<HTMLButtonElement>('#edit-links')!;
  const editor = container.querySelector<HTMLElement>('#links-editor')!;
  const rows = container.querySelector<HTMLElement>('#link-rows')!;
  const form = container.querySelector<HTMLFormElement>('#custom-link-form')!;
  let layout = resolveLinkLayout([], BUILTIN_LINK_IDS), editing = false, edited = false;
  const page=()=>services.page;
  // A page address that cannot produce a link leaves its button disabled rather than throwing during render.
  function safe(build: () => string | null): () => string | null {
    return () => { try { return build(); } catch { return null; } };
  }
  const screen=(id: string)=>()=>page()?buildSiteScreenUrl(page()!.url,id):null;
  function target(entry: LinkEntry): LinkTarget {
    if(isCustomLink(entry)) return {label:entry.label!,detail:`${entry.screenId} · Your link`,build:screen(entry.screenId!)};
    const screenLink=SCREEN_LINKS.find(([,id])=>id===entry.id);
    if(screenLink) return {label:screenLink[0],detail:screenLink[1],build:screen(screenLink[1])};
    const route=ROUTE_LINKS.find(([id])=>id===entry.id);
    if(route) return {label:route[1],detail:route[2],build:()=>page()?buildSiteRouteUrl(page()!.url,route[2]):null};
    if(entry.id==='dac-browser') return {label:'DAC Browser for last inspected DAC',detail:'Needs an inspected field with a verified DAC',build:()=>services.field?.dac.state==='available'&&services.field.dac.value?buildDacBrowserUrl(services.field.page.url,services.field.dac.value):null};
    return {label:'Copy link to this screen',detail:'Copies the current Screen ID link',copy:true,build:()=>page()?.screenId.state==='available'&&page()?.screenId.value?buildSiteScreenUrl(page()!.url,page()!.screenId.value!):null};
  }
  // getRandomValues, unlike randomUUID, also works outside a secure context such as the test shell.
  const linkId=()=>Array.from(crypto.getRandomValues(new Uint8Array(8)),byte=>byte.toString(16).padStart(2,'0')).join('');
  function showStatus(text: string, error=false) { status.textContent=text; status.className=error?'error':''; }
  function button(link: LinkTarget) {
    const url = safe(link.build);
    const element = document.createElement('button'); element.textContent=link.label;
    element.disabled=!url();
    element.addEventListener('click',()=>void (async()=>{
      const href=url(); if(!href) return;
      try { if(link.copy) { await navigator.clipboard.writeText(href); showStatus('Screen link copied.'); } else await chrome.tabs.create({url:href}); }
      catch(error) { showStatus(String(error),true); }
    })());
    list.append(element);
  }
  function renderRows() {
    rows.replaceChildren();
    layout.forEach((entry,index)=>{
      const link=target(entry), row=document.createElement('div'); row.dataset.id=entry.id;
      row.className=entry.hidden?'link-row hidden-link':'link-row';
      const text=document.createElement('span'); text.className='link-text'; text.textContent=link.label;
      const detail=document.createElement('small'); detail.textContent=entry.hidden?`${link.detail} · Hidden`:link.detail; text.append(detail);
      const actions=document.createElement('span'); actions.className='link-actions';
      for(const [action,symbol,offset] of [['up','↑',-1],['down','↓',1]] as const) {
        const move=document.createElement('button'); move.type='button'; move.textContent=symbol; move.dataset.action=action;
        move.setAttribute('aria-label',`Move ${link.label} ${action}`); move.title=`Move ${action}`;
        move.disabled=offset<0?index===0:index===layout.length-1;
        move.addEventListener('click',()=>void save(moveLink(layout,entry.id,offset),{id:entry.id,action}));
        actions.append(move);
      }
      const change=document.createElement('button'); change.type='button';
      if(isCustomLink(entry)) {
        change.textContent='Remove'; change.dataset.action='remove'; change.setAttribute('aria-label',`Remove ${link.label}`);
        change.addEventListener('click',()=>{ if(confirm(`Remove link “${link.label}”?`)) void save(removeCustomLink(layout,entry.id)); });
      } else {
        change.textContent=entry.hidden?'Show':'Hide'; change.dataset.action='visibility'; change.setAttribute('aria-label',`${change.textContent} ${link.label}`);
        change.addEventListener('click',()=>void save(setLinkHidden(layout,entry.id,!entry.hidden),{id:entry.id,action:'visibility'}));
      }
      actions.append(change); row.append(text,actions); rows.append(row);
    });
  }
  function render() {
    list.replaceChildren(); list.hidden=editing; editor.hidden=!editing;
    editToggle.textContent=editing?'Done':'Edit'; editToggle.setAttribute('aria-pressed',String(editing));
    const visible=layout.filter(entry=>!entry.hidden);
    showStatus(editing?'':!visible.length?'All links are hidden. Select Edit to show them.':services.page?'':'Open an Acumatica page first.');
    if(editing) renderRows(); else for(const entry of visible) button(target(entry));
  }
  async function save(next: LinkEntry[], focus?: { id: string; action: string }) {
    layout=next; edited=true; render();
    // Keep focus on the moved link; at the top or bottom its arrow disables, so focus its next usable control.
    const moved=[...rows.children].find(row=>(row as HTMLElement).dataset.id===focus?.id);
    (moved?.querySelector<HTMLButtonElement>(`[data-action="${focus?.action}"]:not(:disabled)`) ?? moved?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    try { await storageSet('linkLayout',layout); } catch(error) { showStatus(`Links were not saved: ${String(error)}`,true); }
  }
  editToggle.addEventListener('click',()=>{ editing=!editing; render(); });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(form);
    try {
      const next=addCustomLink(layout,String(data.get('label')??''),String(data.get('screenId')??''),linkId());
      void save(next).then(()=>{ if(!status.textContent) showStatus(`Added “${next.at(-1)!.label}”.`); });
      form.reset();
    } catch(error) { showStatus(error instanceof Error?error.message:String(error),true); }
  });
  container.querySelector<HTMLButtonElement>('#reset-links')!.addEventListener('click',()=>{
    void save(resetLinkLayout(layout,BUILTIN_LINK_IDS)).then(()=>{ if(!status.textContent) showStatus('Default order restored. Your own links are kept at the end.'); });
  });
  container.querySelector<HTMLAnchorElement>('#audit-tool')!.href=STORE_LINKS.audit[primaryStore(chrome.runtime?.getManifest?.() ?? {})];
  // Another panel window may change the layout; skip echoes of this panel's own save so focus stays put.
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local'||!changes.linkLayout) return;
    const next=resolveLinkLayout(changes.linkLayout.newValue,BUILTIN_LINK_IDS);
    if(JSON.stringify(next)!==JSON.stringify(layout)) { layout=next; render(); }
  });
  // An edit made before the saved layout arrives already holds the newest layout, so the late read is ignored.
  void storageGet<unknown>('linkLayout',[]).then(saved=>{ if(edited) return; layout=resolveLinkLayout(saved,BUILTIN_LINK_IDS); render(); }).catch(()=>undefined);
  render();
  return {id:'links',title:'Links',mount(){},onPageContext:render,onTabChanged:render};
}
