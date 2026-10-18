import type { StateCreator } from 'zustand';
import { isMobile } from '../mobile';
import { readNumber, save } from './storage';
import type { AppStore } from './index';

// Estado de la interfaz: barra lateral, búsqueda, ajustes y datos de la web que manda el servidor

export type SidebarView = 'files' | 'search' | 'tags' | 'trash';

// Título de la pestaña del navegador y de la pantalla de login
export const DEFAULT_SITE_TITLE = 'Obsidita';

export const DEFAULT_SIDEBAR_WIDTH = 270;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 600;

export interface UiSlice {
  // Título de la web (lo guarda el servidor); vacío = DEFAULT_SITE_TITLE
  siteTitle: string;
  setSiteTitle: (title: string) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  collapseAll: () => void;
  // Ancho de la barra lateral en el escritorio (px), ajustable arrastrando su borde
  sidebarWidth: number;
  setSidebarWidth: (width: number, persist?: boolean) => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  sidebarView: SidebarView;
  showSidebarView: (view: SidebarView) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchTag: (tag: string) => void;
  gitSyncProvider: string | null;
  setGitSyncProvider: (provider: string | null) => void;
}

const SIDEBAR_WIDTH_KEY = 'sidebarWidth';
const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(width)));

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  siteTitle: '',
  setSiteTitle: (title) => {
    document.title = title || DEFAULT_SITE_TITLE;
    set({ siteTitle: title });
  },
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  expandedFolders: new Set(),
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
  collapseAll: () => set({ expandedFolders: new Set() }),
  sidebarWidth: readNumber(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH, clampSidebarWidth),
  // Durante el arrastre solo se actualiza el estado; se guarda al soltar (persist)
  setSidebarWidth: (width, persist = false) => {
    const value = clampSidebarWidth(width);
    if (persist) save(SIDEBAR_WIDTH_KEY, value);
    set({ sidebarWidth: value });
  },
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
  gitSyncProvider: null,
  setGitSyncProvider: (provider) => set({ gitSyncProvider: provider }),
});
