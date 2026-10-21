export type ThemeId = 'paper' | 'sepia' | 'mint' | 'slate' | 'night';
export type FontId = 'original' | 'lexend' | 'atkinson' | 'serif';
export type Mode = 'reader' | 'flow';

export interface Settings {
  defaultMode: Mode; // what the toolbar icon does
  selectionToolbar: boolean; // show the focus toolbar on text selection on every site (needs host permission)
  flowUnit: 'sentence' | 'paragraph'; // what flow mode steps through
  theme: ThemeId;
  font: FontId;
  fontSize: number; // px
  lineHeight: number; // unitless
  letterSpacing: number; // px
  maxWidth: number; // px, width of the text column
  bionic: boolean;
  bionicRatio: number; // share of each word in bold, 0.2-0.8
  spotlight: boolean; // dim everything except the current paragraph
  spotlightDim: number; // opacity of the other paragraphs, 0-1
  pace: number; // 1-100, mapped to characters per second
  pauseAtPunctuation: boolean;
}

export const DEFAULTS: Settings = {
  defaultMode: 'flow',
  selectionToolbar: false,
  flowUnit: 'sentence',
  theme: 'paper',
  font: 'lexend',
  fontSize: 21,
  lineHeight: 1.8,
  letterSpacing: 0.3,
  maxWidth: 720,
  bionic: false,
  bionicRatio: 0.4,
  spotlight: false,
  spotlightDim: 0.25,
  pace: 35,
  pauseAtPunctuation: true,
};

export const THEMES: Record<ThemeId, { bg: string; fg: string; accent: string; mark: string }> = {
  paper: { bg: '#fbfaf7', fg: '#1f2328', accent: '#2f6feb', mark: '#fff1a8' },
  sepia: { bg: '#f4ecd8', fg: '#3b2f1e', accent: '#9a5b13', mark: '#f2d48a' },
  mint: { bg: '#eef7f1', fg: '#17301f', accent: '#1f7a4d', mark: '#c8ecd4' },
  slate: { bg: '#2b3038', fg: '#dfe3e8', accent: '#7cb7ff', mark: '#4a5566' },
  night: { bg: '#121212', fg: '#c9c9c9', accent: '#f0b44c', mark: '#3a3320' },
};

export const FONTS: Record<FontId, string> = {
  original: 'inherit',
  lexend: "'Lexend Variable', system-ui, sans-serif",
  atkinson: "'Atkinson Hyperlegible', system-ui, sans-serif",
  serif: "Charter, 'Iowan Old Style', Georgia, serif",
};

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.sync.get(KEY))[KEY] as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.sync.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[KEY]) cb({ ...DEFAULTS, ...(changes[KEY].newValue as Partial<Settings>) });
  });
}
