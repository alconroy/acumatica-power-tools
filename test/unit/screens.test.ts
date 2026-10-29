import { expect, it } from 'vitest';
import { SCREEN_ID } from '../../packages/core/src/screens';

it('accepts Acumatica Screen IDs ending in letters and rejects other eight-character words', () => {
  for (const id of ['SO301000', 'so4010sp', 'FS3001PL']) expect(SCREEN_ID.test(id)).toBe(true);
  for (const id of ['Messages', 'Frames12', 'SO30100', '12345678', 'SOAB01PL', 'SO301000&OrderNbr=secret']) expect(SCREEN_ID.test(id)).toBe(false);
});
