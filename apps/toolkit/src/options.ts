import { PROMPT_PRESETS } from './prompts';
import { STORE_LINKS, STORE_NAMES, WEBSITE, otherStores, primaryStore, type Tool } from './tool-links';
import { applyTheme, watchTheme } from './theme';
const preset=document.querySelector<HTMLSelectElement>('#preset')!, prompt=document.querySelector<HTMLTextAreaElement>('#prompt')!;
const experimental=document.querySelector<HTMLInputElement>('#experimental')!;
const status=document.querySelector<HTMLElement>('#status')!, dirty=document.querySelector<HTMLElement>('#dirty')!, preview=document.querySelector<HTMLElement>('#prompt-preview')!;
const PLACEHOLDERS=['screenId','screenName','ui','environment','url'];
const SAMPLE:Record<string,string>={screenId:'SO301000',screenName:'Sales Orders',ui:'Modern',environment:'Northwind Fire',url:'https://erp.example/acumatica/Main?ScreenId=SO301000'};
let saved={prompt:'',experimental:false};
for(const entry of [...PROMPT_PRESETS,{id:'custom',name:'Custom (write your own)',text:''}]) {
  const option=document.createElement('option');option.value=entry.id;option.textContent=entry.name;preset.append(option);
}
const match=()=>{preset.value=PROMPT_PRESETS.find(entry=>entry.text===prompt.value)?.id||'custom';};
const renderPreview=()=>{
  preview.replaceChildren(...prompt.value.split(/(\{[^{}]+\})/).filter(Boolean).map(part=>{
    const key=part.slice(1,-1);
    if(part.startsWith('{')&&PLACEHOLDERS.includes(key)){const mark=document.createElement('mark');mark.textContent=SAMPLE[key];mark.title='{'+key+'}';return mark;}
    return document.createTextNode(part);
  }));
};
const snapshot=()=>({prompt:prompt.value.trim(),experimental:experimental.checked});
const refresh=()=>{const now=snapshot();dirty.hidden=now.prompt===saved.prompt&&now.experimental===saved.experimental;if(!dirty.hidden&&status.textContent==='Settings saved.')status.textContent='';renderPreview();};
preset.addEventListener('change',()=>{const entry=PROMPT_PRESETS.find(entry=>entry.id===preset.value);if(entry)prompt.value=entry.text;refresh();});
prompt.addEventListener('input',()=>{match();refresh();});
experimental.addEventListener('change',refresh);
document.querySelectorAll<HTMLButtonElement>('[data-placeholder]').forEach(button=>button.addEventListener('click',()=>{
  const token='{'+button.dataset.placeholder+'}';prompt.focus();prompt.setRangeText(token,prompt.selectionStart,prompt.selectionEnd,'end');prompt.dispatchEvent(new Event('input'));
}));
document.querySelector('#reset')!.addEventListener('click',()=>{prompt.value=PROMPT_PRESETS[0].text;match();refresh();status.textContent='Default prompt restored. Select Save settings to apply.';});
document.querySelector('form')!.addEventListener('submit',event=>{
  event.preventDefault();const text=prompt.value.trim();
  if(!text){status.textContent='Enter a prompt before saving.';return;}
  void chrome.storage.local.set({aiPrompt:text,experimentalClassicResolver:experimental.checked})
    .then(()=>{saved=snapshot();status.textContent='Settings saved.';refresh();}).catch(error=>{status.textContent=String(error);});
});
void chrome.storage.local.get(['aiPrompt','experimentalClassicResolver']).then(settings=>{
  prompt.value=typeof settings.aiPrompt==='string'?settings.aiPrompt:PROMPT_PRESETS[0].text;match();
  experimental.checked=settings.experimentalClassicResolver===true;
  saved=snapshot();refresh();
}).catch(error=>{status.textContent=String(error);});
const themeInputs=document.querySelectorAll<HTMLInputElement>('input[name=theme]');
watchTheme(theme=>themeInputs.forEach(input=>{input.checked=input.value===theme;}));
themeInputs.forEach(input=>input.addEventListener('change',()=>{applyTheme(input.value);void chrome.storage.local.set({theme:input.value});}));
const links=[...document.querySelectorAll<HTMLAnchorElement>('.index a')];
const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries) if(entry.isIntersecting) links.forEach(link=>link.setAttribute('aria-current',String(link.hash==='#'+entry.target.id)));
},{rootMargin:'0px 0px -70% 0px'}):null;
document.querySelectorAll('.ledger').forEach(section=>observer?.observe(section));
document.querySelector('#version')!.textContent=chrome.runtime.getManifest().version;
// Each tool card opens this browser's store; the line below it lists the other stores.
const store=primaryStore(chrome.runtime.getManifest());
for(const tool of ['trace','audit'] as Tool[]){
  const card=document.querySelector<HTMLAnchorElement>('#'+tool+'-tool')!;card.href=STORE_LINKS[tool][store];card.querySelector('.store')!.textContent=STORE_NAMES[store];
  const also=document.querySelector<HTMLElement>('.also[data-tool="'+tool+'"]')!;also.replaceChildren('Also on ');
  otherStores(store).forEach((other,index)=>{const link=document.createElement('a');link.href=STORE_LINKS[tool][other];link.target='_blank';link.rel='noopener noreferrer';link.textContent=STORE_NAMES[other];also.append(...(index?[' and ',link]:[link]));});
}
document.querySelector<HTMLAnchorElement>('#website')!.href=WEBSITE;
