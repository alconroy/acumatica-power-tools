import { zipSync } from 'fflate';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, verify, verifyTargets } from './archive.mjs';
import { assertSourceManifest } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'releases');
mkdirSync(releaseDir, { recursive: true });

const source = JSON.parse(readFileSync(path.join(root, 'apps/toolkit/public/manifest.json'), 'utf8'));
assertSourceManifest(source);
const built = new Map();
for (const name of ['chrome', 'edge', 'firefox']) {
  const directory = path.join(root, 'dist', name);
  const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  const filename = `acumatica-power-tools-${name}-v${manifest.version}.zip`;
  const zipPath = path.join(releaseDir, filename), staged = collect(directory);
  rmSync(zipPath, { force: true });
  writeFileSync(zipPath, zipSync(Object.fromEntries(staged.map(e => [e.name, e.data])), { level: 9 }));
  built.set(name, verify(zipPath, name, source.version, staged, source));
  console.log(`Verified releases/${filename} (${built.get(name).length} files)`);
}
verifyTargets(built);
console.log('Archive payload bytes and file lists match; Chrome/Edge manifests match.');
