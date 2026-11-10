import type { StateCreator } from 'zustand';
import { loadBundledFont } from '../fonts';
import { applyThemeStyle, resolveThemeStyle } from '../themes';
import { refreshWideTables, setWideTables } from '../wideTables';
import { readBool, readNumber, readString, save, synced } from './storage';
import type { AppStore } from './index';

// Preferencias del usuario: se guardan en localStorage y en el servidor (las comparten todos los
// dispositivos, ver prefsSync.ts) y, las visuales, se aplican al documento

export type Theme = 'dark' | 'light' | 'system';

// Tamaño de la fuente del editor y la vista de lectura (px); se aplica con la variable CSS --font-text-size
export const DEFAULT_FONT_SIZE = 15;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 30;

// Ancho máximo de la columna del texto (px) cuando la longitud de línea legible está activa
export const DEFAULT_LINE_WIDTH = 720;
export const MIN_LINE_WIDTH = 480;
export const MAX_LINE_WIDTH = 1200;

// Fuentes de la interfaz, del texto de las notas y monoespaciada (código). Vacío = la predeterminada;
// se aplican con las variables CSS --font-interface, --font-text y --font-monospace
// Formato al que se convierten las imágenes pegadas o arrastradas al editor ('original' = sin convertir)
export type ImageFormat = 'original' | 'webp' | 'jpg';
export const DEFAULT_IMAGE_QUALITY = 80;
const clampQuality = (q: number) => Math.min(100, Math.max(10, Math.round(q)));

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
  // Estilo visual (un .css de styles/themes/, ver themes.ts); `theme` elige su variante clara u oscura
  themeStyle: string;
  setThemeStyle: (style: string) => void;
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
  autoPairBrackets: boolean;
  setAutoPairBrackets: (enabled: boolean) => void;
  autoPairMarkdown: boolean;
  setAutoPairMarkdown: (enabled: boolean) => void;
  readableLineLength: boolean;
  setReadableLineLength: (enabled: boolean) => void;
  lineWidth: number;
  setLineWidth: (width: number) => void;
  showTabHeader: boolean;
  setShowTabHeader: (show: boolean) => void;
  showRibbon: boolean;
  setShowRibbon: (show: boolean) => void;
  pdfViewer: boolean;
  setPdfViewer: (enabled: boolean) => void;
  // Al entrar, volver a abrir las pestañas que estaban abiertas (ver session.ts)
  restoreTabs: boolean;
  setRestoreTabs: (enabled: boolean) => void;
  imageFormat: ImageFormat;
  setImageFormat: (format: ImageFormat) => void;
  imageQuality: number;
  setImageQuality: (quality: number) => void;
  // Nombres de columna (separados por comas) que se numeran solas en las tablas, ver liveTables.ts
  tableNumberColumns: string;
  setTableNumberColumns: (value: string) => void;
  // Ordenar una tabla reordena también las filas del archivo (si no, el orden solo se ve)
  tableSortToFile: boolean;
  setTableSortToFile: (enabled: boolean) => void;
  // La cabecera de las tablas se destaca como título (color de fondo y negrita)
  tableTitleRow: boolean;
  setTableTitleRow: (enabled: boolean) => void;
  tableTitleColor: string;
  setTableTitleColor: (color: string) => void;
  // Contador de filas debajo de cada tabla
  tableShowCount: boolean;
  setTableShowCount: (enabled: boolean) => void;
  // La búsqueda de tablas oculta las filas que no coinciden (si no, solo resalta las celdas)
  tableSearchFilters: boolean;
  setTableSearchFilters: (enabled: boolean) => void;
  // Las tablas usan todo el ancho de la nota; el texto conserva su columna
  tableWide: boolean;
  setTableWide: (enabled: boolean) => void;
  // Vuelve a leer y aplicar todas las preferencias (tras recibir las del servidor)
  reloadPrefs: () => void;
}

