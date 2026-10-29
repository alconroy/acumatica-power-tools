import { SCREEN_ID } from './screens';
import type { PageContext } from './types';
const DAC_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;

function applicationBasePath(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  // Service routes (entity, odata, identity) mark the root too, so a tab on the OpenAPI document links back to the app.
  const routeMarkers = new Set(['main', 'frames', 'pages', 'screens', 'scripts', 'dacbrowser', 'entity', 'odata', 'identity']);
  let routeIndex = segments.findIndex(segment => routeMarkers.has(segment.toLocaleLowerCase()) || SCREEN_ID.test(segment.replace(/\.aspx$/i, '')));
  if (routeIndex < 0 && segments.at(-1)?.toLocaleLowerCase().endsWith('.aspx')) routeIndex = segments.length - 1;
  const baseSegments = routeIndex < 0 ? segments : segments.slice(0, routeIndex);
  return `/${baseSegments.join('/')}${baseSegments.length ? '/' : ''}`;
}

/** Application root, preserving an optional tenant path and excluding record context. */
export function siteRoot(pageUrl: string): string {
  const page = new URL(pageUrl);
  if (!/^https?:$/.test(page.protocol) || page.username || page.password) throw new Error('An HTTP or HTTPS application URL is required.');
  return new URL(applicationBasePath(page), page.origin).href;
}
export function buildSiteScreenUrl(pageUrl: string, screenId: string): string | null {
  if (!SCREEN_ID.test(screenId)) return null;
  const url = new URL('Main', siteRoot(pageUrl));
  url.searchParams.set('ScreenId', screenId.toUpperCase());
  return url.href;
}
export function buildSiteRouteUrl(pageUrl: string, relativePath: string): string {
  if (!relativePath || /^(?:[a-z]+:|\/|\\)/i.test(relativePath) || /[?#\\]/.test(relativePath) || relativePath.split('/').some(segment => ['..', '.'].includes(decodeURIComponent(segment)))) {
    throw new Error('A local application route is required.');
  }
  const root = siteRoot(pageUrl), url = new URL(relativePath, root);
  if (!url.href.startsWith(root)) throw new Error('Route escapes the application root.');
  return url.href;
}

export function buildDacBrowserUrl(pageUrl: string, dacName: string): string | null {
  const qualifiedName = dacName.split(',')[0].trim();
  if (!DAC_NAME.test(qualifiedName)) return null;
  const parts = qualifiedName.split('.');
  const entity = parts.pop()!;
  const namespace = parts.join('.');
  const page = new URL(pageUrl);
  const path = `${applicationBasePath(page)}dacBrowser/${encodeURIComponent(namespace)}/${encodeURIComponent(entity)}`;
  return new URL(path, page.origin).href;
}

export function buildDacSourceUrl(pageUrl: string, dacName: string): string | null {
  const qualifiedName = dacName.split(',')[0].trim();
  if (!DAC_NAME.test(qualifiedName)) return null;
  const page = new URL(pageUrl);
  const url = new URL(`${applicationBasePath(page)}GenericInquiry/GenericInquiry.aspx`, page.origin);
  url.searchParams.set('dac', qualifiedName);
  return url.href;
}

/** Screen link without record parameters, fragments or tenant path; the host is included only when asked. */
export function buildSafeScreenLink(page: PageContext, includeHostname: boolean): string {
  const source = new URL(page.url);
  const tenantMatch = source.pathname.match(/^(.*?\/)(?:t\/[^/]+\/)?(?:Main|Frames(?:\/Default\.aspx)?)(?:\/|$)/i);
  const root = tenantMatch?.[1] || '/';
  const path = `${root.replace(/\/$/, '')}/Main`.replace(/^\/\//, '/');
  const output = new URL(path, source.origin);
  if (page.screenId.state === 'available' && page.screenId.value) output.searchParams.set('ScreenId', page.screenId.value);
  return includeHostname ? output.href : `${output.pathname}${output.search}`;
}
