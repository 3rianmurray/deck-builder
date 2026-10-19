// Table themes: each cloth comes with a hand tray, tabs and rim to go with it. New tables start in charcoal
// (set in newSandbox).

export interface TableTheme {
  name: string;
  /** The cloth's color, under a light weave; none for the classic felt (the full felt texture). */
  cloth?: string;
  /** Around the table, past its rim. */
  outside: string;
  /** The table's raised rim. */
  rim: string;
  /** The hand tray, light (its top edge) to dark (the bottom of the screen). */
  rail: [string, string, string];
  /** The light along the tray's and the tabs' top edges. */
  shine: string;
  /** The hands' tabs: as they are, the chosen one, and pressed. */
  tab: string;
  tabOn: string;
  tabPressed: string;
  /** Writing on the tray: the tabs' names and the empty hand's hint. */
  ink: string;
}

/**
 * A tray's material: light to dark, its top edge's shine, and the writing on it. Each theme's tray is a different
 * material from its cloth, one that goes with it (as a leather rail goes with a card table's baize), not the
 * same color again. The table's rim is the same material.
 */
function tray(light: string, mid: string, dark: string, deep: string, shine: string, ink: string) {
  return { rim: dark, rail: [light, mid, dark] as [string, string, string], shine, tab: mid, tabOn: light, tabPressed: deep, ink };
}

/** Walnut. */
const WALNUT = tray('#6b4528', '#4a2d18', '#2e1b0e', '#3a2212', 'rgba(255,220,180,0.3)', '255,240,220');
/** Cognac leather. */
const COGNAC = tray('#9a6238', '#744524', '#432714', '#5a361c', 'rgba(255,215,170,0.35)', '255,240,222');
/** Honey oak. */
const OAK = tray('#ad8450', '#835f35', '#4f381f', '#6a4c2a', 'rgba(255,236,196,0.38)', '255,246,228');
/** Camel leather. */
const CAMEL = tray('#b48d5c', '#8a693f', '#574024', '#735733', 'rgba(255,238,205,0.38)', '255,247,232');
/** Black lacquer with a gold edge. */
const EBONY = tray('#403b39', '#2a2625', '#151312', '#201d1c', 'rgba(230,190,110,0.45)', '245,228,196');
/** Antique brass. */
const BRASS = tray('#9c7c40', '#74592b', '#45341a', '#5e4823', 'rgba(255,232,170,0.42)', '255,246,222');
/** Deep navy. */
const NAVY = tray('#34507a', '#223858', '#121f33', '#1a2b45', 'rgba(205,222,255,0.3)', '232,240,252');

export const TABLE_THEMES: Record<string, TableTheme> = {
  // Charcoal baize on cognac leather: the default.
  charcoal: { name: 'Charcoal', cloth: '#2a2d33', outside: '#121316', ...COGNAC },
  // The felt and walnut the tables have always had.
  classic: { name: 'Classic Felt', outside: '#0d2a1c', ...WALNUT },
  green: { name: 'Green', cloth: '#1f4d33', outside: '#0d2318', ...OAK },
  blue: { name: 'Blue', cloth: '#1d3a5c', outside: '#0b1726', ...CAMEL },
  red: { name: 'Red', cloth: '#6b1e24', outside: '#240b0d', ...EBONY },
  purple: { name: 'Purple', cloth: '#43295f', outside: '#170e22', ...BRASS },
  tan: { name: 'Tan', cloth: '#8a6d47', outside: '#2e2416', ...NAVY },
};

/**
 * A table's theme, by its `background` key. Tables saved before themes, with none, keep the classic felt they
 * were made with.
 */
export const themeOf = (key: string | undefined): TableTheme => TABLE_THEMES[key ?? 'classic'] ?? TABLE_THEMES.classic;

/** The order they're offered in. */
export const THEME_KEYS = ['charcoal', 'classic', 'green', 'blue', 'red', 'purple', 'tan'];
