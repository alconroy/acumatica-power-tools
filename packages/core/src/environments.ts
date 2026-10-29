import type { EnvironmentProfile, PageContext } from './types';
import { siteRoot } from './links';

function normalizeBase(input: string): URL {
  const url = new URL(input);
  url.hash = '';
  url.search = '';
  url.pathname = `/${url.pathname.split('/').filter(Boolean).join('/')}${url.pathname === '/' ? '' : '/'}`;
  return url;
}

function tenantFromUrl(url: URL): string | undefined {
  const match = url.pathname.match(/\/t\/([^/]+)/i);
  if (match) return decodeURIComponent(match[1]);
  return Array.from(url.searchParams).find(([key, value]) => key.toLowerCase() === 'companyid' && value)?.[1];
}

function appPath(url: URL): string {
  const marker = url.pathname.search(/\/(?:t\/[^/]+\/)?(?:Main|Frames)(?:\/|$)/i);
  return marker < 0 ? url.pathname : url.pathname.slice(0, marker + 1);
}

export function normalizeProfile(profile: EnvironmentProfile): EnvironmentProfile {
  const base = normalizeBase(profile.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Environment URLs must use HTTP or HTTPS.');
  if (base.username || base.password) throw new Error('Environment URLs cannot contain credentials.');
  const { pinned, ...rest } = profile;
  const normalized: EnvironmentProfile = { ...rest, baseUrl: base.href.replace(/\/$/, '') };
  if (Number.isInteger(pinned) && pinned! >= 0) normalized.pinned = pinned;
  return normalized;
}

export function profilePattern(profile: EnvironmentProfile): string {
  const url = new URL(profile.baseUrl);
  return `${url.origin}/*`;
}

export function matchProfiles(href: string, profiles: EnvironmentProfile[]): EnvironmentProfile[] {
  const current = new URL(href);
  const currentTenant = tenantFromUrl(current);
  return profiles
    .filter(profile => {
      const base = normalizeBase(profile.baseUrl);
      if (base.origin !== current.origin) return false;
      const boundary = base.pathname === '/' || current.pathname === base.pathname.slice(0, -1) || current.pathname.startsWith(base.pathname);
      if (!boundary) return false;
      return !profile.tenant || profile.tenant.toLocaleLowerCase() === currentTenant?.toLocaleLowerCase();
    })
    .sort((a, b) => specificity(b) - specificity(a));
}

export function classifyEnvironment(href: string, profiles: EnvironmentProfile[]): EnvironmentProfile | null {
  const matches = matchProfiles(href, profiles);
  if (!matches.length) return null;
  const bestScore = specificity(matches[0]);
  const equallySpecific = matches.filter(item => specificity(item) === bestScore);
  return equallySpecific.length === 1 ? equallySpecific[0] : null;
}

function specificity(profile: EnvironmentProfile): number {
  return new URL(profile.baseUrl).pathname.length * 2 + (profile.tenant ? 1 : 0);
}

export function buildScreenUrl(destination: EnvironmentProfile, page: Pick<PageContext, 'screenId'>): string {
  const base = normalizeBase(destination.baseUrl);
  // Acumatica selects the tenant with the CompanyID parameter; a /t/<tenant>/Main path is a dead link.
  const url = new URL(`${base.pathname}Main`, base.origin);
  if (destination.tenant) url.searchParams.set('CompanyID', destination.tenant);
  if (page.screenId.state === 'available' && page.screenId.value) url.searchParams.set('ScreenId', page.screenId.value);
  return url.href;
}

/** Label shown on every badge, so one of many customer environments is identifiable at a glance. */
export function environmentLabel(profile: Pick<EnvironmentProfile, 'kind' | 'name'>): string {
  return `${profile.kind} · ${profile.name}`;
}

export interface EnvironmentCapture { baseUrl: string; tenant: string }

/** Prefills a new profile's address from the page; name and type follow the operator's own conventions. */
export function captureEnvironment(page: Pick<PageContext, 'url' | 'tenant'>): EnvironmentCapture {
  const root = new URL(siteRoot(page.url));
  root.pathname = root.pathname.replace(/t\/[^/]+\/$/i, '');
  const tenant = page.tenant.state === 'available' ? page.tenant.value || '' : '';
  return { baseUrl: root.href, tenant };
}

function byName(a: EnvironmentProfile, b: EnvironmentProfile): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.kind.localeCompare(b.kind);
}

/** Pinned profiles in their saved order, then the rest by name. */
export function compareProfiles(a: EnvironmentProfile, b: EnvironmentProfile): number {
  const aPinned = a.pinned !== undefined, bPinned = b.pinned !== undefined;
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  return (aPinned ? a.pinned! - b.pinned! : 0) || byName(a, b);
}

