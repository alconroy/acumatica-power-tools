// Shared light/dark preference for Options and the panel. 'system' follows prefers-color-scheme.
export type Theme = 'system' | 'light' | 'dark';
export function normalizeTheme(value: unknown): Theme { return value === 'light' || value === 'dark' ? value : 'system'; }
export function applyTheme(value: unknown): Theme { const theme = normalizeTheme(value); document.documentElement.dataset.theme = theme; return theme; }
export function watchTheme(onChange?: (theme: Theme) => void) {
  applyTheme('system');
  try {
    // Apply first: `onChange?.(applyTheme(...))` would skip applyTheme when there is no callback.
    void Promise.resolve(chrome.storage.local.get('theme')).then(settings => { const theme = applyTheme(settings?.theme); onChange?.(theme); }).catch(() => undefined);
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area !== 'local' || !changes.theme) return;
      const theme = applyTheme(changes.theme.newValue); onChange?.(theme);
    });
  } catch { /* storage unavailable (tests, restricted contexts): stay on system theme */ }
}
