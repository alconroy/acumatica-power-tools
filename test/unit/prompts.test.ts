import { expect, it, vi } from 'vitest';
import { PROMPT_PRESETS, fillPrompt, copyForAI } from '../../apps/toolkit/src/prompts';
import { extractPageContext } from '../../packages/core/src/page';
it('fills every supported placeholder and preserves unknown placeholders', () => {
  expect(PROMPT_PRESETS.map(p=>p.id)).toEqual(['explain-field','support-ticket','gi-help','plain-english']);
  expect(fillPrompt('{screenId}|{screenName}|{ui}|{environment}|{url}|{unknown}',{screenId:'SO301000',screenName:'Sales Orders',ui:'modern',environment:'TEST',url:'/Main?ScreenId=SO301000',unknown:'ignored'}))
    .toBe('SO301000|Sales Orders|modern|TEST|/Main?ScreenId=SO301000|{unknown}');
});
it('copies a stored prompt plus exactly the supplied context, with a safe URL', async () => {
  vi.stubGlobal('chrome',{storage:{local:{get:async()=>({aiPrompt:'Screen {screenId} at {url}',environmentProfiles:[]})}}});
  const page=extractPageContext(document);page.url='https://erp.example/Main?ScreenId=SO301000&OrderNbr=SO-FICTION-001#secret';page.screenId={state:'available',value:'SO301000'};
  expect(await copyForAI('Exact technical context',page)).toBe('Screen SO301000 at /Main?ScreenId=SO301000\n\nExact technical context');
  vi.unstubAllGlobals();
});
