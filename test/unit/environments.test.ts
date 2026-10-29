import { describe, expect, it } from 'vitest';
import { buildScreenUrl, captureEnvironment, classifyEnvironment, environmentLabel, exportProfiles, filterProfiles, importProfiles, matchProfiles, mergeProfiles, movePinned, normalizeProfile, setPinned } from '../../packages/core/src/environments';
import type { EnvironmentProfile } from '../../packages/core/src/types';

const profiles: EnvironmentProfile[] = [
  { id:'root', name:'Root', baseUrl:'https://erp.example.com/', kind:'PROD', color:'#a00' },
  { id:'test', name:'Test app', baseUrl:'https://erp.example.com/acumatica', kind:'TEST', color:'#00a' },
  { id:'tenant', name:'Tenant A', baseUrl:'https://erp.example.com/acumatica', tenant:'Tenant A', kind:'DEV', color:'#080' }
];

describe('environment matching', () => {
  it('prefers the most specific application path', () => {
    expect(classifyEnvironment('https://erp.example.com/acumatica/Main?ScreenId=SO301000', profiles)?.id).toBe('test');
  });

  it('requires a path boundary and exact origin', () => {
    expect(matchProfiles('https://erp.example.com/acumatica-copy/Main', profiles).map(p => p.id)).toEqual(['root']);
    expect(matchProfiles('https://erp.example.com.evil.test/acumatica/Main', profiles)).toEqual([]);
  });

  it('prefers a matching tenant profile over its generic fallback', () => {
    expect(classifyEnvironment('https://erp.example.com/acumatica/t/Tenant%20A/Main', profiles)?.id).toBe('tenant');
    expect(classifyEnvironment('https://erp.example.com/acumatica/t/Other/Main', profiles)?.id).toBe('test');
  });

  it('recognises the tenant from the CompanyID parameter Acumatica uses', () => {
    const live: EnvironmentProfile[] = [
      { id:'site', name:'Site', baseUrl:'https://hosted.example', kind:'TEST', color:'#00a' },
      { id:'live', name:'Live', baseUrl:'https://hosted.example', tenant:'Live', kind:'PROD', color:'#a00' }
    ];
    expect(classifyEnvironment('https://hosted.example/Main?CompanyID=Live&ScreenId=FS3001PL', live)?.id).toBe('live');
    expect(classifyEnvironment('https://hosted.example/Main?companyid=live&ScreenId=FS3001PL', live)?.id).toBe('live');
    expect(classifyEnvironment('https://hosted.example/Main?CompanyID=Other', live)?.id).toBe('site');
    expect(classifyEnvironment('https://hosted.example/Main?ScreenId=FS3001PL', [live[1]])).toBeNull();
  });

  it('opens a tenant destination with CompanyID, never a /t/ path', () => {
    const live = normalizeProfile({ id:'l', name:'Live', baseUrl:'https://hosted.example', tenant:'Live', kind:'PROD', color:'#a00' });
    expect(buildScreenUrl(live, { screenId: { state:'available', value:'FS3001PL' } })).toBe('https://hosted.example/Main?CompanyID=Live&ScreenId=FS3001PL');
  });

  it('returns unclassified for equally specific profiles', () => {
    expect(classifyEnvironment('https://duplicate.example/Main', [
      { id:'a',name:'A',baseUrl:'https://duplicate.example',kind:'TEST',color:'#111' },
      { id:'b',name:'B',baseUrl:'https://duplicate.example',kind:'DEV',color:'#222' }
    ])).toBeNull();
  });

  it('builds a screen-only destination and drops source context', () => {
    const destination = normalizeProfile({ id:'x', name:'Sandbox', baseUrl:'https://sandbox.example/acumatica', tenant:'Demo', kind:'SANDBOX', color:'#333' });
    const url = buildScreenUrl(destination, { screenId: { state:'available', value:'SO301000' } });
    expect(url).toBe('https://sandbox.example/acumatica/Main?CompanyID=Demo&ScreenId=SO301000');
    expect(url).not.toContain('OrderNbr');
  });

  it('rejects invalid imported data', () => {
    expect(() => importProfiles('{"version":1,"profiles":[{"name":"bad"}]}')).toThrow(/required fields/);
  });

  it('merges an import: adds new profiles, amends matches and keeps the rest', () => {
    const saved: EnvironmentProfile[] = [
      { id:'a', name:'Alpha', baseUrl:'https://alpha.example', tenant:'Live', kind:'PROD', color:'#a00' },
      { id:'b', name:'Bravo', baseUrl:'https://bravo.example', kind:'TEST', color:'#0a0' },
      { id:'c', name:'Charlie', baseUrl:'https://charlie.example', kind:'DEV', color:'#00a' }
    ];
    const merge = mergeProfiles(saved, importProfiles(JSON.stringify({ version: 1, profiles: [
      { id:'a', name:'Alpha Renamed', baseUrl:'https://alpha.example', tenant:'Live', kind:'PROD', color:'#a00' },
      { id:'other-machine', name:'Bravo UAT', baseUrl:'https://BRAVO.example/', kind:'TEST', color:'#0a0' },
      { id:'c', name:'Charlie', baseUrl:'https://charlie.example', kind:'DEV', color:'#00a' },
      { id:'d', name:'Delta', baseUrl:'https://delta.example', kind:'SANDBOX', color:'#333' }
    ] })));
    expect(merge).toMatchObject({ added: 1, updated: 2, kept: 1 });
    expect(merge.profiles.map(p => `${p.id}:${p.name}`)).toEqual(['a:Alpha Renamed', 'b:Bravo UAT', 'c:Charlie', 'd:Delta']);
    expect(mergeProfiles(saved, []).profiles).toEqual(saved);
  });

  it('rejects protocols and embedded credentials that must never be stored', () => {
    expect(() => normalizeProfile({ id:'x',name:'Bad',baseUrl:'ftp://erp.example',kind:'TEST',color:'#000' })).toThrow(/HTTP/);
    expect(() => normalizeProfile({ id:'x',name:'Bad',baseUrl:'https://user:secret@erp.example',kind:'TEST',color:'#000' })).toThrow(/credentials/);
  });
});