/** Case-insensitive match of every search word against type, name, tenant and host; pinned first, then by name. */
export function filterProfiles(profiles: EnvironmentProfile[], query: string): EnvironmentProfile[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return profiles
    .filter(profile => {
      const text = `${profile.kind} ${profile.name} ${profile.tenant || ''} ${new URL(profile.baseUrl).host}`.toLocaleLowerCase();
      return words.every(word => text.includes(word));
    })
    .sort(compareProfiles);
}

/** Renumbers pinned positions 0, 1, 2… in their current order so gaps and duplicates cannot accumulate. */
function renumberPins(profiles: EnvironmentProfile[], order: EnvironmentProfile[]): EnvironmentProfile[] {
  const positions = new Map(order.map((profile, index) => [profile.id, index]));
  return profiles.map(profile => {
    const position = positions.get(profile.id);
    if (position === undefined) { const { pinned: _removed, ...rest } = profile; return rest; }
    return { ...profile, pinned: position };
  });
}

function pinnedOrder(profiles: EnvironmentProfile[]): EnvironmentProfile[] {
  return profiles.filter(profile => profile.pinned !== undefined).sort(compareProfiles);
}

/** Pins a profile at the end of the pinned group, or unpins it; the saved list order is otherwise unchanged. */
export function setPinned(profiles: EnvironmentProfile[], id: string, pinned: boolean): EnvironmentProfile[] {
  const order = pinnedOrder(profiles).filter(profile => profile.id !== id);
  const target = profiles.find(profile => profile.id === id);
  if (pinned && target) order.push(target);
  return renumberPins(profiles, order);
}

/** Moves a pinned profile one place up (-1) or down (1) within the pinned group. */
export function movePinned(profiles: EnvironmentProfile[], id: string, offset: -1 | 1): EnvironmentProfile[] {
  const order = pinnedOrder(profiles);
  const from = order.findIndex(profile => profile.id === id), to = from + offset;
  if (from < 0 || to < 0 || to >= order.length) return profiles;
  [order[from], order[to]] = [order[to], order[from]];
  return renumberPins(profiles, order);
}

export function exportProfiles(profiles: EnvironmentProfile[]): string {
  return JSON.stringify({ version: 1, profiles: profiles.map(normalizeProfile) }, null, 2);
}

export function importProfiles(text: string): EnvironmentProfile[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { profiles?: unknown }).profiles)) throw new Error('Expected an environment export with a profiles array.');
  return (parsed as { profiles: EnvironmentProfile[] }).profiles.map(profile => {
    if (!profile.id || !profile.name || !profile.baseUrl || !['PROD', 'TEST', 'DEV', 'SANDBOX'].includes(profile.kind)) throw new Error('An environment profile is missing required fields.');
    return normalizeProfile(profile);
  });
}

export interface ProfileMerge { profiles: EnvironmentProfile[]; added: number; updated: number; kept: number }

function sameSite(a: EnvironmentProfile, b: EnvironmentProfile): boolean {
  return normalizeProfile(a).baseUrl.toLocaleLowerCase() === normalizeProfile(b).baseUrl.toLocaleLowerCase()
    && (a.tenant || '').toLocaleLowerCase() === (b.tenant || '').toLocaleLowerCase();
}

/**
 * Adds imported profiles that are new and amends existing ones; every other saved profile is kept.
 * An imported profile amends the saved profile with the same ID, otherwise the one with the same base URL and tenant,
 * keeping the saved ID so another machine's export does not duplicate a site.
 */
export function mergeProfiles(existing: EnvironmentProfile[], incoming: EnvironmentProfile[]): ProfileMerge {
  const profiles = [...existing];
  const touched = new Set<number>();
  let added = 0, updated = 0;
  for (const profile of incoming) {
    let index = profiles.findIndex(saved => saved.id === profile.id);
    if (index < 0) index = profiles.findIndex(saved => sameSite(saved, profile));
    if (index < 0) { profiles.push(profile); touched.add(profiles.length - 1); added++; continue; }
    // An export without a pin (for example one made before pinning existed) keeps the saved pin.
    const amended: EnvironmentProfile = { ...profile, id: profiles[index].id };
    if (amended.pinned === undefined && profiles[index].pinned !== undefined) amended.pinned = profiles[index].pinned;
    if (!sameProfile(amended, profiles[index])) {
      profiles[index] = amended;
      if (index < existing.length && !touched.has(index)) updated++;
      touched.add(index);
    }
  }
  const kept = existing.filter((_, index) => !touched.has(index)).length;
  return { profiles: renumberPins(profiles, pinnedOrder(profiles)), added, updated, kept };
}

function sameProfile(a: EnvironmentProfile, b: EnvironmentProfile): boolean {
  return (['id', 'name', 'baseUrl', 'tenant', 'kind', 'color', 'pinned'] as const).every(key => a[key] === b[key]);
}

export { appPath, tenantFromUrl };
