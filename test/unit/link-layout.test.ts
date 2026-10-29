import { expect, it } from 'vitest';
import { addCustomLink, moveLink, removeCustomLink, resetLinkLayout, resolveLinkLayout, setLinkHidden } from '../../packages/core/src/link-layout';

const BUILTINS = ['SM208000', 'trace', 'copy-link'];

it('keeps the saved order and appends built-in links added by a later version', () => {
  const layout = resolveLinkLayout([{ id: 'trace', hidden: true }, { id: 'custom:a', label: ' Sales ', screenId: 'so301000' }, { id: 'SM208000' }], BUILTINS);
  expect(layout).toEqual([{ id: 'trace', hidden: true }, { id: 'custom:a', label: 'Sales', screenId: 'SO301000' }, { id: 'SM208000' }, { id: 'copy-link' }]);
});

it('drops unknown, duplicate and malformed saved entries', () => {
  const saved = [{ id: 'retired' }, { id: 'trace' }, { id: 'trace', hidden: true }, null, 'trace', { id: 'custom:x', label: 'Bad', screenId: 'Messages' }, { id: 'custom:y', label: '', screenId: 'SO301000' }, { id: 'custom:z', label: 'x'.repeat(61), screenId: 'SO301000' }];
  expect(resolveLinkLayout(saved, BUILTINS)).toEqual([{ id: 'trace' }, { id: 'SM208000' }, { id: 'copy-link' }]);
  expect(resolveLinkLayout('not a layout', BUILTINS)).toEqual(BUILTINS.map(id => ({ id })));
});

it('moves, hides and shows links without changing the others', () => {
  const layout = resolveLinkLayout([], BUILTINS);
  expect(moveLink(layout, 'trace', -1).map(entry => entry.id)).toEqual(['trace', 'SM208000', 'copy-link']);
  expect(moveLink(layout, 'SM208000', -1)).toBe(layout);
  expect(moveLink(layout, 'copy-link', 1)).toBe(layout);
  const hidden = setLinkHidden(layout, 'trace', true);
  expect(hidden[1]).toEqual({ id: 'trace', hidden: true });
  expect(setLinkHidden(hidden, 'trace', false)[1]).toEqual({ id: 'trace' });
});

it('adds only labelled links with a valid Screen ID, and removes only the user’s own links', () => {
  const layout = resolveLinkLayout([], BUILTINS);
  const added = addCustomLink(layout, '  Service Orders ', 'fs3001pl', 'n1');
  expect(added.at(-1)).toEqual({ id: 'custom:n1', label: 'Service Orders', screenId: 'FS3001PL' });
  expect(() => addCustomLink(layout, ' ', 'SO301000', 'n2')).toThrow('Enter a label');
  expect(() => addCustomLink(layout, 'x'.repeat(61), 'SO301000', 'n2')).toThrow('60 characters');
  for (const id of ['Messages', 'SO30100', 'SO301000&OrderNbr=1', 'https://example.com']) expect(() => addCustomLink(layout, 'Bad', id, 'n2')).toThrow('Screen ID');
  expect(removeCustomLink(added, 'custom:n1')).toEqual(layout);
  expect(removeCustomLink(added, 'trace')).toEqual(added);
});

it('restores the default built-in order and keeps the user’s own links, shown, at the end', () => {
  const layout = [{ id: 'custom:a', label: 'Mine', screenId: 'SO301000', hidden: true }, { id: 'copy-link', hidden: true }, { id: 'trace' }, { id: 'SM208000' }];
  expect(resetLinkLayout(layout, BUILTINS)).toEqual([{ id: 'SM208000' }, { id: 'trace' }, { id: 'copy-link' }, { id: 'custom:a', label: 'Mine', screenId: 'SO301000' }]);
});