const KEYS = {
  hiddenFolders: synced('hiddenFolders'),
  hiddenExtensions: synced('hiddenExtensions'),
  defaultMode: synced('defaultNoteMode'),
  // Debe coincidir con el script en línea de index.html, que aplica el tema antes de pintar
  theme: synced('theme'),
  themeStyle: synced('themeStyle'),
  fontSize: synced('fontSize'),
  // Ctrl + rueda del ratón (o pellizcar en el trackpad) sobre la nota cambia el tamaño de fuente
  quickFontSize: synced('quickFontSize'),
  inlineTitle: synced('showInlineTitle'),
  lineNumbers: synced('showLineNumbers'),
  autoPairBrackets: synced('autoPairBrackets'),
  autoPairMarkdown: synced('autoPairMarkdown'),
  readableLine: synced('readableLineLength'),
  lineWidth: synced('lineWidth'),
  tabHeader: synced('showTabHeader'),
  ribbon: synced('showRibbon'),
  // Abrir los PDF con el visor nativo del navegador en vez de ofrecer descargarlos
  pdfViewer: synced('pdfViewer'),
  restoreTabs: synced('restoreTabs'),
  imageFormat: synced('imageFormat'),
  imageQuality: synced('imageQuality'),
  tableNumberColumns: synced('tableNumberColumns'),
  tableSortToFile: synced('tableSortToFile'),
  tableTitleRow: synced('tableTitleRow'),
  tableTitleColor: synced('tableTitleColor'),
  tableShowCount: synced('tableShowCount'),
  tableSearchFilters: synced('tableSearchFilters'),
  tableWide: synced('tableWide'),
};

