import { describe, expect, it } from 'vitest';
import source from '../../apps/toolkit/public/manifest.json';
import { assertSourceManifest, firefoxManifest } from '../../tools/build.mjs';

describe('one source manifest and generated Firefox target', () => {
  it('preserves source and applies only the approved target differences', () => {
    const before = JSON.stringify(source);
    assertSourceManifest(source);
    const target = firefoxManifest(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(target.background).toEqual({ scripts: ['background.js'] });
    expect(target.sidebar_action).toEqual({ default_panel: 'panel.html', default_title: source.name, default_icon: {16:'icons/icon16.png',32:'icons/icon32.png'}, open_at_install:false });
    expect(target.browser_specific_settings).toEqual({gecko:{id:'acumatica-developer-toolkit@alconroy',strict_min_version:'140.0',data_collection_permissions:{required:['none']}}});
    expect(target).not.toHaveProperty('side_panel');
    expect(target).not.toHaveProperty('minimum_chrome_version');
    expect(target.permissions).toEqual(['activeTab','scripting','storage','clipboardWrite']);
    expect(target.optional_host_permissions).toEqual(source.optional_host_permissions);
    expect(target.options_ui).toEqual(source.options_ui);
    expect(source.permissions).toEqual(['activeTab','scripting','storage','sidePanel','clipboardWrite']);
    expect(source).not.toHaveProperty('content_scripts');
  });
  it('rejects every source manifest fault', () => {
    for (const fault of [{manifest_version:2},{browser_specific_settings:{}},{update_url:'https://updates.example/'},{name:'Toolkit for Chrome'},{description:'Chrome tool'}]) {
      expect(() => assertSourceManifest({...source,...fault})).toThrow();
    }
  });
});
