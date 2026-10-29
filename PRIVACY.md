# Privacy Policy — Acumatica Power Tools

**Short version: nothing is collected or sent to the developer or any third party. Everything runs locally in your browser.**

Firefox declares `data_collection_permissions: none`: no data is sent to the developer or any third party. The only optional requests go to the user's own Acumatica origin through the Experimental resolver described below.

Local processing only: no backend, telemetry, credentials or external data transmission. Site access is optional and scoped to an origin and can be revoked. Inspection results stay in panel memory and clear on navigation or panel close. When you switch tabs, the previous tab's inspection is kept in panel memory and restored when you return, unless that tab navigates or closes first. Field values are opt-in; password and hidden controls are never captured. Data reaches the clipboard only when you select Copy or Copy for AI.

Environment profiles (names, base URLs, tenant labels, classifications, colors and pinned positions) stay in local extension storage. Capture this environment reads only the current page's address into the add form; nothing is stored until you save. Environment makes no network requests.

Local storage also contains the user's AI prompt, the Experimental resolver preference, the System/Light/Dark appearance choice and the Links layout: the order of the links, which ones are hidden, and the label and Screen ID of each link the user adds. Added links hold no host, tenant or record data; they are built from the current page's site root when opened. Updating from a version before 1.0.16 deletes the retired Screens tab's recent Screen IDs and new-tab preference. Nothing uses storage.sync. Prompt text is filled locally; Copy for AI never contacts an AI service. Options displays no captured business data. Links navigate only when the user selects an entry; generated screen URLs drop record parameters and fragments.

## Permissions

| Permission | Purpose |
|---|---|
| activeTab | Read and inspect the page explicitly invoked from the toolbar. |
| scripting | Inject bundled MAIN metadata bridge and ISOLATED orchestration; register the badge only on saved profiles' granted origins. |
| storage | Store user profiles and prompts/preferences locally. |
| sidePanel (Chrome/Edge only) | Display the toolkit's side panel. Firefox uses sidebar_action instead. |
| clipboardWrite | Write user-requested technical context, prompt text, screen links or profile export to the local clipboard; the clipboard is never read. |
| Optional http://*/* and https://*/* origins | Acumatica can be self-hosted on arbitrary origins. Access is requested only for the selected origin and is revocable; broad optional patterns do not automatically grant access. |

Deleting a profile removes its badge registration if it was the last profile. Browser-granted origin permission can be revoked separately in extension settings. Profile exports may contain the URLs and tenant labels the user entered; export happens only on request.

Classic pages sometimes omit exact field and DAC names from browser memory. The optional **Resolve missing Classic metadata (experimental)** button invokes the same Acumatica callback used by its native Inspect Element feature, then makes a same-origin request to the read-only `Customization/WikiTooltip.aspx` field metadata service to qualify the returned DAC. Acumatica processes the native callback using the current page state, as it does when you choose Inspect Element yourself. The extension does not add the selected field value, URL query parameters, or fragments to the field-help request. Returned metadata is processed in memory and is not saved. Neither request is made unless you press that button. Both requests cannot occur while the Experimental setting is off (the default).

## Contact

Questions or concerns: support@acugenconsulting.com, or open an issue at
https://github.com/alconroy/acumatica-power-tools/issues
