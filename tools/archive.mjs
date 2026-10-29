// Verification ported from D:/AcumaticaAuditAnalyzer/tools/package.mjs (MIT).
// Read archive bytes after writing: never trust a normalized ZIP file list.
import { inflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { assertSourceManifest, firefoxManifest } from './build.mjs';

export function collect(directory, relative = '') {
  const entries = [];
  for (const name of readdirSync(path.join(directory, relative))) {
    const rel = path.join(relative, name), full = path.join(directory, rel);
    if (statSync(full).isDirectory()) entries.push(...collect(directory, rel));
    else if (!rel.endsWith('.map')) entries.push({ name: rel.replaceAll('\\', '/'), data: readFileSync(full) });
  }
  return entries;
}
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No end-of-central-directory record: not a zip.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt central directory.');
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('latin1', p + 46, p + 46 + nameLen);
    if (buf.readUInt32LE(localAt) !== 0x04034b50) throw new Error('Corrupt local header.');
    const lNameLen = buf.readUInt16LE(localAt + 26), lExtraLen = buf.readUInt16LE(localAt + 28);
    const localName = buf.toString('latin1', localAt + 30, localAt + 30 + lNameLen);
    if (localName !== name) throw new Error('Local and central ZIP names differ.');
    const method = buf.readUInt16LE(p + 10), compSize = buf.readUInt32LE(p + 20);
    const from = localAt + 30 + lNameLen + lExtraLen, body = buf.subarray(from, from + compSize);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP method ${method}.`);
    entries.push({ name, data: method === 8 ? inflateRawSync(body) : body });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
function htmlReferences(text) {
  return [...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(m => m[1]).filter(ref => !/^(?:[a-z]+:|\/\/|#)/i.test(ref));
}
function manifestReferences(manifest) {
  return [
    ...(manifest.content_scripts || []).flatMap(c => [...(c.js || []), ...(c.css || [])]),
    ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {}),
    ...Object.values(manifest.sidebar_action?.default_icon || {}),
    manifest.action?.default_popup, manifest.options_ui?.page, manifest.side_panel?.default_path,
    manifest.sidebar_action?.default_panel, manifest.background?.service_worker,
    ...(manifest.background?.scripts || [])
  ].filter(Boolean);
}
export function verify(zipPath, target, version, staged, sourceManifest) {
  const entries = readZip(readFileSync(zipPath)), names = entries.map(e => e.name), problems = [];
  const byName = new Map(staged.map(e => [e.name, e.data]));
  for (const entry of entries) {
    const source = byName.get(entry.name);
    if (!source) problems.push(`${entry.name} is in the package but was never staged`);
    else if (!source.equals(entry.data)) problems.push(`${entry.name} does not survive the zip round-trip intact`);
  }
  for (const name of byName.keys()) if (!names.includes(name)) problems.push(`${name} was staged but is missing from the package`);
  if (new Set(names).size !== names.length) problems.push('duplicate archive entry names');
  if (names.some(n => n.includes('\\'))) problems.push('entry names contain backslashes');
  if (names.some(n => n.startsWith('/') || n.split('/').includes('..'))) problems.push('entry path escapes archive root');
  if (!names.includes('manifest.json')) problems.push('manifest.json is not at the root of the archive');
  const packed = entries.find(e => e.name === 'manifest.json'), referenced = new Set();
  if (packed) {
    const bytes = packed.data, hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    if (hasBom) problems.push('manifest.json was written with a BOM');
    const parsed = JSON.parse(bytes.toString('utf8', hasBom ? 3 : 0));
    if (parsed.version !== version) problems.push('packaged manifest version differs');
    if (target === 'firefox') {
      if (JSON.stringify(parsed) !== JSON.stringify(firefoxManifest(sourceManifest))) problems.push('firefox manifest does not match the approved transform (gecko, sidebar_action, background.scripts)');
    } else {
      try { assertSourceManifest(parsed); } catch (error) { problems.push(`${target}: ${error.message}`); }
      if (JSON.stringify(parsed) !== JSON.stringify(sourceManifest)) problems.push(`${target} manifest differs from source`);
    }
    for (const ref of new Set(manifestReferences(parsed))) {
      referenced.add(ref);
      if (!names.includes(ref)) problems.push(`manifest references ${ref}, which is not in the package`);
    }
  }
  for (const entry of entries.filter(e => e.name.endsWith('.html'))) {
    const base = path.posix.dirname(entry.name);
    for (const ref of htmlReferences(entry.data.toString('utf8'))) {
      const resolved = path.posix.normalize(path.posix.join(base === '.' ? '' : base, ref.split(/[?#]/)[0]));
      referenced.add(resolved);
      if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) problems.push(`${entry.name} reference escapes archive root`);
      else if (!names.includes(resolved)) problems.push(`${entry.name} references ${ref}, which is not in the package`);
    }
  }
  const roots = new Set(['manifest.json', 'README.md', 'PRIVACY.md', 'bridge.js', 'content.js']);
  for (const required of roots) if (!names.includes(required)) problems.push(`required root ${required} is missing`);
  for (const name of names) if (!roots.has(name) && !referenced.has(name)) problems.push(`${name} is in the package but nothing references it`);
  for (const file of ['content.js', 'panel.js', 'options.js', 'background.js']) {
    const entry = entries.find(e => e.name === file);
    for (const [i, line] of (entry?.data.toString('utf8') || '').split(/\r?\n/).entries()) {
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      if (/window\s*(?:\.\s*__acumaticaToolkit\w*|\[\s*["']__acumaticaToolkit\w*["']\s*\])/.test(line)) problems.push(`${file}:${i + 1} reaches shared state through window; use globalThis`);
    }
  }
  if (problems.length) throw new Error(`${path.basename(zipPath)} failed verification:\n  - ${problems.join('\n  - ')}`);
  return entries;
}
export function verifyTargets(built) {
  const [reference, ...others] = [...built.keys()], base = new Map(built.get(reference).map(e => [e.name, e.data])), drift = [];
  for (const other of others) {
    const compare = new Map(built.get(other).map(e => [e.name, e.data]));
    for (const name of new Set([...base.keys(), ...compare.keys()])) {
      if (name === 'manifest.json') continue;
      const a = base.get(name), b = compare.get(name);
      if (!a || !b) drift.push(`${name} file list differs between ${reference} and ${other}`);
      else if (!a.equals(b)) drift.push(`${name} differs between ${reference} and ${other}`);
    }
  }
  if (built.has('chrome') && built.has('edge')) {
    const manifest = target => built.get(target).find(e => e.name === 'manifest.json')?.data;
    if (!manifest('chrome')?.equals(manifest('edge'))) drift.push('edge manifest is no longer byte-identical to chrome');
  }
  if (drift.length) throw new Error(`packages have drifted apart:\n  - ${drift.join('\n  - ')}`);
}
