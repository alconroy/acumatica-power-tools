# Acumatica Power Tools

Version 1.1.0. A local toolkit for Acumatica 2026 R1 Classic and Modern UI, built for Chrome, Edge and desktop Firefox.

Built and supported by Acugen Consulting, an Acumatica Services Partner. Not an Acumatica product. Support: support@acugenconsulting.com. Source: https://github.com/alconroy/acumatica-power-tools

## Install

Install from the Chrome Web Store, Edge Add-ons or Firefox Add-ons. To build from source, run `npm ci` and `npm run check` from the repository root, or unzip the matching browser release.

- Chrome 116+: `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome`.
- Edge: `edge://extensions` → Developer mode → Load unpacked → `dist/edge`.
- Firefox 140+ desktop: `about:debugging` → This Firefox → Load Temporary Add-on → select `dist/firefox/manifest.json`. Never load the repo/source folder. Temporary add-ons disappear on restart.

On the Acumatica tab, click the toolkit toolbar button. Chrome and Edge open a side panel; Firefox opens a sidebar. If the sidebar was opened from a menu, click the toolbar on the Acumatica tab to grant active-tab access. If site access is needed, select **Grant access to <origin>** and approve the browser's origin prompt. Access is optional and revocable in browser extension settings.

## Tabs

**Inspect:** Select a field to see Screen, Graph, Field, View, DAC, type, binding and other technical context where exposed, with source labels. Missing metadata says Not exposed by this UI; inapplicable metadata and uncaptured values are distinct. Never infer mappings from generated IDs. Values are opt-in; hidden/password values are never captured. Verified DAC Browser/source-data links, page-only history, technical Copy and Copy for AI are available. Switching tabs, for example to an opened DAC link, keeps the inspection for the original tab until it navigates or closes.

**Environment:** Add named PROD/TEST/DEV/SANDBOX profiles with base URL, optional tenant (CompanyID) and color. **Capture this environment** fills the base URL and CompanyID tenant from the current page, or from the tab address on a site that has not granted access yet, and leaves the name and type to your own conventions. **Edit** changes a saved environment in place. Saving/importing requests only each profile's origin. Badges show type and name, for example PROD · Northwind Fire, in the panel and at the bottom centre of matching Acumatica pages, clear of the grid pager and navigation buttons in the bottom-right corner. Click the star on an environment to pin it to the top of the list; pinned environments keep their own order, which ↑ and ↓ change, and the rest stay sorted by name. Search the environment list by name, type, tenant or host; **Open screen** opens the same validated Screen ID in that environment without record parameters, and Enter opens the top match. PROD asks for confirmation and Remove asks before deleting. Export/import moves profiles between machines: import adds new profiles and amends saved ones with the same ID, or else the same base URL and tenant, and never removes a profile missing from the import. Pins travel with the export; an import without a pin keeps the saved one.

**Links:** Open Generic Inquiries, Customization Projects, Web Service Endpoints, Request Profiler, Data Providers, Import Scenarios, Import by Scenario, Record Audit History, Audit History by Screen, Access Rights by Screen/Role/User, Users, User Roles, System Monitor, Automation Schedules, Automation Schedule Statuses, Automation Schedule History, Business Events, Business Event History, Site Map, Apply Updates, Trace and the instance OpenAPI document. Paths preserve the application/tenant root, including from a tab showing the OpenAPI document. DAC Browser is enabled only for a verified qualified DAC. Copy link includes only the current Screen ID, never record parameters or fragments. Access to screens still follows the user's Acumatica rights. **Edit** arranges the list: ↑ and ↓ move a link, **Hide** removes a built-in link from the list until **Show** brings it back, and **Add a screen link** adds your own entry from a label and a Screen ID, which opens in the current site and tenant like the built-in links. Your own links can be removed. **Reset to default** restores the built-in order and shows every built-in link, keeping your own links at the end. Built-in links added by a later version appear at the end of a saved order.

## Options and browser differences

Choose Explain this field, Support ticket, Generic Inquiry help, Plain English, or a custom prompt. Placeholders are `{screenId}`, `{screenName}`, `{ui}`, `{environment}` and `{url}`; unknown placeholders stay unchanged. Copy for AI only writes local clipboard text; no AI service is called.

**Experimental: Classic native resolver** is off by default. Enabling it shows an explicit Inspect button for Acumatica's native metadata lookup. Neither same-origin request can occur while disabled; responses remain in memory. Read PRIVACY.md before enabling it.

Firefox's badge click may not open the sidebar because it does not convey a qualifying user gesture to the background page. Use the toolbar. Clipboard writes are allowed by clipboardWrite. Firefox is desktop only; the Android minimum-version lint warning is expected. Payload JS, HTML and CSS match Chrome and Edge; the build generates Firefox's event-page/sidebar manifest. No data is sent to the developer or third parties.
