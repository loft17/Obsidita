import type { StateCreator } from 'zustand';
import type { TreeItem } from '../types';
import { fileName, isUnder } from '../paths';
import { initialDefaultEditMode } from './prefs';
import type { AppStore } from './index';

// Documentos: árbol del vault, pestañas abiertas, modo de la nota activa y conflictos al guardar

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

export interface DocsSlice {
  // Conflictos pendientes de resolver (se muestran de uno en uno)
  conflicts: NoteConflict[];
  setConflict: (conflict: NoteConflict) => void;
  clearConflict: (path: string) => void;
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
}

export const createDocsSlice: StateCreator<AppStore, [], [], DocsSlice> = (set) => ({
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
  // Si la ruta es una carpeta, afecta también a todo lo que contiene (y a las carpetas desplegadas)
  renameTab: (oldPath, newPath) =>
    set((state) => {
      const move = (p: string) => (isUnder(p, oldPath) ? newPath + p.substring(oldPath.length) : p);
      return {
        tabs: state.tabs.map((t) => {
          if (!isUnder(t.path, oldPath)) return t;
          const path = move(t.path);
          return { ...t, path, name: fileName(path) };
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
  // Marcar la pestaña como sucia/limpia. Si el valor no cambia no se toca `tabs`: crear un
  // array nuevo en cada pulsación (siempre se llama al escribir) re-renderizaba Tabs tecla a
  // tecla, porque se suscribe al array entero. Devolver {} no cambia `tabs` por identidad,
  // así que el selector de Tabs no dispara el re-render
  setTabDirty: (path, isDirty) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.path === path);
      if (!tab || tab.isDirty === isDirty) return {};
      return { tabs: state.tabs.map((t) => (t.path === path ? { ...t, isDirty } : t)) };
    }),
  editMode: initialDefaultEditMode,
  setEditMode: (mode) => set(mode ? { editMode: mode } : { editMode: mode, rawMode: false }),
  rawMode: false,
  setRawMode: (raw) => set({ rawMode: raw }),
});
