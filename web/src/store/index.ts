import { create } from 'zustand';
import { createPrefsSlice, type PrefsSlice } from './prefs';
import { createUiSlice, type UiSlice } from './ui';
import { createDocsSlice, type DocsSlice } from './docs';

// Un único store compuesto por slices: preferencias (persistidas), interfaz y documentos.
// Las acciones de un slice pueden leer y escribir campos de otro (p. ej. `openFile` usa
// `defaultEditMode` y `renameTab` actualiza `expandedFolders`)
export type AppStore = PrefsSlice & UiSlice & DocsSlice;

export const useStore = create<AppStore>()((...a) => ({
  ...createPrefsSlice(...a),
  ...createUiSlice(...a),
  ...createDocsSlice(...a),
}));

export type { Theme, FontKind, Fonts } from './prefs';
export { DEFAULT_FONT_SIZE, MIN_FONT_SIZE, MAX_FONT_SIZE } from './prefs';
export type { SidebarView } from './ui';
export { DEFAULT_SITE_TITLE, DEFAULT_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from './ui';
export type { NoteConflict } from './docs';
export { parseHiddenExtensions, hasHiddenExtension, hiddenMatchers, isHiddenPath } from './hidden';
