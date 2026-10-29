// Verified public listing URLs (from acugenconsulting.com), shared by Options and the Links tab.
export type Store = 'chrome' | 'edge' | 'firefox';
export type Tool = 'trace' | 'audit';
export const STORE_NAMES: Record<Store, string> = { chrome: 'Chrome Web Store', edge: 'Edge Add-ons', firefox: 'Firefox Add-ons' };
export const STORE_LINKS: Record<Tool, Record<Store, string>> = {
  trace: {
    chrome: 'https://chromewebstore.google.com/detail/acumatica-trace-copier/emccpcookggdgpihjoniaajoknmlhhmb',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/acumatica-trace-copier/eoogiibhkdmpiidnnldnbnpodphpmnmb',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/acumatica-trace-copier/'
  },
  audit: {
    chrome: 'https://chromewebstore.google.com/detail/acumatica-audit-trail-ana/goacaifbkahgafpfkpghnhpocckjjcdd',
    edge: 'https://microsoftedge.microsoft.com/addons/detail/acumatica-audit-trail-ana/lnlbokkopkhnbjdblnbbijkdadhalbfe',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/acumatica-audit-trail-analyzer/'
  }
};
export const WEBSITE = 'https://www.acugenconsulting.com/';

/**
 * The store this build links to first. Only the Firefox build's manifest carries a gecko ID (added by the build);
 * Chrome and Edge share one payload, and Edge installs from the Chrome Web Store, so both use it.
 */
export function primaryStore(manifest: object): Store {
  return (manifest as { browser_specific_settings?: { gecko?: unknown } }).browser_specific_settings?.gecko ? 'firefox' : 'chrome';
}

/** The other stores, in a fixed order, for an "Also on" line. */
export function otherStores(primary: Store): Store[] {
  return (['chrome', 'edge', 'firefox'] as Store[]).filter(store => store !== primary);
}
