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

/** Walnut, for the classic felt and green cloth. */
const WALNUT = {
  rim: '#3b2414',
  rail: ['#6b4528', '#4a2d18', '#2e1b0e'],
  shine: 'rgba(255,220,180,0.3)',
  tab: '#4a2d18',
  tabOn: '#6b4528',
  tabPressed: '#3a2212',
  ink: '255,240,220',
} as const;

export const TABLE_THEMES: Record<string, TableTheme> = {
  // Graphite with cool steel: the default.
  charcoal: {
    name: 'Charcoal',
    cloth: '#2a2d33',
    outside: '#121316',
    rim: '#1b1d21',
    rail: ['#4b5059', '#33373e', '#1d1f23'],
    shine: 'rgba(210,222,240,0.28)',
    tab: '#33373e',
    tabOn: '#4b5059',
    tabPressed: '#26292e',
    ink: '232,238,246',
  },
  classic: { name: 'Classic Felt', outside: '#0d2a1c', ...WALNUT, rail: [...WALNUT.rail] },
  green: { name: 'Green', cloth: '#1f4d33', outside: '#0d2318', ...WALNUT, rail: [...WALNUT.rail] },
  // Navy with slate blue.
  blue: {
    name: 'Blue',
    cloth: '#1d3a5c',
    outside: '#0b1726',
    rim: '#14263a',
    rail: ['#3d5a7a', '#28415d', '#152538'],
    shine: 'rgba(200,225,255,0.28)',
    tab: '#28415d',
    tabOn: '#3d5a7a',
    tabPressed: '#1d3249',
    ink: '228,238,252',
  },
  // Burgundy with mahogany.
  red: {
    name: 'Red',
    cloth: '#6b1e24',
    outside: '#240b0d',
    rim: '#2e1210',
    rail: ['#6a3226', '#4a2019', '#2a110d'],
    shine: 'rgba(255,205,190,0.28)',
    tab: '#4a2019',
    tabOn: '#6a3226',
    tabPressed: '#3a1813',
    ink: '255,236,228',
  },
  // Plum.
  purple: {
    name: 'Purple',
    cloth: '#43295f',
    outside: '#170e22',
    rim: '#241634',
    rail: ['#5c4078', '#402a57', '#24173a'],
    shine: 'rgba(230,210,255,0.28)',
    tab: '#402a57',
    tabOn: '#5c4078',
    tabPressed: '#322046',
    ink: '242,234,252',
  },
  // Sand with light oak.
  tan: {
    name: 'Tan',
    cloth: '#8a6d47',
    outside: '#2e2416',
    rim: '#4e3820',
    rail: ['#a77d4c', '#7d5834', '#4f341e'],
    shine: 'rgba(255,235,200,0.35)',
    tab: '#7d5834',
    tabOn: '#a77d4c',
    tabPressed: '#664628',
    ink: '255,244,226',
  },
};

/**
 * A table's theme, by its `background` key. Tables saved before themes, with none, keep the classic felt they
 * were made with.
 */
export const themeOf = (key: string | undefined): TableTheme => TABLE_THEMES[key ?? 'classic'] ?? TABLE_THEMES.classic;

/** The order they're offered in. */
export const THEME_KEYS = ['charcoal', 'classic', 'green', 'blue', 'red', 'purple', 'tan'];
