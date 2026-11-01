/**
 * PROFILE namespace — /profile account page + settings.
 * Keep the `en` object and the shape of `ar` identical.
 */
const en = {
  seed: 'Replace this file with the full profile dictionary',
};

export type ProfileDict = typeof en;

const ar: ProfileDict = {
  seed: 'استبدل هذا الملف بقاموس الملف الشخصي الكامل',
};

export const profile = { en, ar };
