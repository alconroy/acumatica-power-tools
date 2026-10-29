import { PNG } from 'pngjs';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'dist');
const apps = {
  'toolkit': { entries:['background', 'bridge', 'content', 'panel', 'options'] }
};

export function assertSourceManifest(manifest) {
  if (manifest.manifest_version !== 3) throw new Error('Source manifest must be MV3.');
  for (const key of ['browser_specific_settings', 'update_url']) {
    if (Object.hasOwn(manifest, key)) throw new Error(`Source manifest must not contain ${key}.`);
  }
  for (const key of ['name', 'description']) {
    if (/chrome/i.test(manifest[key] || '')) throw new Error(`Source manifest ${key} must not contain Chrome.`);
  }
}

export function firefoxManifest(source) {
  assertSourceManifest(source);
  const manifest = structuredClone(source);
  delete manifest.minimum_chrome_version;
  delete manifest.side_panel;
  manifest.permissions = manifest.permissions.filter(permission => permission !== 'sidePanel');
  manifest.background = { scripts: ['background.js'] };
  manifest.sidebar_action = {
    default_panel: 'panel.html', default_title: 'Acumatica Power Tools',
    default_icon: { '16': 'icons/icon16.png', '32': 'icons/icon32.png' }, open_at_install: false
  };
  manifest.browser_specific_settings = { gecko: {
    id: 'acumatica-developer-toolkit@alconroy', strict_min_version: '140.0',
    data_collection_permissions: { required: ['none'] }
  } };
  return manifest;
}

// The Gearhead icons ship from public/icons; each manifest size key must match the PNG's real size.
export function assertIcons(manifest, dir) {
  const icons = { ...manifest.icons, ...manifest.action?.default_icon };
  for (const [size, file] of Object.entries(icons)) {
    const png = PNG.sync.read(readFileSync(path.join(dir, file)));
    if (png.width !== Number(size) || png.height !== Number(size)) {
      throw new Error(`${file} is ${png.width}x${png.height}; the manifest declares ${size}.`);
    }
  }
}

async function main() {
const { build } = await import('esbuild');
assertSourceManifest(JSON.parse(readFileSync(path.join(root, 'apps/toolkit/public/manifest.json'), 'utf8')));
rmSync(outputRoot, { recursive: true, force: true });
for (const [name, config] of Object.entries(apps)) {
  const appRoot = path.join(root, 'apps', name);
  const output = path.join(outputRoot, name === 'toolkit' ? 'chrome' : name);
  mkdirSync(output, { recursive: true });
  const entryPoints = Object.fromEntries(config.entries.map(entry => [entry, path.join(appRoot, 'src', `${entry}.ts`)]));
  await build({
    entryPoints,
    outdir: output,
    bundle: true,
    format: 'iife',
    target: 'chrome114',
    sourcemap: true,
    minify: false,
    logLevel: 'warning'
  });
  cpSync(path.join(appRoot, 'public'), output, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error(`${name} is not Manifest V3.`);
  assertIcons(manifest, output);
  for (const required of ['manifest.json', 'README.md', 'PRIVACY.md']) {
    if (!existsSync(path.join(output, required))) throw new Error(`${name} is missing ${required}.`);
  }
}

cpSync(path.join(outputRoot, 'chrome'), path.join(outputRoot, 'edge'), { recursive: true });
cpSync(path.join(outputRoot, 'chrome'), path.join(outputRoot, 'firefox'), { recursive: true });
writeFileSync(path.join(outputRoot, 'firefox/manifest.json'), JSON.stringify(firefoxManifest(JSON.parse(readFileSync(path.join(outputRoot, 'chrome/manifest.json'), 'utf8'))), null, 2) + '\n');
console.log(`Built Acumatica Power Tools for Chrome, Edge and Firefox in ${outputRoot}`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
