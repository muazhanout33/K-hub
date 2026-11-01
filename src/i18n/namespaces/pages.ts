/**
 * PAGES namespace — about, contact, events, membership, advertise,
 * sponsors (+ apply), and shared marketing-page copy.
 * Keep the `en` object and the shape of `ar` identical.
 */
const en = {
  seed: 'Replace this file with the full marketing pages dictionary',
};

export type PagesDict = typeof en;

const ar: PagesDict = {
  seed: 'استبدل هذا الملف بقاموس الصفحات التعريفية الكامل',
};

export const pages = { en, ar };
