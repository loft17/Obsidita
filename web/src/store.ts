import { create } from 'zustand';
import { isMobile } from './mobile';

interface TreeItem {
  type: 'folder' | 'file' | 'other';
  path: string;
  name: string;
}

interface Tab {
  path: string;
  name: string;
  isDirty: boolean;
}

// Al guardar, la nota había cambiado en el servidor: `mine` es lo escrito aquí y `theirs` lo del servidor
export interface NoteConflict {
  path: string;
  mine: string;
  theirs: string;
  version: string;
}

interface AppStore {
  // Conflictos pendientes de resolver (se muestran de uno en uno)
  conflicts: NoteConflict[];
  setConflict: (conflict: NoteConflict) => void;
  clearConflict: (path: string) => void;
  hiddenFolders: string;
  setHiddenFolders: (value: string) => void;
  tree: TreeItem[];
  setTree: (tree: TreeItem[]) => void;
  tabs: Tab[];
  addTab: (path: string, name: string) => void;
  openFile: (path: string, name: string) => void;
  renameTab: (oldPath: string, newPath: string) => void;
  removeTab: (path: string) => void;
  activeTab: string | null;
  setActiveTab: (path: string | null) => void;
  setTabDirty: (path: string, isDirty: boolean) => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
  // Editar el archivo como texto plano, sin formato ni panel de propiedades
  rawMode: boolean;
  setRawMode: (raw: boolean) => void;
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
  // Título de la web (lo guarda el servidor); vacío = DEFAULT_SITE_TITLE
  siteTitle: string;
  setSiteTitle: (title: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  collapseAll: () => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarView: SidebarView;
  showSidebarView: (view: SidebarView) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchTag: (tag: string) => void;
}

export type SidebarView = 'files' | 'search' | 'tags' | 'trash';

// true si `path` es `base` o está dentro de la carpeta `base`
export const isUnder = (path: string, base: string) => path === base || path.startsWith(base + '/');

const DEFAULT_MODE_KEY = 'defaultNoteMode';
const initialDefaultEditMode = (() => {
  try {
    return localStorage.getItem(DEFAULT_MODE_KEY) !== 'view';
  } catch {
    return true;
  }
})();

export type Theme = 'dark' | 'light' | 'system';

// Debe coincidir con el script en línea de index.html, que aplica el tema antes de pintar
const THEME_KEY = 'theme';
const initialTheme = ((): Theme => {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
})();

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const applyTheme = (theme: Theme) => {
  const resolved = theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = resolved;
  // Color de la barra del navegador en el móvil, a juego con la cabecera (--background-secondary)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f6f6f6' : '#1e1e1e');
};

applyTheme(initialTheme);
// En modo "sistema", seguir los cambios del sistema operativo en caliente
systemDark.addEventListener('change', () => applyTheme(useStore.getState().theme));

// Título de la pestaña del navegador y de la pantalla de login
export const DEFAULT_SITE_TITLE = 'Obsidita';
const applySiteTitle = (title: string) => {
  document.title = title || DEFAULT_SITE_TITLE;
};

// Tamaño de la fuente del editor y la vista de lectura (px); se aplica con la variable CSS --font-text-size
export const DEFAULT_FONT_SIZE = 15;
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 30;
const FONT_SIZE_KEY = 'fontSize';
const clampFontSize = (size: number) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
const initialFontSize = (() => {
  try {
    const value = Number(localStorage.getItem(FONT_SIZE_KEY));
    return value ? clampFontSize(value) : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
})();

const applyFontSize = (size: number) =>
  document.documentElement.style.setProperty('--font-text-size', `${size}px`);

applyFontSize(initialFontSize);

// Fuentes de la interfaz, del texto de las notas y monoespaciada (código). Vacío = la predeterminada;
// se aplican con las variables CSS --font-interface, --font-text y --font-monospace
export type FontKind = 'interface' | 'text' | 'monospace';
export type Fonts = Record<FontKind, string>;
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
const initialFonts = (Object.keys(FONT_KEYS) as FontKind[]).reduce((fonts, kind) => {
  try {
    fonts[kind] = cleanFont(localStorage.getItem(FONT_KEYS[kind]) ?? '');
  } catch {
    fonts[kind] = '';
  }
  return fonts;
}, {} as Fonts);

const applyFont = (kind: FontKind, name: string) => {
  const style = document.documentElement.style;
  if (name) style.setProperty(`--font-${kind}`, `"${name}", ${FONT_FALLBACKS[kind]}`);
  else style.removeProperty(`--font-${kind}`);
};

(Object.keys(initialFonts) as FontKind[]).forEach((kind) => applyFont(kind, initialFonts[kind]));

// Ctrl + rueda del ratón (o pellizcar en el trackpad) sobre la nota cambia el tamaño de fuente
const QUICK_FONT_SIZE_KEY = 'quickFontSize';
const initialQuickFontSize = (() => {
  try {
    return localStorage.getItem(QUICK_FONT_SIZE_KEY) === 'true';
  } catch {
    return false;
  }
})();

// Preferencias de interfaz de sí/no, guardadas como 'true'/'false'
const SHOW_TAB_HEADER_KEY = 'showTabHeader';
const SHOW_RIBBON_KEY = 'showRibbon';
const readBool = (key: string, fallback: boolean) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};
const saveBool = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // almacenamiento no disponible: la preferencia solo dura la sesión
  }
};

