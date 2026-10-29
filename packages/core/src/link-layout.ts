import { SCREEN_ID } from './screens';

/** One saved Links entry: a built-in link by its ID, or the user's own screen link. */
export interface LinkEntry { id: string; hidden?: boolean; label?: string; screenId?: string }
export const CUSTOM_LINK_PREFIX = 'custom:';
export const MAX_LINK_LABEL = 60;

export const isCustomLink = (entry: Pick<LinkEntry, 'id'>) => entry.id.startsWith(CUSTOM_LINK_PREFIX);

function validCustom(entry: LinkEntry): boolean {
  return isCustomLink(entry) && typeof entry.label === 'string' && entry.label.trim().length > 0
    && entry.label.length <= MAX_LINK_LABEL && typeof entry.screenId === 'string' && SCREEN_ID.test(entry.screenId);
}

/**
 * The saved order with unknown and malformed entries dropped and duplicates removed. Built-in links the saved
 * layout does not mention, such as ones added by a later toolkit version, follow in their default order.
 */
export function resolveLinkLayout(saved: unknown, builtinIds: readonly string[]): LinkEntry[] {
  const builtins = new Set(builtinIds), seen = new Set<string>(), layout: LinkEntry[] = [];
  for (const item of Array.isArray(saved) ? saved : []) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || seen.has(item.id)) continue;
    const entry = item as LinkEntry;
    if (builtins.has(entry.id)) layout.push(entry.hidden === true ? { id: entry.id, hidden: true } : { id: entry.id });
    else if (validCustom(entry)) layout.push({ id: entry.id, label: entry.label!.trim(), screenId: entry.screenId!.toUpperCase(), ...(entry.hidden === true ? { hidden: true } : {}) });
    else continue;
    seen.add(entry.id);
  }
  for (const id of builtinIds) if (!seen.has(id)) layout.push({ id });
  return layout;
}

/** Moves a link one place up (-1) or down (1); an end link stays where it is. */
export function moveLink(layout: LinkEntry[], id: string, offset: -1 | 1): LinkEntry[] {
  const next = [...layout], from = next.findIndex(entry => entry.id === id), to = from + offset;
  if (from < 0 || to < 0 || to >= next.length) return layout;
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function setLinkHidden(layout: LinkEntry[], id: string, hidden: boolean): LinkEntry[] {
  return layout.map(entry => {
    if (entry.id !== id) return entry;
    const { hidden: _removed, ...rest } = entry;
    return hidden ? { ...rest, hidden: true } : rest;
  });
}

/** Adds the user's own screen link at the end, or throws a message suitable for the panel's status line. */
export function addCustomLink(layout: LinkEntry[], label: string, screenId: string, id: string): LinkEntry[] {
  const name = label.trim(), screen = screenId.trim().toUpperCase();
  if (!name) throw new Error('Enter a label for the link.');
  if (name.length > MAX_LINK_LABEL) throw new Error(`Keep the label to ${MAX_LINK_LABEL} characters.`);
  if (!SCREEN_ID.test(screen)) throw new Error('Enter a Screen ID such as SO301000: two letters, four digits, then two letters or digits.');
  return [...layout, { id: `${CUSTOM_LINK_PREFIX}${id}`, label: name, screenId: screen }];
}

/** Default order and visibility for every built-in link; the user's own links are kept, shown, at the end. */
export function resetLinkLayout(layout: LinkEntry[], builtinIds: readonly string[]): LinkEntry[] {
  return [...builtinIds.map(id => ({ id })), ...layout.filter(isCustomLink).map(entry => setLinkHidden([entry], entry.id, false)[0])];
}

/** Removes the user's own link; built-in links can only be hidden. */
export function removeCustomLink(layout: LinkEntry[], id: string): LinkEntry[] {
  return layout.filter(entry => entry.id !== id || !isCustomLink(entry));
}
