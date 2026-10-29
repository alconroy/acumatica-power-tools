// Generates the store-listing screenshots (1280×800, opaque RGB PNG) into store-assets/screenshots/.
// Run `npm run build` first; this script renders the real dist/chrome panel and options pages with
// stubbed extension APIs beside a generic, fictional ERP page mock. All data shown is fictional.
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist', 'chrome');
const out = path.join(root, 'store-assets', 'screenshots');
for (const file of ['panel.html', 'panel.css', 'panel.js', 'options.html', 'options.js', 'manifest.json']) {
  if (!existsSync(path.join(dist, file))) throw new Error(`dist/chrome/${file} is missing. Run npm run build first.`);
}
mkdirSync(out, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(dist, 'manifest.json'), 'utf8'));

const WIDTH = 1280, HEIGHT = 800, PANEL = 400, PAGE = WIDTH - PANEL;
const PAGE_URL = 'https://northwind.example/ERP/Main?CompanyID=Live&ScreenId=SO301000';

const PROFILES = [
  { id: 'nw-live', name: 'Northwind Live', baseUrl: 'https://northwind.example/ERP', tenant: 'Live', kind: 'PROD', color: '#c0262d', pinned: 0 },
  { id: 'nw-uat', name: 'Northwind UAT', baseUrl: 'https://uat.northwind.example/ERP', tenant: 'UAT', kind: 'TEST', color: '#b26a00' },
  { id: 'contoso-dev', name: 'Contoso Sandbox', baseUrl: 'https://dev.contoso.example/ERP', kind: 'DEV', color: '#1f6fbf' },
  { id: 'training', name: 'Training', baseUrl: 'https://training.northwind.example/ERP', tenant: 'Training', kind: 'SANDBOX', color: '#6b4fbb' }
];

const available = (value, source) => ({ state: 'available', value, source });
const PAGE_CONTEXT = {
  url: PAGE_URL, documentId: 'demo-document-1', ui: 'modern', frame: 'top',
  screenId: available('SO301000', 'url:ScreenId'), screenName: available('Sales Orders', 'dom:.qp-screen-title'),
  tenant: available('Live', 'url:CompanyID'), company: available('Northwind Pumps (demo)', 'dom:company'), branch: { state: 'unavailable' }
};
const FIELD_PAGE = {
  ...PAGE_CONTEXT,
  screenId: available('SO301000', 'framework:screen-service.screenID'),
  screenName: available('Sales Orders', 'framework:screen-model.title')
};
// Shapes follow FieldContext (packages/core/src/types.ts) and the sources the Modern bridge records (apps/toolkit/src/bridge.ts).
const CUSTOMER_FIELD = {
  page: FIELD_PAGE,
  label: available('Customer', 'framework:modern-field.label'),
  controlId: available('edCustomerID', 'framework:modern-field.effectiveId'),
  controlType: available('qp-selector', 'framework:modern-field.effectiveControlType'),
  container: available('qp-fieldset#fsColumnA · Document', 'framework:modern-qp-fieldset'),
  field: available('CustomerID', 'framework:modern-field-state.name'),
  view: available('Document', 'framework:modern-field-state.viewModelName'),
  dac: available('PX.Objects.SO.SOOrder', 'framework:modern-field-state.dacName'),
  graph: available('PX.Objects.SO.SOOrderEntry', 'framework:screen-service.graphInfo'),
  dataType: available('Int32', 'framework:modern-field-state.type'),
  binding: available('DAC-bound', 'framework:modern-field-state.unbound'),
  properties: available('Required · Commits changes · Editable', 'framework:modern-field-state.properties'),
  selector: available('Customer.AcctCD', 'framework:modern-field-state.schemaObject'),
  elementPath: available('qp-fieldset#fsColumnA > qp-field:nth-of-type(1)', 'dom:element-path'),
  currentValue: { state: 'unavailable', source: 'user-disabled' }
};
const QUANTITY_FIELD = {
  page: FIELD_PAGE,
  label: available('Quantity', 'framework:modern-grid-column.caption'),
  controlId: available('grid', 'framework:modern-grid.id'),
  controlType: available('qp-number-editor', 'framework:modern-grid-column.editorType'),
  container: available('qp-grid#grid · Details · Transactions', 'framework:modern-qp-grid'),
  field: available('OrderQty', 'framework:modern-grid-column.field'),
  view: available('Transactions', 'framework:modern-grid.viewName'),
  dac: available('PX.Objects.SO.SOLine', 'framework:modern-grid-column.fieldDacName'),
  graph: available('PX.Objects.SO.SOOrderEntry', 'framework:screen-service.graphInfo'),
  dataType: available('Decimal', 'framework:modern-grid-column.dataType'),
  binding: available('DAC-bound', 'framework:modern-grid-field-state.unbound'),
  properties: available('Commits changes · Editable', 'framework:modern-grid-column.properties'),
  selector: { state: 'not-applicable', source: 'applicability:control-is-not-a-selector' },
  elementPath: available('qp-grid#grid > table > tbody > tr:nth-of-type(2) > td:nth-of-type(6)', 'dom:element-path'),
  currentValue: { state: 'unavailable', source: 'user-disabled' }
};

