import { affiliations, socialClasses } from './data';

// canonical stable ordering for affiliations and social classes (alphabetical)
export const canonicalOrderAffiliations = [...affiliations].sort((a, b) => a.localeCompare(b));
export const canonicalOrderSocial = [...socialClasses].sort((a, b) => a.localeCompare(b));

// Preferred ordering for social classes in the legend (top -> bottom)
export const SOCIAL_PREFERRED_LEGEND_ORDER = ['Ruler', 'Noble', 'Notable', 'Commoner'];

// --- Customization: color and image mappings ---
// Affiliation colors
export const CUSTOM_COLORS_AFF: Record<string, string> = {
  'Ayrin': '#b10202',
  'Sabr': '#5a3286',
  'Stout': '#d4edbc',
  'Farring': '#bfe0f6',
  'Wildhart': '#753800',
  'Nightlocke': '#11734b',
  'Rivertal': '#0a53a8',
  'Wanderer': '#e5e5e5'
};
// Social class colors
export const CUSTOM_COLORS_SOC: Record<string, string> = {
  'Commoner': '#11734b',
  'Notable': '#d4edbc',
  'Noble': '#473821',
  'Ruler': '#b10202'
};

// Legend image paths for affiliations.
export const LEGEND_IMAGE_PATHS: Record<string, string> = {
  'Ayrin': '../images/ayrin.png',
  'Sabr': '../images/sabr.png',
  'Stout': '../images/stout.png',
  'Farring': '../images/farring.png',
  'Wildhart': '../images/wildhart.png',
  'Nightlocke': '../images/nightlocke.png',
  'Rivertal': '../images/rivertal.png',
  'Wanderer': '../images/wanderer.png'
};

export function colorOf(key: string, fallback: (k: string) => string) {
  return CUSTOM_COLORS_AFF[key] || CUSTOM_COLORS_SOC[key] || fallback(key);
}

// Backdrop colors (used for actual line strokes and data-point fills).
export const BACKDROP_COLORS: Record<string, string> = {
  'Ayrin': '#ffcfc9',
  'Sabr': '#e6cff2',
  'Stout': '#4ba07d',
  'Farring': '#4b7cb4',
  'Wildhart': '#ffc8aa',
  'Nightlocke': '#d4edbc',
  'Rivertal': '#bfe1f6',
  'Wanderer': '#3d3d3d',
  'Ruler': '#ffcfc9',
  'Noble': '#ffe5a0',
  'Notable': '#11734b',
  'Commoner': '#d4edbc'
};

export function backdropOf(key: string) {
  return BACKDROP_COLORS[key] || key;
}

export default {};