describe('managing many environments', () => {
  const many: EnvironmentProfile[] = [
    { id:'s', name:'Northwind Fire', baseUrl:'https://northwind.example', tenant:'Live', kind:'PROD', color:'#a00' },
    { id:'st', name:'Northwind Fire', baseUrl:'https://northwind-test.example', tenant:'Test', kind:'TEST', color:'#0a0' },
    { id:'a', name:'acme Pumps', baseUrl:'https://acme.example/erp', kind:'DEV', color:'#00a' }
  ];

  it('labels a badge with type and name', () => {
    expect(environmentLabel(many[0])).toBe('PROD · Northwind Fire');
  });

  it('filters on every word across type, name, tenant and host, sorted by name', () => {
    expect(filterProfiles(many, '').map(p => p.id)).toEqual(['a', 's', 'st']);
    expect(filterProfiles(many, 'northwind prod').map(p => p.id)).toEqual(['s']);
    expect(filterProfiles(many, 'TEST').map(p => p.id)).toEqual(['st']);
    expect(filterProfiles(many, 'acme.example').map(p => p.id)).toEqual(['a']);
    expect(filterProfiles(many, 'nothing')).toEqual([]);
  });

  it('captures base URL and CompanyID tenant, leaving name and type to the operator', () => {
    const available = (value: string) => ({ state: 'available' as const, value, source: 'fixture' });
    const missing = { state: 'unavailable' as const };
    expect(captureEnvironment({ url: 'https://hosted.example/Main?CompanyID=Live&ScreenId=FS3001PL&OrderNbr=1', tenant: available('Live') }))
      .toEqual({ baseUrl: 'https://hosted.example/', tenant: 'Live' });
    expect(captureEnvironment({ url: 'https://erp.example/acumatica/t/Demo/Main?ScreenId=SO301000', tenant: available('Demo') }))
      .toEqual({ baseUrl: 'https://erp.example/acumatica/', tenant: 'Demo' });
    expect(captureEnvironment({ url: 'https://erp.example/Main', tenant: missing }))
      .toEqual({ baseUrl: 'https://erp.example/', tenant: '' });
  });
});