const FONT_KEYS: Record<FontKind, string> = {
  interface: synced('fontInterface'),
  text: synced('fontText'),
  monospace: synced('fontMonospace'),
};
// Si la fuente elegida no está instalada, el navegador pasa a la predeterminada
const FONT_FALLBACKS: Record<FontKind, string> = {
  interface: 'var(--font-interface-default)',
  text: 'var(--font-interface)',
  monospace: 'var(--font-monospace-default)',
};
const cleanFont = (name: string) => name.replace(/["\\;{}]/g, '').trim();

const clampFontSize = (size: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
const clampLineWidth = (width: number) =>
  Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, Math.round(width / 10) * 10));

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

// Color de la barra del navegador en el móvil, a juego con la cabecera (--background-secondary del estilo)
const applyThemeColor = () => {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--background-secondary').trim();
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
};

const applyTheme = (theme: Theme) => {
  const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  applyThemeColor();
};

const applyStyle = (style: string) => void applyThemeStyle(style).then(applyThemeColor);

const applyFontSize = (size: number) => document.documentElement.style.setProperty('--font-text-size', `${size}px`);

const applyFont = (kind: FontKind, name: string) => {
  const style = document.documentElement.style;
  if (name) style.setProperty(`--font-${kind}`, `"${name}", ${FONT_FALLBACKS[kind]}`);
  else style.removeProperty(`--font-${kind}`);
};

// Longitud de línea legible: limita el ancho del texto de la nota con la variable CSS --line-width.
// Las tablas de ancho completo se miden contra el área, no contra esta variable: hay que recolocarlas
const applyReadableLineLength = (enabled: boolean, width: number) => {
  document.documentElement.style.setProperty('--line-width', enabled ? `${width}px` : 'none');
  refreshWideTables();
};

const readImageFormat = (): ImageFormat => {
  const value = readString(KEYS.imageFormat);
  return value === 'webp' || value === 'jpg' ? value : 'original';
};

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

// Lo guardado (en este navegador, o lo último recibido del servidor)
const readPrefs = () => ({
  hiddenFolders: readString(KEYS.hiddenFolders),
  hiddenExtensions: readString(KEYS.hiddenExtensions),
  defaultEditMode: readString(KEYS.defaultMode) !== 'view',
  theme: readTheme(),
  themeStyle: resolveThemeStyle(readString(KEYS.themeStyle)),
  fontSize: readNumber(KEYS.fontSize, DEFAULT_FONT_SIZE, clampFontSize),
  fonts: readFonts(),
  quickFontSize: readBool(KEYS.quickFontSize, false),
  showInlineTitle: readBool(KEYS.inlineTitle, true),
  showLineNumbers: readBool(KEYS.lineNumbers, false),
  autoPairBrackets: readBool(KEYS.autoPairBrackets, true),
  autoPairMarkdown: readBool(KEYS.autoPairMarkdown, true),
  readableLineLength: readBool(KEYS.readableLine, true),
  lineWidth: readNumber(KEYS.lineWidth, DEFAULT_LINE_WIDTH, clampLineWidth),
  showTabHeader: readBool(KEYS.tabHeader, true),
  showRibbon: readBool(KEYS.ribbon, true),
  pdfViewer: readBool(KEYS.pdfViewer, false),
  restoreTabs: readBool(KEYS.restoreTabs, false),
  imageFormat: readImageFormat(),
  imageQuality: readNumber(KEYS.imageQuality, DEFAULT_IMAGE_QUALITY, clampQuality),
  tableNumberColumns: readString(KEYS.tableNumberColumns),
  tableSortToFile: readBool(KEYS.tableSortToFile, true),
  tableTitleRow: readBool(KEYS.tableTitleRow, false),
  tableTitleColor: readColorFromStorage(),
  tableShowCount: readBool(KEYS.tableShowCount, true),
  tableSearchFilters: readBool(KEYS.tableSearchFilters, false),
  tableWide: readBool(KEYS.tableWide, false),
});

// Color de la cabecera-título de las tablas: #rrggbb válido o el predeterminado
export const DEFAULT_TABLE_TITLE_COLOR = '#3b82f6';
const readColor = (value: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_TABLE_TITLE_COLOR);
const readColorFromStorage = () => readColor(readString(KEYS.tableTitleColor));

// Marca la cabecera de las tablas como título (lo lee la hoja de estilos con data-table-title)
const applyTableTitle = (enabled: boolean, color: string) => {
  document.documentElement.dataset.tableTitle = enabled ? 'on' : 'off';
  document.documentElement.style.setProperty('--table-title-color', color);
};

// Muestra u oculta el contador de filas (lo lee la hoja de estilos con data-table-count)
const applyTableCount = (enabled: boolean) => {
  document.documentElement.dataset.tableCount = enabled ? 'on' : 'off';
};

// Aplicar al documento las preferencias visuales
const applyPrefs = ({
  theme,
  themeStyle,
  fontSize,
  fonts,
  readableLineLength,
  lineWidth,
  tableTitleRow,
  tableTitleColor,
  tableShowCount,
  tableWide,
}: ReturnType<typeof readPrefs>) => {
  applyTableTitle(tableTitleRow, tableTitleColor);
  applyTableCount(tableShowCount);
  applyTheme(theme);
  applyStyle(themeStyle);
  applyFontSize(fontSize);
  (Object.keys(fonts) as FontKind[]).forEach((kind) => {
    applyFont(kind, fonts[kind]);
    // La fuente guardada también se carga bajo demanda
    void loadBundledFont(fonts[kind]);
  });
  applyReadableLineLength(readableLineLength, lineWidth);
  setWideTables(tableWide);
};

export const createPrefsSlice: StateCreator<AppStore, [], [], PrefsSlice> = (set, get) => {
  const initial = readPrefs();
  // Aplicar al documento las preferencias guardadas de una visita anterior
  applyPrefs(initial);
  // En modo "sistema", seguir los cambios del sistema operativo en caliente
  systemDark.addEventListener('change', () => applyTheme(get().theme));

  // Setter de una preferencia de sí/no que solo se guarda
  const boolPref = (field: keyof PrefsSlice, key: string) => (value: boolean) => {
    save(key, value);
    set({ [field]: value } as Partial<PrefsSlice>);
  };

  return {
    ...initial,
    reloadPrefs: () => {
      const prefs = readPrefs();
      applyPrefs(prefs);
      set(prefs);
    },
    setHiddenFolders: (value) => {
      save(KEYS.hiddenFolders, value);
      set({ hiddenFolders: value });
    },
    setHiddenExtensions: (value) => {
      save(KEYS.hiddenExtensions, value);
      set({ hiddenExtensions: value });
    },
    setTableNumberColumns: (value) => {
      save(KEYS.tableNumberColumns, value);
      set({ tableNumberColumns: value });
    },
    setTableSortToFile: boolPref('tableSortToFile', KEYS.tableSortToFile),
    setTableSearchFilters: boolPref('tableSearchFilters', KEYS.tableSearchFilters),
    setTableWide: (enabled) => {
      save(KEYS.tableWide, enabled);
      setWideTables(enabled);
      set({ tableWide: enabled });
    },
    setTableShowCount: (enabled) => {
      save(KEYS.tableShowCount, enabled);
      applyTableCount(enabled);
      set({ tableShowCount: enabled });
    },
    setTableTitleRow: (enabled) => {
      save(KEYS.tableTitleRow, enabled);
      applyTableTitle(enabled, get().tableTitleColor);
      set({ tableTitleRow: enabled });
    },
    setTableTitleColor: (color) => {
      const value = readColor(color);
      save(KEYS.tableTitleColor, value);
      applyTableTitle(get().tableTitleRow, value);
      set({ tableTitleColor: value });
    },
    setDefaultEditMode: (mode) => {
      save(KEYS.defaultMode, mode ? 'edit' : 'view');
      set({ defaultEditMode: mode });
    },
    setTheme: (value) => {
      save(KEYS.theme, value);
      applyTheme(value);
      set({ theme: value });
    },
    setThemeStyle: (style) => {
      const value = resolveThemeStyle(style);
      save(KEYS.themeStyle, value);
      applyStyle(value);
      set({ themeStyle: value });
    },
    setFontSize: (size) => {
      const value = clampFontSize(size);
      save(KEYS.fontSize, value);
      applyFontSize(value);
      set({ fontSize: value });
    },
    setFont: (kind, name) => {
      const value = cleanFont(name);
      save(FONT_KEYS[kind], value || null);
      applyFont(kind, value);
      // Las fuentes incluidas se cargan bajo demanda: solo las variantes de la familia elegida
      void loadBundledFont(value);
      set((state) => ({ fonts: { ...state.fonts, [kind]: value } }));
    },
    setQuickFontSize: boolPref('quickFontSize', KEYS.quickFontSize),
    setShowInlineTitle: boolPref('showInlineTitle', KEYS.inlineTitle),
    setShowLineNumbers: boolPref('showLineNumbers', KEYS.lineNumbers),
    setAutoPairBrackets: boolPref('autoPairBrackets', KEYS.autoPairBrackets),
    setAutoPairMarkdown: boolPref('autoPairMarkdown', KEYS.autoPairMarkdown),
    setReadableLineLength: (enabled) => {
      save(KEYS.readableLine, enabled);
      applyReadableLineLength(enabled, get().lineWidth);
      set({ readableLineLength: enabled });
    },
    setLineWidth: (width) => {
      const value = clampLineWidth(width);
      save(KEYS.lineWidth, value);
      applyReadableLineLength(get().readableLineLength, value);
      set({ lineWidth: value });
    },
    setShowTabHeader: boolPref('showTabHeader', KEYS.tabHeader),
    setShowRibbon: boolPref('showRibbon', KEYS.ribbon),
    setPdfViewer: boolPref('pdfViewer', KEYS.pdfViewer),
    setRestoreTabs: boolPref('restoreTabs', KEYS.restoreTabs),
    setImageFormat: (format) => {
      save(KEYS.imageFormat, format === 'original' ? null : format);
      set({ imageFormat: format });
    },
    setImageQuality: (quality) => {
      const value = clampQuality(quality);
      save(KEYS.imageQuality, value);
      set({ imageQuality: value });
    },
  };
};
