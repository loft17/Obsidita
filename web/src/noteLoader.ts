import { useEffect, useState } from 'react';
import { filesApi } from './api';
import { useStore } from './store';
import { flushPendingSave, noteVersions } from './components/Editor';
import { isNote } from './paths';

// Contenido de la nota abierta: se lee del servidor al cambiar de pestaña y se guardan ya los
// autoguardados pendientes al ocultar o cerrar la pestaña del navegador
export function useNoteLoader(activeTab: string | null) {
  const [content, setContent] = useState('');
  // Nota a la que pertenece `content`: al cambiar de pestaña, hasta que llega la nueva, es la anterior
  const [contentPath, setContentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeTab) return;
    // Solo las notas markdown se leen como texto. Las imágenes las carga el visor y el resto de
    // archivos (PDF, ZIP...) se leerían en UTF-8 y el autoguardado los reescribiría corrompidos
    if (!isNote(activeTab)) {
      setContent('');
      setContentPath(activeTab);
      setLoading(false);
      return;
    }

    const path = activeTab;
    // Cambiar de pestaña mientras esta carga está en curso no debe pisar la nota nueva:
    // el efecto se limpia al cambiar `activeTab`, así que a partir de ahí el resultado se ignora
    let cancelled = false;

    const loadFile = async () => {
      setLoading(true);
      try {
        // Un guardado aún en curso de esta nota se leería a medias
        await flushPendingSave(path);
        const data = await filesApi.readFile(path);
        if (cancelled || useStore.getState().activeTab !== path) return;
        noteVersions.set(path, data.version);
        setContent(data.content);
        setContentPath(path);
      } catch (err) {
        console.error('Error loading file:', err);
        if (!cancelled) setContentPath(path);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFile();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Al ocultar o cerrar la pestaña se guardan ya los autoguardados que estén esperando al
  // temporizador (hasta 2 s de lo escrito se perderían si no). pagehide cubre el cierre/recarga
  // y visibilitychange el cambio de app en el móvil
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') flushPendingSave(null);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // Mientras llega la nota nueva se sigue teniendo la anterior: también cuenta como cargando
  const pending = loading || (!!activeTab && isNote(activeTab) && contentPath !== activeTab);

  return { content, setContent, loading: pending };
}