describe('pinning and ordering environments', () => {
  const site = (id: string, name: string, pinned?: number): EnvironmentProfile =>
    ({ id, name, baseUrl: `https://${id}.example`, kind: 'TEST', color: '#0a0', ...(pinned === undefined ? {} : { pinned }) });
  const order = (profiles: EnvironmentProfile[]) => filterProfiles(profiles, '').map(p => `${p.id}${p.pinned === undefined ? '' : `@${p.pinned}`}`);

  it('lists pinned environments first in their saved order, then the rest by name', () => {
    const profiles = [site('z', 'Zulu'), site('m', 'Mike', 1), site('a', 'Alpha'), site('y', 'Yankee', 0)];
    expect(order(profiles)).toEqual(['y@0', 'm@1', 'a', 'z']);
    expect(filterProfiles(profiles, 'k').map(p => p.id)).toEqual(['y', 'm']);
  });

  it('pins at the end of the pinned group and unpins without leaving gaps', () => {
    let profiles = [site('a', 'Alpha'), site('b', 'Bravo'), site('c', 'Charlie')];
    profiles = setPinned(profiles, 'c', true);
    profiles = setPinned(profiles, 'a', true);
    expect(order(profiles)).toEqual(['c@0', 'a@1', 'b']);
    profiles = setPinned(profiles, 'c', false);
    expect(order(profiles)).toEqual(['a@0', 'b', 'c']);
    expect(profiles.find(p => p.id === 'c')).not.toHaveProperty('pinned');
    expect(setPinned(profiles, 'missing', true)).toEqual(profiles);
  });

  it('moves a pinned environment up or down and ignores moves past either end', () => {
    let profiles = [site('a', 'Alpha', 0), site('b', 'Bravo', 1), site('c', 'Charlie', 2), site('d', 'Delta')];
    profiles = movePinned(profiles, 'c', -1);
    expect(order(profiles)).toEqual(['a@0', 'c@1', 'b@2', 'd']);
    profiles = movePinned(profiles, 'a', 1);
    expect(order(profiles)).toEqual(['c@0', 'a@1', 'b@2', 'd']);
    expect(movePinned(profiles, 'c', -1)).toBe(profiles);
    expect(movePinned(profiles, 'b', 1)).toBe(profiles);
    expect(movePinned(profiles, 'd', -1)).toBe(profiles);
  });

  it('exports pins, drops invalid ones on import and keeps a saved pin the import does not mention', () => {
    const saved = [site('a', 'Alpha', 0), site('b', 'Bravo', 1)];
    expect(JSON.parse(exportProfiles(saved)).profiles.map((p: EnvironmentProfile) => p.pinned)).toEqual([0, 1]);
    const imported = importProfiles(JSON.stringify({ version: 1, profiles: [
      { ...site('a', 'Alpha'), pinned: -1 },
      { ...site('c', 'Charlie'), pinned: 'top' },
      site('d', 'Delta', 0)
    ] }));
    expect(imported.map(p => p.pinned)).toEqual([undefined, undefined, 0]);
    const merge = mergeProfiles(saved, imported);
    // Alpha keeps its pin; Delta's imported position 0 ties with Alpha and the tie is broken by name.
    expect(order(merge.profiles)).toEqual(['a@0', 'd@1', 'b@2', 'c']);
    expect(merge).toMatchObject({ added: 2, updated: 0, kept: 2 });
  });
});
