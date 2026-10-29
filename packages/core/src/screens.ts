// Acumatica Screen IDs are two letters, four digits and two letters or digits: SO301000, the
// standard SO4010SP, or a customization's FS3001PL (observed on a live 2026 R1 site).
export const SCREEN_ID_BODY = '[A-Z]{2}[0-9]{4}[0-9A-Z]{2}';
export const SCREEN_ID = new RegExp(`^${SCREEN_ID_BODY}$`, 'i');