const LINES = [
  ['NWHQ', 'PMP-IMP-200', 'Impeller, 200 mm', 'MAIN', 'EA', '6.00', '185.00', '1,110.00'],
  ['NWHQ', 'PMP-SEAL-45', 'Seal kit, 45 mm', 'MAIN', 'EA', '4.00', '92.50', '370.00'],
  ['NWHQ', 'PMP-MTR-7K5', 'Motor, 7.5 kW', 'MAIN', 'EA', '1.00', '1,640.00', '1,640.00'],
  ['NWHQ', 'FLT-STR-50', 'Strainer, 50 mm', 'EAST', 'EA', '3.00', '122.17', '366.50'],
  ['NWHQ', 'SVC-COMM-1', 'Commissioning visit', 'MAIN', 'HR', '0.00', '0.00', '0.00']
];

/** A neutral, generic ERP sales-order page. Not modelled on any vendor's product chrome. */
function mockPage({ highlight = false, badge = null } = {}) {
  const field = (label, value, extra = '') => `<label class="f"><span>${label}</span><b class="${extra}">${value}</b></label>`;
  const rows = LINES.map((line, index) => `<tr class="${index === 1 ? 'sel' : ''}">${line.map((cell, column) =>
    `<td class="${column >= 5 ? 'num' : ''}"${index === 1 && column === 5 ? ' id="qty"' : ''}>${cell}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:13px/1.4 "Segoe UI",system-ui,sans-serif;color:#1f2933;background:#eef1f4;overflow:hidden;border-right:1px solid #c5ccd3}
.addr{height:40px;display:flex;align-items:center;gap:10px;padding:0 14px;background:#dfe3e8;border-bottom:1px solid #c5ccd3}
.addr .dots{display:flex;gap:6px}.addr .dots i{width:10px;height:10px;border-radius:50%;background:#b9c1ca;display:block}
.addr .url{flex:1;height:26px;border-radius:13px;background:#fff;display:flex;align-items:center;padding:0 12px;color:#52606d;font-size:12px}
.addr .url b{color:#1f2933;font-weight:600}
.top{height:48px;display:flex;align-items:center;gap:14px;padding:0 18px;background:#fff;border-bottom:1px solid #d9dee4}
.logo{width:28px;height:28px;border-radius:6px;background:#2e7d6b;color:#fff;font-weight:700;font-size:12px;display:grid;place-items:center}
.co{font-weight:600;font-size:14px}.search{margin-left:auto;width:220px;height:28px;border:1px solid #d0d6dc;border-radius:4px;color:#8a96a3;padding:4px 10px;font-size:12px}
.user{width:28px;height:28px;border-radius:50%;background:#cfd8e1;display:grid;place-items:center;font-size:11px;font-weight:600;color:#3e4c59}
.wrap{display:flex;height:calc(100% - 88px)}
.rail{width:132px;background:#f7f8fa;border-right:1px solid #d9dee4;padding:14px 0}
.rail div{padding:8px 18px;color:#52606d}.rail .on{background:#e3efec;color:#1f5a4c;font-weight:600;border-left:3px solid #2e7d6b;padding-left:15px}
main{flex:1;padding:16px 20px;min-width:0}
.crumb{font-size:12px;color:#7b8794}h1{font-size:20px;margin:2px 0 10px;font-weight:600}
.tools{display:flex;gap:6px;margin-bottom:12px}.tools span{padding:5px 10px;border:1px solid #c5ccd3;border-radius:4px;background:#fff;font-size:12px;color:#3e4c59}
.tools .pri{background:#2e7d6b;border-color:#2e7d6b;color:#fff}
.card{background:#fff;border:1px solid #d9dee4;border-radius:6px;padding:12px 14px;margin-bottom:12px}
.form{display:grid;grid-template-columns:1fr 1.15fr .85fr;gap:6px 16px}
.f{display:flex;align-items:center;gap:8px;min-width:0}.f span{width:84px;flex:none;font-size:12px;color:#7b8794}
.f b{flex:1;min-width:0;font-weight:400;border:1px solid #d0d6dc;border-radius:3px;padding:3px 7px;background:#fbfcfd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f b.ro{background:#f1f3f5;border-color:#e1e5e9}.f b.st{background:#e6f4ea;border-color:#bfe0c9;color:#1e6b3a;font-weight:600}
.wide{grid-column:1 / -1}
.tabs{display:flex;gap:18px;border-bottom:1px solid #d9dee4;margin:-2px -14px 10px;padding:0 14px}
.tabs span{padding:8px 0;color:#7b8794}.tabs .on{color:#1f2933;font-weight:600;border-bottom:2px solid #2e7d6b}
.gt{display:flex;gap:6px;margin-bottom:8px}.gt span{padding:3px 8px;border:1px solid #d0d6dc;border-radius:3px;font-size:12px;color:#52606d}
table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
th{text-align:left;font-weight:600;color:#52606d;background:#f4f6f8;padding:6px 7px;border-bottom:1px solid #d9dee4;white-space:nowrap}
td{padding:7px;border-bottom:1px solid #edf0f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.num{text-align:right}tr.sel td{background:#f2f8f6}
.foot{display:flex;justify-content:flex-start;gap:24px;padding-top:10px;font-size:12px;color:#52606d}.foot b{color:#1f2933}
.overlay{position:fixed;pointer-events:none;box-sizing:border-box;border:3px solid #1769aa;border-radius:3px}
</style></head><body>
<div class="addr"><span class="dots"><i></i><i></i><i></i></span><span class="url">🔒&nbsp;<b>northwind.example</b>/ERP/Main?CompanyID=Live&amp;ScreenId=SO301000</span></div>
<div class="top"><span class="logo">NP</span><span class="co">Northwind Pumps (demo)</span><span class="search">Search…</span><span class="user">DU</span></div>
<div class="wrap"><nav class="rail"><div>Favorites</div><div>Dashboards</div><div class="on">Sales</div><div>Inventory</div><div>Purchasing</div><div>Service</div><div>Finance</div><div>Reports</div></nav>
<main><div class="crumb">Sales › Orders</div><h1>Sales Orders</h1>
<div class="tools"><span class="pri">Save</span><span>+ New</span><span>Delete</span><span>Copy</span><span>Actions ▾</span><span>Reports ▾</span></div>
<div class="card form">
${field('Order Type', 'SO')}${field('Customer', 'Contoso Supply')}${field('Ordered Qty.', '14.00', 'ro')}
${field('Order Nbr.', 'SO-DEMO-0042')}${field('Location', 'MAIN')}${field('Order Total', '3,486.50', 'ro')}
${field('Status', 'Open', 'st')}${field('PO Number', 'PO-77310')}${field('Currency', 'USD')}
${field('Date', '10/29/2026')}${field('Requested On', '11/05/2026')}${field('Terms', 'Net 30')}
<div class="wide">${field('Description', 'Replacement impellers and seals for pump station 3')}</div>
</div>
<div class="card"><div class="tabs"><span class="on">Details</span><span>Taxes</span><span>Commissions</span><span>Financial</span><span>Shipping</span><span>Totals</span></div>
<div class="gt"><span>+ Add Row</span><span>Delete</span><span>Add Items</span><span>Allocations</span></div>
<table><colgroup><col style="width:58px"><col style="width:104px"><col><col style="width:72px"><col style="width:46px"><col style="width:72px"><col style="width:80px"><col style="width:84px"></colgroup>
<thead><tr><th>Branch</th><th>Inventory ID</th><th>Description</th><th>Warehouse</th><th>UOM</th><th class="num">Quantity</th><th class="num">Unit Price</th><th class="num">Ext. Amount</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="foot"><span>Lines: <b>5</b></span><span>Ordered Qty.: <b>14.00</b></span><span>Order Total: <b>3,486.50 USD</b></span></div></div>
</main></div>
${highlight ? '<div class="overlay" id="overlay"></div>' : ''}
</body></html>`;
}

/** Same placement and style as apps/toolkit/src/features/environment/badge.ts. */
async function addPageBadge(page, profile) {
  await page.evaluate(({ label, color }) => {
    const badge = document.createElement('button');
    badge.type = 'button'; badge.textContent = label;
    Object.assign(badge.style, { position:'fixed', left:'50%', bottom:'12px', transform:'translateX(-50%)', zIndex:'2147483647', border:'2px solid white', borderRadius:'6px', padding:'6px 10px', color:'white', background:color, font:'700 12px system-ui', maxWidth:'45vw', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', boxShadow:'0 2px 8px #0006', cursor:'pointer' });
    document.documentElement.append(badge);
  }, { label: `${profile.kind} · ${profile.name}`, color: profile.color });
}

/** Installs the extension API stubs the panel and options pages use, before their scripts run. */
function installChrome({ settings, manifest, tabUrl }) {
  const state = globalThis;
  state.__runtimeListeners = [];
  const changeListeners = [];
  const event = { addListener() {}, removeListener() {} };
  const pick = keys => {
    if (keys == null) return { ...settings };
    const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    return Object.fromEntries(list.filter(key => key in settings).map(key => [key, settings[key]]));
  };
  state.chrome = {
    runtime: { getManifest: () => manifest, openOptionsPage: async () => {}, sendMessage: async () => ({ ok: true }), onMessage: { addListener: listener => state.__runtimeListeners.push(listener), removeListener() {} } },
    tabs: { query: async () => [{ id: 7, url: tabUrl }], onActivated: event, onUpdated: event, onRemoved: event, create: async () => {}, update: async () => {}, sendMessage: async () => {} },
    scripting: { executeScript: async () => [] },
    permissions: { onAdded: event, request: async () => true },
    storage: {
      local: { get: async keys => pick(keys), set: async value => { Object.assign(settings, value); } },
      onChanged: { addListener: listener => changeListeners.push(listener), removeListener() {} }
    }
  };
}

const errors = [];
function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`); });
}

async function openPanel(context, settings) {
  const page = await context.newPage();
  watch(page, 'panel');
  await page.setViewportSize({ width: PANEL, height: HEIGHT });
  await page.addInitScript(installChrome, { settings, manifest, tabUrl: PAGE_URL });
  await page.goto(pathToFileURL(path.join(dist, 'panel.html')).href);
  await page.waitForLoadState('load');
  // The panel learns the active tab asynchronously; resend the readiness report until it is accepted.
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.evaluate(context => { for (const listener of globalThis.__runtimeListeners) listener({ type: 'TOOLKIT_PAGE_READY', page: context }, { tab: { id: 7 }, frameId: 0 }); }, PAGE_CONTEXT);
    if (await page.locator('#page-context').textContent() === 'SO301000 · modern UI') break;
    await page.waitForTimeout(50);
  }
  if (await page.locator('#page-context').textContent() !== 'SO301000 · modern UI') throw new Error('The panel did not accept the page context.');
  await page.locator('#environment-badge', { hasText: 'PROD · Northwind Live' }).waitFor();
  return page;
}

async function sendField(page, result) {
  await page.evaluate(result => { for (const listener of globalThis.__runtimeListeners) listener({ type: 'TOOLKIT_FIELD_RESULT', result }, { tab: { id: 7 }, frameId: 0 }); }, result);
}

async function openMock(context, options) {
  const page = await context.newPage();
  watch(page, 'mock');
  await page.setViewportSize({ width: PAGE, height: HEIGHT });
  await page.setContent(mockPage(options));
  if (options?.highlight) {
    await page.evaluate(() => {
      const box = document.querySelector('#qty').getBoundingClientRect(), overlay = document.querySelector('#overlay');
      Object.assign(overlay.style, { left: `${box.left - 2}px`, top: `${box.top - 2}px`, width: `${box.width + 4}px`, height: `${box.height + 4}px` });
    });
  }
  if (options?.badge) await addPageBadge(page, options.badge);
  return page;
}

async function noOverflow(page, label) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!ok) errors.push(`${label}: horizontal overflow`);
}

async function capture(page) { return PNG.sync.read(await page.screenshot({ type: 'png' })); }

/** Composites the parts onto one opaque white canvas and writes an RGB (colour type 2) PNG. */
function writeComposite(file, parts) {
  const canvas = new PNG({ width: WIDTH, height: HEIGHT, colorType: 2, inputColorType: 6, inputHasAlpha: true });
  canvas.data.fill(255);
  for (const { image, x } of parts) {
    for (let y = 0; y < Math.min(image.height, HEIGHT); y++) {
      for (let column = 0; column < image.width && x + column < WIDTH; column++) {
        const from = (y * image.width + column) * 4, to = (y * WIDTH + x + column) * 4, alpha = image.data[from + 3] / 255;
        for (let channel = 0; channel < 3; channel++) canvas.data[to + channel] = Math.round(image.data[from + channel] * alpha + 255 * (1 - alpha));
        canvas.data[to + 3] = 255;
      }
    }
  }
  const buffer = PNG.sync.write(canvas, { colorType: 2, inputColorType: 6, inputHasAlpha: true });
  // Verify the written header: IHDR width, height and colour type 2 (RGB, no alpha).
  if (buffer.readUInt32BE(16) !== WIDTH || buffer.readUInt32BE(20) !== HEIGHT || buffer[25] !== 2) throw new Error(`${file}: unexpected PNG header`);
  writeFileSync(path.join(out, file), buffer);
  console.log(`wrote store-assets/screenshots/${file}`);
}

const baseSettings = () => ({ theme: 'light', environmentProfiles: structuredClone(PROFILES) });
const browser = await chromium.launch();
const context = await browser.newContext({ colorScheme: 'light', deviceScaleFactor: 1, locale: 'en-US' });
try {
  // 1. Inspect: a grid quantity cell highlighted, the panel showing its framework metadata.
  {
    const mock = await openMock(context, { highlight: true, badge: PROFILES[0] });
    const panel = await openPanel(context, baseSettings());
    await sendField(panel, CUSTOMER_FIELD);
    await sendField(panel, QUANTITY_FIELD);
    await panel.locator('#metadata-quality', { hasText: 'Framework metadata found' }).waitFor();
    await noOverflow(mock, 'shot 1 mock'); await noOverflow(panel, 'shot 1 panel');
    writeComposite('01-inspect.png', [{ image: await capture(mock), x: 0 }, { image: await capture(panel), x: PAGE }]);
    await mock.close(); await panel.close();
  }
  // 2. Environment: saved profiles with the current one marked and pinned production on top.
  {
    const mock = await openMock(context, { badge: PROFILES[0] });
    const panel = await openPanel(context, baseSettings());
    await panel.getByRole('button', { name: 'Environment', exact: true }).click();
    await panel.locator('.environment-row.current', { hasText: 'PROD · Northwind Live' }).waitFor();
    await noOverflow(mock, 'shot 2 mock'); await noOverflow(panel, 'shot 2 panel');
    writeComposite('02-environment.png', [{ image: await capture(mock), x: 0 }, { image: await capture(panel), x: PAGE }]);
    await mock.close(); await panel.close();
  }
  // 3. The environment badge on the page, with the Links tab open.
  {
    const mock = await openMock(context, { badge: PROFILES[0] });
    const settings = baseSettings();
    settings.linkLayout = [{ id: 'SM204505' }, { id: 'trace' }, { id: 'SM205070' }, { id: 'custom:demo-service-orders', label: 'Service Orders', screenId: 'FS3001PL' }];
    const panel = await openPanel(context, settings);
    await panel.getByRole('button', { name: 'Links', exact: true }).click();
    await panel.getByRole('button', { name: 'Service Orders', exact: true }).waitFor();
    await noOverflow(mock, 'shot 3 mock'); await noOverflow(panel, 'shot 3 panel');
    writeComposite('03-page-badge.png', [{ image: await capture(mock), x: 0 }, { image: await capture(panel), x: PAGE }]);
    await mock.close(); await panel.close();
  }
  // 4. Links in Edit mode: reorder, hide, and a user-added screen link.
  {
    const mock = await openMock(context, { badge: PROFILES[0] });
    const settings = baseSettings();
    settings.linkLayout = [{ id: 'SM204505' }, { id: 'custom:demo-service-orders', label: 'Service Orders', screenId: 'FS3001PL' }, { id: 'trace' }, { id: 'SM208000', hidden: true }, { id: 'SM205070' }];
    const panel = await openPanel(context, settings);
    await panel.getByRole('button', { name: 'Links', exact: true }).click();
    await panel.locator('[data-feature=links]').getByRole('button', { name: 'Edit', exact: true }).click();
    await panel.locator('.link-row', { hasText: 'FS3001PL · Your link' }).waitFor();
    await noOverflow(mock, 'shot 4 mock'); await noOverflow(panel, 'shot 4 panel');
    writeComposite('04-links-edit.png', [{ image: await capture(mock), x: 0 }, { image: await capture(panel), x: PAGE }]);
    await mock.close(); await panel.close();
  }
  // 5. Options: Copy for AI prompt presets.
  {
    const page = await context.newPage();
    watch(page, 'options');
    await page.setViewportSize({ width: WIDTH, height: HEIGHT });
    await page.addInitScript(installChrome, { settings: { theme: 'light' }, manifest, tabUrl: PAGE_URL });
    await page.goto(pathToFileURL(path.join(dist, 'options.html')).href);
    await page.locator('#prompt-preview mark').first().waitFor();
    await page.locator('#version', { hasText: manifest.version }).waitFor();
    await noOverflow(page, 'shot 5 options');
    writeComposite('05-options.png', [{ image: await capture(page), x: 0 }]);
    await page.close();
  }
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
