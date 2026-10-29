// Faults affect temporary archives only, never source or dist.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';
import { collect, readZip, verify, verifyTargets } from './archive.mjs';
import { assertSourceManifest } from './build.mjs';
const source=JSON.parse(readFileSync('apps/toolkit/public/manifest.json','utf8'));
const base=collect('dist/chrome'), firefox=collect('dist/firefox');
const directory=mkdtempSync(path.join(tmpdir(),'toolkit-zip-faults-'));
let proofs=0;
const copy=entries=>entries.map(e=>({...e,data:Buffer.from(e.data)}));
function manifest(entries,mutate) {const e=entries.find(e=>e.name==='manifest.json');const parsed=JSON.parse(e.data);mutate(parsed);e.data=Buffer.from(JSON.stringify(parsed));}
function fault(name,mutate,expected,target='chrome',sameStage=false) {
  const clean=target==='firefox'?firefox:base, entries=copy(clean);mutate(entries);
  const zip=path.join(directory,`${proofs}.zip`);writeFileSync(zip,zipSync(Object.fromEntries(entries.map(e=>[e.name,e.data]))));
  assert.throws(()=>verify(zip,target,source.version,sameStage?entries:clean,source),expected,name);
  proofs++;console.log(`Caught: ${name}`);
}
try {
  fault('raw backslash entry names',e=>e.find(x=>x.name==='icons/icon16.png').name='icons\\icon16.png',/backslashes/);
  fault('manifest below root',e=>e.find(x=>x.name==='manifest.json').name='nested/manifest.json',/not at the root/);
  fault('manifest BOM',e=>{const x=e.find(x=>x.name==='manifest.json');x.data=Buffer.concat([Buffer.from([239,187,191]),x.data]);},/with a BOM/);
  fault('altered payload bytes',e=>e.find(x=>x.name==='content.js').data=Buffer.from('broken'),/round-trip intact/);
  fault('missing staged file',e=>e.splice(e.findIndex(x=>x.name==='icons/icon16.png'),1),/staged but is missing/);
  fault('missing manifest reference',e=>manifest(e,m=>m.icons['16']='icons/missing.png'),/manifest references icons\/missing/,'chrome',true);
  fault('missing HTML reference',e=>e.find(x=>x.name==='panel.html').data=Buffer.from('<script src="missing.js"></script>'),/panel.html references missing/,'chrome',true);
  fault('escaping HTML reference',e=>e.find(x=>x.name==='panel.html').data=Buffer.from('<script src="../outside.js"></script>'),/reference escapes/,'chrome',true);
  fault('orphan file',e=>e.push({name:'orphan.js',data:Buffer.from('unused')}),/nothing references it/,'chrome',true);
  fault('gecko block in Chromium',e=>manifest(e,m=>m.browser_specific_settings={gecko:{}}),/browser_specific_settings/,'chrome',true);
  fault('Edge update URL',e=>manifest(e,m=>m.update_url='https://updates.example/'),/update_url/,'edge',true);
  for(const field of ['name','description']) fault(`Edge Chrome branding: ${field}`,e=>manifest(e,m=>m[field]+=' Chrome'),/must not contain Chrome/,'edge',true);
  for(const key of ['browser_specific_settings','sidebar_action','background']) fault(`Firefox missing ${key}`,e=>manifest(e,m=>delete m[key]),/approved transform/,'firefox',true);
  fault('Firefox Chromium keys',e=>manifest(e,m=>{m.side_panel={default_path:'panel.html'};m.minimum_chrome_version='116';m.permissions.push('sidePanel');}),/approved transform/,'firefox',true);
  fault('isolated window shared state',e=>e.find(x=>x.name==='content.js').data=Buffer.from('window.__acumaticaToolkit = {};'),/shared state through window/,'chrome',true);
  const a=copy(base),b=copy(base);b.find(e=>e.name==='panel.js').data=Buffer.from('drift');assert.throws(()=>verifyTargets(new Map([['chrome',a],['edge',b]])),/panel.js differs/);proofs++;console.log('Caught: cross-target bytes');
  const c=copy(base);c.pop();assert.throws(()=>verifyTargets(new Map([['chrome',base],['firefox',c]])),/file list differs/);proofs++;console.log('Caught: cross-target lists');
  const d=copy(base);d.find(e=>e.name==='manifest.json').data=Buffer.from(JSON.stringify(source));assert.throws(()=>verifyTargets(new Map([['chrome',base],['edge',d]])),/byte-identical/);proofs++;console.log('Caught: Chrome/Edge manifest byte drift');
  for(const patch of [{manifest_version:2},{browser_specific_settings:{}},{update_url:'https://updates.example/'},{name:'Chrome toolkit'},{description:'Chrome toolkit'}]){assert.throws(()=>assertSourceManifest({...source,...patch}));proofs++;}
  const raw=Buffer.from(zipSync(Object.fromEntries(base.map(e=>[e.name,e.data]))));const at=raw.indexOf(Buffer.from('icons/icon16.png'));raw[at+5]=92;assert.throws(()=>readZip(raw),/names differ/);proofs++;
  console.log(`${proofs} fault injections caught. Clean source and dist untouched.`);
} finally {
  assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));rmSync(directory,{recursive:true,force:true});
}