// Longitud de línea legible: limita el ancho del texto de la nota con la variable CSS --line-width
const READABLE_LINE_KEY = 'readableLineLength';
const LINE_NUMBERS_KEY = 'showLineNumbers';
const INLINE_TITLE_KEY = 'showInlineTitle';
const applyReadableLineLength = (enabled: boolean) =>
  document.documentElement.style.setProperty('--line-width', enabled ? '720px' : 'none');
applyReadableLineLength(readBool(READABLE_LINE_KEY, true));

const HIDDEN_KEY = 'hiddenFolders';
const initialHiddenFolders = (() => {
  try {
    return localStorage.getItem(HIDDEN_KEY) ?? '';
  } catch {
    return '';
  }
})();

// Un patrón por línea; `*` es comodín. Se compara con el nombre de cada carpeta (sin distinguir mayúsculas)
export const hiddenMatchers = (patterns: string): RegExp[] =>
  patterns
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));

// true si alguna carpeta de la ruta coincide con los patrones ocultos
export const isHiddenPath = (path: string, isFolder: boolean, matchers: RegExp[]) => {
  const segments = path.split('/');
  const folders = isFolder ? segments : segments.slice(0, -1);
  return folders.some((name) => matchers.some((re) => re.test(name)));
};

export const useStore =create<AppStore>((set) => ({
  conflicts: [],
  setConflict: (conflict) =>
    set((state) => {
      const i = state.conflicts.findIndex((c) => c.path === conflict.path);
      if (i < 0) return { conflicts: [...state.conflicts, conflict] };
      const conflicts = [...state.conflicts];
      conflicts[i] = conflict;
      return { conflicts };
    }),
  clearConflict: (path) => set((state) => ({ conflicts: state.conflicts.filter((c) => c.path !== path) })),
  hiddenFolders: initialHiddenFolders,
  setHiddenFolders: (value) => {
    try {
      localStorage.setItem(HIDDEN_KEY, value);
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    set({ hiddenFolders: value });
  },
  tree: [],
  setTree: (tree) => set({ tree }),
  tabs: [],
  addTab: (path, name) =>
    set((state) => {
      if (state.tabs.find((t) => t.path === path)) return state;
      return { tabs: [...state.tabs, { path, name, isDirty: false }] };
    }),
  openFile: (path, name) =>
    set((state) => {
      // Ya abierto en alguna pestaña: solo activarla
      if (state.tabs.find((t) => t.path === path)) return { activeTab: path };
      const tab = { path, name, isDirty: false };
      const idx = state.tabs.findIndex((t) => t.path === state.activeTab);
      const editMode = state.defaultEditMode;
      // Sin pestaña activa: crear una; si no, reemplazar la activa
      if (idx < 0) return { tabs: [...state.tabs, tab], activeTab: path, editMode };
      const tabs = [...state.tabs];
      tabs[idx] = tab;
      return { tabs, activeTab: path, editMode };
    }),
  // Si la ruta es una carpeta, afecta también a todo lo que contiene
  renameTab: (oldPath, newPath) =>
    set((state) => {
      const move = (p: string) => (isUnder(p, oldPath) ? newPath + p.substring(oldPath.length) : p);
      return {
        tabs: state.tabs.map((t) => {
          if (!isUnder(t.path, oldPath)) return t;
          const path = move(t.path);
          return { ...t, path, name: path.split('/').pop() || path };
        }),
        activeTab: state.activeTab && move(state.activeTab),
        expandedFolders: new Set([...state.expandedFolders].map(move)),
      };
    }),
  removeTab: (path) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => !isUnder(t.path, path)),
      activeTab: state.activeTab && isUnder(state.activeTab, path) ? null : state.activeTab,
    })),
  activeTab: null,
  setActiveTab: (path) => set({ activeTab: path }),
  setTabDirty: (path, isDirty) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.path === path ? { ...t, isDirty } : t)),
    })),
  editMode: initialDefaultEditMode,
  setEditMode: (mode) => set(mode ? { editMode: mode } : { editMode: mode, rawMode: false }),
  rawMode: false,
  setRawMode: (raw) => set({ rawMode: raw }),
  defaultEditMode: initialDefaultEditMode,
  setDefaultEditMode: (mode) => {
    try {
      localStorage.setItem(DEFAULT_MODE_KEY, mode ? 'edit' : 'view');
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    set({ defaultEditMode: mode });
  },
  theme: initialTheme,
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    applyTheme(theme);
    set({ theme });
  },
  fontSize: initialFontSize,
  setFontSize: (size) => {
    const value = clampFontSize(size);
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(value));
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    applyFontSize(value);
    set({ fontSize: value });
  },
  fonts: initialFonts,
  setFont: (kind, name) => {
    const value = cleanFont(name);
    try {
      if (value) localStorage.setItem(FONT_KEYS[kind], value);
      else localStorage.removeItem(FONT_KEYS[kind]);
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    applyFont(kind, value);
    set((state) => ({ fonts: { ...state.fonts, [kind]: value } }));
  },
  quickFontSize: initialQuickFontSize,
  setQuickFontSize: (enabled) => {
    try {
      localStorage.setItem(QUICK_FONT_SIZE_KEY, String(enabled));
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    set({ quickFontSize: enabled });
  },
  showInlineTitle: readBool(INLINE_TITLE_KEY, true),
  setShowInlineTitle: (show) => {
    saveBool(INLINE_TITLE_KEY, show);
    set({ showInlineTitle: show });
  },
  showLineNumbers: readBool(LINE_NUMBERS_KEY, false),
  setShowLineNumbers: (show) => {
    saveBool(LINE_NUMBERS_KEY, show);
    set({ showLineNumbers: show });
  },
  readableLineLength: readBool(READABLE_LINE_KEY, true),
  setReadableLineLength: (enabled) => {
    saveBool(READABLE_LINE_KEY, enabled);
    applyReadableLineLength(enabled);
    set({ readableLineLength: enabled });
  },
  showTabHeader: readBool(SHOW_TAB_HEADER_KEY, true),
  setShowTabHeader: (show) => {
    saveBool(SHOW_TAB_HEADER_KEY, show);
    set({ showTabHeader: show });
  },
  showRibbon: readBool(SHOW_RIBBON_KEY, true),
  setShowRibbon: (show) => {
    saveBool(SHOW_RIBBON_KEY, show);
    set({ showRibbon: show });
  },
  siteTitle: '',
  setSiteTitle: (title) => {
    applySiteTitle(title);
    set({ siteTitle: title });
  },
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  expandedFolders: new Set(),
  collapseAll: () => set({ expandedFolders: new Set() }),
  // En el móvil la barra lateral tapa la nota: se empieza con ella cerrada
  sidebarOpen: !isMobile(),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  sidebarView: 'files',
  // Pulsar la vista que ya está abierta cierra la barra lateral, como en Obsidian
  showSidebarView: (view) =>
    set((state) =>
      state.sidebarOpen && state.sidebarView === view
        ? { sidebarOpen: false }
        : { sidebarOpen: true, sidebarView: view }
    ),
  // Se conserva la última búsqueda al cambiar entre vistas de la barra lateral
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  searchTag: (tag) =>
    set({ sidebarOpen: true, sidebarView: 'search', searchQuery: `tag:${tag.replace(/^#/, '')}` }),
  toggleFolder: (path) =>
    set((state) => {
      const expanded = new Set(state.expandedFolders);
      if (expanded.has(path)) {
        expanded.delete(path);
      } else {
        expanded.add(path);
      }
      return { expandedFolders: expanded };
    }),
}));
