import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROMPT_PRESETS } from '../../apps/toolkit/src/prompts';
it('defaults resolver off and saves a custom prompt in local storage', async()=>{
  document.body.innerHTML=readFileSync('apps/toolkit/public/options.html','utf8');const set=vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome',{runtime:{getManifest:()=>({version:'1.0.0'})},storage:{local:{get:async()=>({}),set}}});
  vi.resetModules();await import('../../apps/toolkit/src/options');
  const prompt=document.querySelector<HTMLTextAreaElement>('#prompt')!,experimental=document.querySelector<HTMLInputElement>('#experimental')!;
  await vi.waitFor(()=>expect(prompt.value).toBe(PROMPT_PRESETS[0].text));
  expect(experimental.checked).toBe(false);expect(document.querySelector('#new-tab')).toBeNull();
  prompt.value='Custom {screenId} {unknown}';prompt.dispatchEvent(new Event('input'));expect(document.querySelector<HTMLSelectElement>('#preset')!.value).toBe('custom');
  experimental.checked=true;document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));
  await vi.waitFor(()=>expect(set).toHaveBeenCalledWith({aiPrompt:'Custom {screenId} {unknown}',experimentalClassicResolver:true}));
  expect(document.querySelector('#version')!.textContent).toBe('1.0.0');vi.unstubAllGlobals();
});

it.each([
  [{version:'1.0.0'},'https://chromewebstore.google.com/','Chrome Web Store','Also on Edge Add-ons and Firefox Add-ons'],
  [{version:'1.0.0',browser_specific_settings:{gecko:{id:'toolkit@example'}}},'https://addons.mozilla.org/','Firefox Add-ons','Also on Chrome Web Store and Edge Add-ons']
])('links other tools to this build\'s store first (%#)', async(manifest,prefix,store,also)=>{
  document.body.innerHTML=readFileSync('apps/toolkit/public/options.html','utf8');
  vi.stubGlobal('chrome',{runtime:{getManifest:()=>manifest},storage:{local:{get:async()=>({}),set:vi.fn()}}});
  vi.resetModules();await import('../../apps/toolkit/src/options');
  for(const id of ['trace-tool','audit-tool']){
    const card=document.querySelector<HTMLAnchorElement>('#'+id)!;
    expect(card.href.startsWith(prefix)).toBe(true);expect(card.querySelector('.store')!.textContent).toBe(store);
    expect(card.parentElement!.querySelector('.also')!.textContent).toBe(also);
  }
  expect([...document.querySelectorAll<HTMLAnchorElement>('.also a')].map(a=>new URL(a.href).host)).not.toContain(new URL(prefix).host);
  vi.unstubAllGlobals();
});
