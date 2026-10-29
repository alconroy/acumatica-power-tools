# Acumatica Power Tools

Browser extension for Chrome, Microsoft Edge and desktop Firefox that inspects fields, labels environments and opens developer and admin screens on any Acumatica 2026 R1 site, in both Classic and Modern UI.

Built and supported by Acugen Consulting, an Acumatica Services Partner. Not an Acumatica product.

## What it does

The toolbar button opens one side panel (a sidebar in Firefox) with three tabs.

| Tab | Purpose |
|---|---|
| Inspect | Select a field to read its Screen, Graph, View, DAC, Field, data type and binding wherever the page exposes them, each with its source. Open verified DAC Browser links, and copy the technical context or a configurable Copy for AI prompt. Field values are opt-in. |
| Environment | Name your PROD, TEST, DEV and SANDBOX sites with a colour and optional tenant. A badge at the bottom of matching pages shows where you are. Pin and search sites, and open the same screen in another environment, with a confirmation before PROD. Export and import profiles. |
| Links | Open Generic Inquiries, Customization Projects, Web Service Endpoints, Request Profiler, Import Scenarios, Audit History, Access Rights, Users and Roles, System Monitor, Automation Schedules, Business Events, Site Map, Apply Updates, Trace and the OpenAPI document in the current site and tenant. Reorder or hide links and add your own by Screen ID. |

Nothing is guessed. Metadata the page does not expose is reported as **Not exposed**, never inferred from generated control names. Hidden and password values are never captured.

Options has four prompt presets plus a custom prompt, the System/Light/Dark appearance, and an **Experimental** Classic metadata resolver that is off by default.

## Install

Install it from the Chrome Web Store, Edge Add-ons or Firefox Add-ons. To run a build of your own:

| Browser | Unpacked installation |
|---|---|
| Chrome 116+ | `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome` |
| Microsoft Edge | `edge://extensions` → Developer mode → Load unpacked → `dist/edge` |
| Firefox 140+ desktop | `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json` |

Never load the source folder in Firefox. Temporary Firefox add-ons disappear when Firefox restarts.

## Use

On an Acumatica tab, click the toolbar button. The first time, select **Grant access to <origin>** and approve the browser's prompt for that site only. Access is optional, per site, and revocable in the browser's extension settings. Saving an Environment profile requests access for that profile's site so its page badge can appear. In Firefox, use the toolbar button to open the sidebar; clicking the page badge does not open it.

## Build from source

Run from the repository root with the checked-in lockfile (Node 24, npm 11):

```powershell
npm ci
npm run check
```

`npm run check` runs type checking, the unit tests, three-browser packaging with archive verification, a Chromium smoke test and Firefox lint. Firefox lint reports one expected warning about the Android minimum version, because the extension supports desktop Firefox 140+ only.

The build writes unpacked extensions to `dist/chrome`, `dist/edge` and `dist/firefox`, and store ZIPs to `releases/acumatica-power-tools-<browser>-v<version>.zip`. TypeScript is bundled with esbuild without minification. Only Firefox's generated manifest differs between targets.

| Path | Contents |
|---|---|
| `apps/toolkit/src` | Extension code: background, panel, options, content and the page metadata bridge |
| `apps/toolkit/public` | Source manifest, HTML, CSS, icons, README and privacy notice shipped in each package |
| `packages/core` | Shared TypeScript types and utilities |
| `test/unit`, `test/browser`, `test/fixtures` | Vitest and Playwright tests on fictional data |
| `tools` | Build and packaging scripts |

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: everything runs locally in your browser, with no telemetry, account or external server, and nothing is sent to the developer or any third party. Copy for AI writes to your clipboard and calls no AI service. The Experimental Classic resolver, off by default, makes two read-only requests to your own Acumatica site only when you press its button.

## Support

support@acugenconsulting.com, or [open an issue](https://github.com/alconroy/acumatica-power-tools/issues).

## License

[MIT](LICENSE)

## Also from Acugen Consulting

- [Acumatica Audit Trail Analyzer](https://github.com/alconroy/acumatica-audit-trail-analyzer): turns Acumatica's field-level audit history into a plain-English timeline of who changed what, and when. Free for Chrome, Edge and Firefox.
- [Acumatica Trace Copier](https://github.com/alconroy/acumatica-trace-copier): one click from error to answer. Free for Chrome, Edge and Firefox.
- [Lumi for Acumatica](https://www.acugenconsulting.com/products/lumi): see what matters, instantly. A licensed product for Acumatica, with a free 30-day trial.
