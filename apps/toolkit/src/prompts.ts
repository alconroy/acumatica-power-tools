import { buildSafeScreenLink } from '../../../packages/core/src/links';
import { classifyEnvironment } from '../../../packages/core/src/environments';
import type { EnvironmentProfile, PageContext } from '../../../packages/core/src/types';
export const PROMPT_PRESETS = [
  { id: 'explain-field', name: 'Explain this field', text: 'I am looking at Acumatica screen {screenId} ({screenName}) in the {ui} UI on {environment}. Below is the technical context of a field from the screen. Explain what this field is, which DAC and view it belongs to, and how I would reference it in a customization or Generic Inquiry.' },
  { id: 'support-ticket', name: 'Support ticket', text: 'Turn the following Acumatica context into a concise support ticket with a title, environment, screen, steps to reproduce, and a technical details section.' },
  { id: 'gi-help', name: 'Generic Inquiry help', text: 'Using the field context below from Acumatica screen {screenId}, suggest how to add this field to a Generic Inquiry, including the DAC, join hints and any caveats.' },
  { id: 'plain-english', name: 'Plain English', text: 'Explain in plain, non-technical English what the following Acumatica field is and what changing it would affect.' }
];
export function fillPrompt(text: string, context: Record<string, string>): string {
  const allowed = new Set(['screenId', 'screenName', 'ui', 'environment', 'url']);
  return text.replace(/\{([^{}]+)\}/g, (match, key: string) => allowed.has(key) && Object.hasOwn(context, key) ? context[key] : match);
}
export async function copyForAI(text: string, page: PageContext): Promise<string> {
  const settings = await chrome.storage.local.get(['aiPrompt', 'environmentProfiles']);
  const profile = classifyEnvironment(page.url, (settings.environmentProfiles || []) as EnvironmentProfile[]);
  const prompt = fillPrompt(settings.aiPrompt ?? PROMPT_PRESETS[0].text, {
    screenId: page.screenId.value || 'Not exposed by this UI', screenName: page.screenName.value || 'Not exposed by this UI',
    ui: page.ui, environment: profile?.name || 'UNCLASSIFIED', url: buildSafeScreenLink(page, false)
  });
  return prompt + '\n\n' + text;
}
