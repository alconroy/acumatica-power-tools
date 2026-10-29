import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';

test('toolkit starts with one worker and its features render on fictional fixtures', async () => {
  const extensions = [path.resolve('dist/chrome')];
  const profile = mkdtempSync(path.join(os.tmpdir(), 'acumatica-extension-test-'));
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const executablePath = process.env.CHROME_PATH || (existsSync(edge) ? edge : undefined);
  const context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : {}),
    // Chrome extensions require a headed persistent context. This still runs
    // unattended; the temporary profile is deleted after the assertion.
    headless: false,
    args: [
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${extensions.join(',')}`,
      `--load-extension=${extensions.join(',')}`
    ]
  });
  try {
    await expect.poll(() => context.serviceWorkers().filter(worker => worker.url().startsWith('chrome-extension://')).length, { timeout: 15_000 }).toBe(1);
    const workers = context.serviceWorkers().filter(worker => worker.url().startsWith('chrome-extension://'));
    const manifests = await Promise.all(workers.map(worker => worker.evaluate(async () => (await fetch(chrome.runtime.getURL('manifest.json'))).json())));
    expect(manifests.map(manifest => manifest.name)).toEqual(['Acumatica Power Tools']);
    expect(manifests.every(manifest => manifest.manifest_version === 3)).toBe(true);
    for (const manifest of manifests) {
      expect(manifest.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
    }
    for (let index = 0; index < workers.length; index++) {
      const id = new URL(workers[index].url()).hostname;
      const page = await context.newPage();
      const errors: Error[] = [];
      page.on('pageerror', error => errors.push(error));
      await page.goto(`chrome-extension://${id}/panel.html`);
      await expect(page.locator('h1')).toBeVisible();
      expect(errors).toEqual([]);
      if (manifests[index].name === 'Acumatica Power Tools') {
        await page.goto(`chrome-extension://${id}/options.html`);
        await expect(page.locator('h1')).toBeVisible();
        expect(errors).toEqual([]);
      }
      await page.close();
    }
    // Execute the actual dist/chrome bridge/content payload on a fictional
    // fixture. The runtime transport is mocked; this is local behaviour only.
    const fixture = await context.newPage();
    await fixture.route('https://erp.example/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Acumatica fixture</title><div aurelia-app="main"><qp-field><input id="fixture-field" value="fictional value"></qp-field></div>' }));
    await fixture.goto('https://erp.example/Main?ScreenId=SO301000');
    await fixture.evaluate(() => {
      const state = globalThis as any;
      state.fixtureMessages = []; state.fixtureListeners = [];
      Object.assign(state.chrome, { runtime: {
        sendMessage: async (message: unknown) => { state.fixtureMessages.push(message); },
        onMessage: { addListener: (listener: unknown) => state.fixtureListeners.push(listener), removeListener: (listener: unknown) => { state.fixtureListeners = state.fixtureListeners.filter((item: unknown) => item !== listener); } }
      }, storage: { local: { get: async () => ({ environmentProfiles: [] }) }, onChanged: { addListener() {}, removeListener() {} } } });
      (document.querySelector('qp-field') as any).au = { controller: { viewModel: {
        label: 'Description', effectiveControlType: 'qp-text',
        screenService: { siteMapScreenID: 'SO301000', model: { title: 'Sales Orders' } },
        controlState: { name: 'OrderDesc', viewModelName: 'Document', dacName: 'PX.Objects.SO.SOOrder', typeName: 'System.String' }
      } } };
    });
    await fixture.addScriptTag({ path: path.resolve('dist/chrome/bridge.js') });
    await fixture.addScriptTag({ path: path.resolve('dist/chrome/content.js') });
    await fixture.evaluate(() => (globalThis as any).fixtureListeners[0]({ type: 'TOOLKIT_START_INSPECTION', includeValue: false }));
    await fixture.locator('#fixture-field').hover();
    await fixture.locator('#fixture-field').click();
    await expect.poll(() => fixture.evaluate(() => (globalThis as any).fixtureMessages.find((message: any) => message.type === 'TOOLKIT_FIELD_RESULT')?.result.field.value)).toBe('OrderDesc');
    const result = await fixture.evaluate(() => (globalThis as any).fixtureMessages.find((message: any) => message.type === 'TOOLKIT_FIELD_RESULT').result);
    expect(result.dac.value).toBe('PX.Objects.SO.SOOrder');
    expect(result.currentValue.source).toBe('user-disabled');
    expect(result.currentValue.value).toBeUndefined();
    await fixture.addScriptTag({ path: path.resolve('dist/chrome/content.js') });
    expect(await fixture.evaluate(() => (globalThis as any).fixtureListeners.length)).toBe(1);
    await fixture.close();
    const shell=await context.newPage();
    await shell.setViewportSize({width:360,height:850});
    const shellErrors:Error[]=[];shell.on('pageerror',error=>shellErrors.push(error));
    await shell.setContent(readFileSync('apps/toolkit/public/panel.html','utf8').replace('<script src="panel.js"></script>',''));
    await shell.addStyleTag({path:path.resolve('dist/chrome/panel.css')});
    await shell.evaluate(()=>{
      const state=globalThis as any;state.panelMessages=[];state.openedUrls=[];
      state.savedSettings={environmentProfiles:[{id:'fixture',name:'Fixture TEST',baseUrl:'https://erp.example/ERP',tenant:'Tenant A',kind:'TEST',color:'#0a6'},{id:'northwind',name:'Northwind Fire',baseUrl:'https://northwind.example',tenant:'Live',kind:'PROD',color:'#a00'},{id:'acme',name:'Acme Pumps',baseUrl:'https://acme.example',kind:'DEV',color:'#36c'}]};
      const event={addListener(){},removeListener(){}};
      state.chrome={runtime:{openOptionsPage:async()=>{},sendMessage:async()=>({ok:true}),onMessage:{addListener:(listener:any)=>state.panelMessages.push(listener)}},
        tabs:{query:async()=>[{id:7,url:'https://erp.example/ERP/t/Tenant%20A/Main?ScreenId=SO301000&OrderNbr=SO-FICTION-001'}],onActivated:event,onUpdated:event,create:async({url}:any)=>{state.openedUrls.push(url);},update:async()=>{},sendMessage:async()=>{}},
        scripting:{executeScript:async()=>[]},permissions:{onAdded:event,request:async()=>true},
        storage:{local:{get:async()=>state.savedSettings,set:async(value:any)=>Object.assign(state.savedSettings,value)},onChanged:event}};
    });
    await shell.addScriptTag({path:path.resolve('dist/chrome/panel.js')});
    await shell.getByRole('button',{name:'Links',exact:true}).click();
    await expect(shell.locator('[data-feature=links] [role=status]')).toHaveText('Open an Acumatica page first.');
    // The status sits below the list so a message never shifts the links.
    expect(await shell.evaluate(()=>{const list=document.querySelector('#screen-links')!,status=document.querySelector('[data-feature=links] [role=status]')!;return Boolean(list.compareDocumentPosition(status)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
    await expect(shell.getByRole('button',{name:'Generic Inquiries',exact:true})).toBeDisabled();
    // A new site sends no page context before access is granted; Capture falls back to the tab address.
    await shell.getByRole('button',{name:'Environment',exact:true}).click();
    await shell.getByRole('button',{name:'Capture this environment'}).click();
    const newSite=shell.locator('[data-feature=environment]');
    await expect(newSite.locator('[name=baseUrl]')).toHaveValue('https://erp.example/ERP/');
    await expect(newSite.locator('[name=tenant]')).toHaveValue('Tenant A');
    await expect(newSite.locator('[name=name]')).toHaveValue('');
    await expect(newSite.locator('[name=kind]')).toHaveValue('');
    await shell.getByRole('button',{name:'Links',exact:true}).click();
    await shell.evaluate(()=>{
      const state=globalThis as any;
      const available=(value:string)=>({state:'available',value,source:'fixture'});
      const page={url:'https://erp.example/ERP/Main?CompanyID=Tenant%20A&ScreenId=SO301000&OrderNbr=SO-FICTION-001',frame:'top',ui:'modern',screenId:available('SO301000'),screenName:available('Sales Orders'),tenant:available('Tenant A'),company:available('Fixture Company'),branch:{state:'unavailable'}};
      const nested={...page,url:'https://erp.example/ERP/Frames/Blank.aspx',frame:'same-origin-frame',screenId:{state:'unavailable'}};
      state.panelMessages[0]({type:'TOOLKIT_PAGE_READY',page},{tab:{id:7},frameId:0});
      state.panelMessages[0]({type:'TOOLKIT_PAGE_READY',page:nested},{tab:{id:7},frameId:4});
    });
    // A nested frame reporting after the top frame must not erase the Screen ID or the CompanyID tenant.
    await expect(shell.locator('#page-context')).toHaveText('SO301000 · modern UI');
    await expect(shell.locator('#environment-badge')).toHaveText('TEST · Fixture TEST');
    await expect(shell.locator('[data-feature=environment] #screen')).toHaveText('Current screen: SO301000');
    await expect(shell.getByRole('button',{name:'Generic Inquiries',exact:true})).toBeEnabled();
    await shell.getByRole('button',{name:'Trace',exact:true}).click();
    expect(await shell.evaluate(()=>(globalThis as any).openedUrls)).toEqual(['https://erp.example/ERP/Scripts/Trace/index.html']);
    await expect(shell.getByRole('button',{name:'Screens',exact:true})).toHaveCount(0);
    // Edit mode hides, reorders and adds links, and the layout is saved locally.
    const links=shell.locator('[data-feature=links]');
    await links.getByRole('button',{name:'Edit',exact:true}).click();
    await links.getByRole('button',{name:'Hide Generic Inquiries',exact:true}).click();
    await links.getByRole('button',{name:'Move Customization Projects up',exact:true}).click();
    await links.getByLabel('Label').fill('Service Orders');await links.getByLabel('Screen ID').fill('fs3001pl');
    await links.getByRole('button',{name:'Add link',exact:true}).click();
    await expect(links.locator('[role=status]')).toHaveText('Added “Service Orders”.');
    await links.getByRole('button',{name:'Done',exact:true}).click();
    await expect(links.locator('#screen-links button').first()).toHaveText('Customization Projects');
    await expect(links.getByRole('button',{name:'Generic Inquiries',exact:true})).toHaveCount(0);
    await links.getByRole('button',{name:'Service Orders',exact:true}).click();
    expect(await shell.evaluate(()=>(globalThis as any).openedUrls.at(-1))).toBe('https://erp.example/ERP/Main?ScreenId=FS3001PL');
    expect(await shell.evaluate(()=>(globalThis as any).savedSettings.linkLayout.slice(0,2))).toEqual([{id:'SM204505'},{id:'SM208000',hidden:true}]);
    await shell.getByRole('button',{name:'Environment',exact:true}).click();
    const environments=shell.locator('[data-feature=environment]');
    await expect(environments.locator('.environment-row')).toHaveCount(3);
    await expect(environments.locator('.environment-row.current')).toContainText('TEST · Fixture TEST');
    await environments.getByLabel('Find environment').fill('prod live');
    await expect(environments.locator('.environment-row')).toHaveCount(1);
    await expect(environments.locator('.environment-row')).toContainText('PROD · Northwind Fire');
    await expect(environments.locator('#environment-count')).toHaveText('1 of 3 environments');
    await environments.getByLabel('Find environment').fill('');
    await environments.getByRole('button',{name:'Capture this environment'}).click();
    await expect(environments.locator('[name=name]')).toHaveValue('');
    await expect(environments.locator('[name=baseUrl]')).toHaveValue('https://erp.example/ERP/');
    await expect(environments.locator('[name=tenant]')).toHaveValue('Tenant A');
    await expect(environments.locator('[name=kind]')).toHaveValue('');
    await expect(environments.locator('#status')).toContainText('already saved as TEST · Fixture TEST');
    // Pinned environments sit above the rest in their own order; the rest stay sorted by name.
    const rowNames=()=>environments.locator('.environment-text').evaluateAll(nodes=>nodes.map(node=>node.firstChild!.textContent));
    await expect.poll(rowNames).toEqual(['DEV · Acme Pumps','TEST · Fixture TEST','PROD · Northwind Fire']);
    await environments.getByRole('button',{name:'Pin PROD · Northwind Fire to the top'}).click();
    await environments.getByRole('button',{name:'Pin DEV · Acme Pumps to the top'}).click();
    await expect.poll(rowNames).toEqual(['PROD · Northwind Fire','DEV · Acme Pumps','TEST · Fixture TEST']);
    await expect(environments.getByRole('button',{name:'Pin DEV · Acme Pumps to the top'})).toHaveAttribute('aria-pressed','true');
    await expect(environments.getByRole('button',{name:'Move PROD · Northwind Fire up'})).toBeDisabled();
    await expect(environments.getByRole('button',{name:'Move TEST · Fixture TEST up'})).toHaveCount(0);
    await environments.getByRole('button',{name:'Move DEV · Acme Pumps up'}).click();
    await expect.poll(rowNames).toEqual(['DEV · Acme Pumps','PROD · Northwind Fire','TEST · Fixture TEST']);
    await expect(environments.getByRole('button',{name:'Move PROD · Northwind Fire down'})).toBeDisabled();
    expect(await shell.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    // Editing keeps the profile's identity and replaces it in place.
    await environments.locator('.environment-row',{hasText:'Acme Pumps'}).getByRole('button',{name:'Edit'}).click();
    await expect(environments.locator('#profile-form-title')).toHaveText('Edit DEV · Acme Pumps');
    await expect(environments.locator('[name=baseUrl]')).toHaveValue('https://acme.example');
    await expect(environments.locator('[name=kind]')).toHaveValue('DEV');
    await environments.locator('[name=name]').fill('Acme Pumps UAT');
    await environments.locator('[name=kind]').selectOption('TEST');
    await environments.getByRole('button',{name:'Save changes'}).click();
    await expect(environments.locator('#status')).toHaveText('Updated TEST · Acme Pumps UAT.');
    await expect(environments.locator('.environment-row')).toHaveCount(3);
    expect(await shell.evaluate(()=>(globalThis as any).savedSettings.environmentProfiles.find((p:any)=>p.id==='acme'))).toMatchObject({name:'Acme Pumps UAT',kind:'TEST',baseUrl:'https://acme.example',pinned:0});
    await expect(environments.locator('#profile-form-title')).toHaveText('Add environment');
    await expect(environments.getByRole('button',{name:'Cancel'})).toBeHidden();
    await environments.getByText('Import or export').click();
    await environments.getByLabel('Environment configuration JSON').fill(JSON.stringify({version:1,profiles:[
      {id:'northwind',name:'Northwind Fire Group',baseUrl:'https://northwind.example',tenant:'Live',kind:'PROD',color:'#a00'},
      {id:'globex',name:'Globex',baseUrl:'https://globex.example',kind:'TEST',color:'#0aa'}]}));
    await environments.getByRole('button',{name:'Import'}).click();
    await expect(environments.locator('#status')).toHaveText('Imported 1 new and 1 updated; 2 other environments unchanged.');
    await expect(environments.locator('.environment-row')).toHaveCount(4);
    expect(await shell.evaluate(()=>(globalThis as any).savedSettings.environmentProfiles.map((p:any)=>p.id+':'+p.name))).toEqual(['fixture:Fixture TEST','northwind:Northwind Fire Group','acme:Acme Pumps UAT','globex:Globex']);
    // The import has no pins, so the saved ones stay.
    expect(await shell.evaluate(()=>(globalThis as any).savedSettings.environmentProfiles.map((p:any)=>p.pinned))).toEqual([undefined,1,0,undefined]);
    expect(await shell.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(shellErrors).toEqual([]);
    await shell.screenshot({path:'test-results/toolkit-panel-fixture.png',fullPage:true});
    await shell.close();
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
