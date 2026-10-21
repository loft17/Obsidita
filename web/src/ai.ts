import { create } from 'zustand';
import { aiApi, type AiConfig } from './api';
import { useStore } from './store';
import { isNote } from './paths';

// Edición con IA: aquí solo el estado mínimo (configuración y nota con la barra abierta), que
// se usa en la carga inicial. La barra y el diff (components/AiBar.tsx) se descargan con import()
// la primera vez que se abre

interface AiState {
  // null: aún no se ha pedido al servidor
  config: AiConfig | null;
  // Nota con la barra abierta (null: cerrada)
  path: string | null;
  // Cambia cada vez que se pide abrir la barra: si ya estaba abierta, recupera el foco
  focusRequest: number;
}

export const useAiStore = create<AiState>(() => ({ config: null, path: null, focusRequest: 0 }));

// Una sola petición; si falla, la función queda oculta y se vuelve a intentar en la siguiente llamada
let configPromise: Promise<void> | null = null;
export const loadAiConfig = () =>
  (configPromise ??= aiApi.getConfig().then(
    (config) => useAiStore.setState({ config }),
    () => {
      configPromise = null;
      useAiStore.setState({ config: { enabled: false } });
    },
  ));

// Tras cambiar la configuración en Ajustes → IA
export const reloadAiConfig = () => {
  configPromise = null;
  return loadAiConfig().then(() => {
    if (useAiStore.getState().config?.enabled !== true) closeAiBar();
  });
};

export const useAiEnabled = () => useAiStore((s) => s.config?.enabled === true);

// Abre la barra sobre la nota activa. En modo lectura (o texto plano) se pasa antes al editor.
// Devuelve false si no hay nada que abrir (no es una nota o la IA no está configurada)
export function openAiBar(): boolean {
  const { activeTab, editMode, rawMode, setEditMode, setRawMode } = useStore.getState();
  if (!activeTab || !isNote(activeTab) || useAiStore.getState().config?.enabled !== true) return false;
  if (!editMode) setEditMode(true);
  else if (rawMode) setRawMode(false);
  useAiStore.setState((s) => ({ path: activeTab, focusRequest: s.focusRequest + 1 }));
  return true;
}

export const closeAiBar = () => useAiStore.setState({ path: null });

// La barra pertenece a la nota y al editor: se cierra al cambiar de pestaña, pasar a lectura o
// a texto plano
useStore.subscribe((state, prev) => {
  if (useAiStore.getState().path === null) return;
  if (state.activeTab !== prev.activeTab || !state.editMode || state.rawMode) closeAiBar();
});
