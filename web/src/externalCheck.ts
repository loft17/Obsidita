import { useEffect } from 'react';
import { useLatest } from './latestRef';
import { filesApi } from './api';
import { useStore } from './store';
import { hasPendingSave, noteVersions, NOTES_CHANGED } from './components/Editor';
import { isNote } from './paths';

// Cada cuánto se comprueba si la nota abierta ha cambiado en el servidor (ms)
const EXTERNAL_CHECK_INTERVAL = 15000;

// La nota abierta puede cambiar fuera de esta pestaña: otro dispositivo, la sincronización
// con GitHub, Obsidian de escritorio... Se comprueba al volver a la pestaña, cada poco
// mientras está visible y cuando el servidor reescribe enlaces. Solo se pide la nota si su
// versión en el servidor es otra (ver más abajo). Si hay cambios sin guardar no se toca
// nada: el guardado detectará el conflicto. `onChange` recibe el contenido nuevo
export function useExternalCheck(onChange: (content: string) => void) {
  // El efecto se registra una sola vez: con la ref siempre se llama a la última `onChange`
  const onChangeRef = useLatest(onChange);

  useEffect(() => {
    let checking = false;
    const busy = (path: string) =>
      hasPendingSave(path) || !!useStore.getState().tabs.find((t) => t.path === path)?.isDirty;

    const check = async () => {
      const { activeTab: path, conflicts } = useStore.getState();
      if (checking || !path || !isNote(path) || conflicts.length || busy(path)) return;
      if (document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const known = noteVersions.get(path);
        // Con la versión conocida el servidor responde 304 y no se descarga la nota: solo
        // viaja el hash, así que el sondeo cada 15 s no reenvía notas grandes sin cambios
        const data = known ? await filesApi.readFile(path, known) : await filesApi.readFile(path);
        if (data.unchanged) return;
        const unchanged = useStore.getState().activeTab === path && !busy(path) && noteVersions.get(path) === known;
        if (!unchanged || data.version === known) return;
        noteVersions.set(path, data.version);
        onChangeRef.current(data.content);
      } catch {
        // borrada o sin conexión: se vuelve a intentar en la próxima comprobación
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(check, EXTERNAL_CHECK_INTERVAL);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener(NOTES_CHANGED, check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener(NOTES_CHANGED, check);
    };
  }, [onChangeRef]);
}
