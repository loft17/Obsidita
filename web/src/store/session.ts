import { fileName } from '../paths';
import { useStore } from './index';
import { readRaw, writeRaw } from './storage';

// Restaurar las pestañas al volver: con la opción activa se guardan en este navegador las
// pestañas abiertas y la activa, y al entrar se vuelven a abrir las que aún existen en el vault.
// No se sincroniza con el servidor: cada dispositivo recuerda sus propias pestañas
const SESSION_KEY = 'openTabs';

interface SavedSession {
  tabs: string[];
  active: string | null;
}

const readSession = (): SavedSession | null => {
  try {
    const data = JSON.parse(readRaw(SESSION_KEY) ?? 'null');
    if (!data || !Array.isArray(data.tabs)) return null;
    return {
      tabs: data.tabs.filter((p: unknown): p is string => typeof p === 'string'),
      active: typeof data.active === 'string' ? data.active : null,
    };
  } catch {
    return null;
  }
};

// Hasta restaurar no se guarda nada: si no, el estado vacío del arranque borraría lo guardado
let ready = false;

const saveSession = () => {
  const { restoreTabs, tabs, activeTab } = useStore.getState();
  if (!ready) return;
  if (!restoreTabs) {
    if (readRaw(SESSION_KEY) !== null) writeRaw(SESSION_KEY, null);
    return;
  }
  const session: SavedSession = { tabs: tabs.map((t) => t.path), active: activeTab };
  const text = JSON.stringify(session);
  if (readRaw(SESSION_KEY) !== text) writeRaw(SESSION_KEY, text);
};

useStore.subscribe((state, prev) => {
  if (state.tabs !== prev.tabs || state.activeTab !== prev.activeTab || state.restoreTabs !== prev.restoreTabs) {
    saveSession();
  }
});

// Se llama al entrar, con el árbol ya cargado y las preferencias del servidor aplicadas
export function restoreSession() {
  const state = useStore.getState();
  if (ready) return;
  ready = true;
  if (!state.restoreTabs || state.tabs.length) {
    saveSession();
    return;
  }
  const saved = readSession();
  if (!saved) return;
  const existing = new Set(state.tree.filter((item) => item.type !== 'folder').map((item) => item.path));
  const paths = [...new Set(saved.tabs)].filter((p) => existing.has(p));
  if (!paths.length) {
    saveSession();
    return;
  }
  const active = saved.active && paths.includes(saved.active) ? saved.active : paths[paths.length - 1];
  useStore.setState({
    tabs: paths.map((path) => ({ path, name: fileName(path), isDirty: false })),
    activeTab: active,
    editMode: state.defaultEditMode,
    rawMode: false,
  });
}
