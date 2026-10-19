import type { StateCreator } from 'zustand';
import { loadBundledFont } from '../fonts';
import { readBool, readNumber, readString, save } from './storage';
import type { AppStore } from './index';

// Preferencias del usuario: se guardan en localStorage y, las visuales, se aplican al documento

export type Theme = 'dark' | 'light' | 'system';

// Tamaño de la fuente del editor y la vista de lectura (px); se aplica con la variable CSS --font-text-size
export const DEFAULT_FONT_SIZE = 15;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 30;

// Fuentes de la interfaz, del texto de las notas y monoespaciada (código). Vacío = la predeterminada;
// se aplican con las variables CSS --font-interface, --font-text y --font-monospace
export type FontKind = 'interface' | 'text' | 'monospace';
export type Fonts = Record<FontKind, string>;

export interface PrefsSlice {
  hiddenFolders: string;
  setHiddenFolders: (value: string) => void;
  hiddenExtensions: string;
  setHiddenExtensions: (value: string) => void;
  defaultEditMode: boolean;
  setDefaultEditMode: (mode: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
  fonts: Fonts;
  setFont: (kind: FontKind, name: string) => void;
  quickFontSize: boolean;
  setQuickFontSize: (enabled: boolean) => void;
  showInlineTitle: boolean;
  setShowInlineTitle: (show: boolean) => void;
  showLineNumbers: boolean;
  setShowLineNumbers: (show: boolean) => void;
  readableLineLength: boolean;
  setReadableLineLength: (enabled: boolean) => void;
  showTabHeader: boolean;
  setShowTabHeader: (show: boolean) => void;
  showRibbon: boolean;
  setShowRibbon: (show: boolean) => void;
  pdfViewer: boolean;
  setPdfViewer: (enabled: boolean) => void;
}

const KEYS = {
  hiddenFolders: 'hiddenFolders',
  hiddenExtensions: 'hiddenExtensions',
  defaultMode: 'defaultNoteMode',
  // Debe coincidir con el script en línea de index.html, que aplica el tema antes de pintar
  theme: 'theme',
  fontSize: 'fontSize',
  // Ctrl + rueda del ratón (o pellizcar en el trackpad) sobre la nota cambia el tamaño de fuente
  quickFontSize: 'quickFontSize',
  inlineTitle: 'showInlineTitle',
  lineNumbers: 'showLineNumbers',
  readableLine: 'readableLineLength',
  tabHeader: 'showTabHeader',
  ribbon: 'showRibbon',
  // Abrir los PDF con el visor nativo del navegador en vez de ofrecer descargarlos
  pdfViewer: 'pdfViewer',
};

const FONT_KEYS: Record<FontKind, string> = {
  interface: 'fontInterface',
  text: 'fontText',
  monospace: 'fontMonospace',
};
// Si la fuente elegida no está instalada, el navegador pasa a la predeterminada
const FONT_FALLBACKS: Record<FontKind, string> = {
  interface: 'var(--font-interface-default)',
  text: 'var(--font-interface)',
  monospace: 'var(--font-monospace-default)',
};
const cleanFont = (name: string) => name.replace(/["\\;{}]/g, '').trim();

const clampFontSize = (size: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const applyTheme = (theme: Theme) => {
  const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  // Color de la barra del navegador en el móvil, a juego con la cabecera (--background-secondary)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#f6f6f6' : '#1e1e1e');
};

const applyFontSize = (size: number) => document.documentElement.style.setProperty('--font-text-size', `${size}px`);

const applyFont = (kind: FontKind, name: string) => {
  const style = document.documentElement.style;
  if (name) style.setProperty(`--font-${kind}`, `"${name}", ${FONT_FALLBACKS[kind]}`);
  else style.removeProperty(`--font-${kind}`);
};

// Longitud de línea legible: limita el ancho del texto de la nota con la variable CSS --line-width
const applyReadableLineLength = (enabled: boolean) =>
  document.documentElement.style.setProperty('--line-width', enabled ? '720px' : 'none');

const readTheme = (): Theme => {
  const value = readString(KEYS.theme);
  return value === 'light' || value === 'system' ? value : 'dark';
};

const readFonts = () =>
  (Object.keys(FONT_KEYS) as FontKind[]).reduce((fonts, kind) => {
    fonts[kind] = cleanFont(readString(FONT_KEYS[kind]));
    return fonts;
  }, {} as Fonts);

// Valor inicial del modo de las notas (también lo usa `editMode` en el slice de documentos)
export const initialDefaultEditMode = readString(KEYS.defaultMode) !== 'view';

export const createPrefsSlice: StateCreator<AppStore, [], [], PrefsSlice> = (set, get) => {
  const theme = readTheme();
  const fontSize = readNumber(KEYS.fontSize, DEFAULT_FONT_SIZE, clampFontSize);
  const fonts = readFonts();
  const readableLineLength = readBool(KEYS.readableLine, true);

  // Aplicar al documento las preferencias guardadas de una visita anterior
  applyTheme(theme);
  // En modo "sistema", seguir los cambios del sistema operativo en caliente
  systemDark.addEventListener('change', () => applyTheme(get().theme));
  applyFontSize(fontSize);
  (Object.keys(fonts) as FontKind[]).forEach((kind) => {
    applyFont(kind, fonts[kind]);
    // La fuente guardada también se carga bajo demanda al arrancar
    void loadBundledFont(fonts[kind]);
  });
  applyReadableLineLength(readableLineLength);

  // Setter de una preferencia de sí/no que solo se guarda
  const boolPref = (field: keyof PrefsSlice, key: string) => (value: boolean) => {
    save(key, value);
    set({ [field]: value } as Partial<PrefsSlice>);
  };

  return {
    hiddenFolders: readString(KEYS.hiddenFolders),
    setHiddenFolders: (value) => {
      save(KEYS.hiddenFolders, value);
      set({ hiddenFolders: value });
    },
    hiddenExtensions: readString(KEYS.hiddenExtensions),
    setHiddenExtensions: (value) => {
      save(KEYS.hiddenExtensions, value);
      set({ hiddenExtensions: value });
    },
    defaultEditMode: initialDefaultEditMode,
    setDefaultEditMode: (mode) => {
      save(KEYS.defaultMode, mode ? 'edit' : 'view');
      set({ defaultEditMode: mode });
    },
    theme,
    setTheme: (value) => {
      save(KEYS.theme, value);
      applyTheme(value);
      set({ theme: value });
    },
    fontSize,
    setFontSize: (size) => {
      const value = clampFontSize(size);
      save(KEYS.fontSize, value);
      applyFontSize(value);
      set({ fontSize: value });
    },
    fonts,
    setFont: (kind, name) => {
      const value = cleanFont(name);
      save(FONT_KEYS[kind], value || null);
      applyFont(kind, value);
      // Las fuentes incluidas se cargan bajo demanda: solo las variantes de la familia elegida
      void loadBundledFont(value);
      set((state) => ({ fonts: { ...state.fonts, [kind]: value } }));
    },
    quickFontSize: readBool(KEYS.quickFontSize, false),
    setQuickFontSize: boolPref('quickFontSize', KEYS.quickFontSize),
    showInlineTitle: readBool(KEYS.inlineTitle, true),
    setShowInlineTitle: boolPref('showInlineTitle', KEYS.inlineTitle),
    showLineNumbers: readBool(KEYS.lineNumbers, false),
    setShowLineNumbers: boolPref('showLineNumbers', KEYS.lineNumbers),
    readableLineLength,
    setReadableLineLength: (enabled) => {
      save(KEYS.readableLine, enabled);
      applyReadableLineLength(enabled);
      set({ readableLineLength: enabled });
    },
    showTabHeader: readBool(KEYS.tabHeader, true),
    setShowTabHeader: boolPref('showTabHeader', KEYS.tabHeader),
    showRibbon: readBool(KEYS.ribbon, true),
    setShowRibbon: boolPref('showRibbon', KEYS.ribbon),
    pdfViewer: readBool(KEYS.pdfViewer, false),
    setPdfViewer: boolPref('pdfViewer', KEYS.pdfViewer),
  };
};
