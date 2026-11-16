import { useEffect } from 'react';
import { useLatest } from './latestRef';
import { useStore } from './store';
import { flushPendingSave, hasPendingSave } from './components/Editor';
import { useNoteOverlayStore } from './components/NoteShortcuts';
import { canRunFileShortcut, fileShortcutFor, hasOpenOverlay } from './fileShortcuts';
import { notify } from './toast';
import { t } from './i18n';
import { isNote } from './paths';
import { openAiBar } from './ai';
import { openBookmark, toggleBookmark } from './bookmarks';
import { visualOrder } from './bookmarkUtils';

// Atajos globales. Con modificador: Ctrl/Cmd+P abrir nota (`onQuickOpen`), +S guardar,
// +E editar/leer, +B barra lateral, +K editar con IA, +Shift+F buscar. Para el archivo abierto: F2 renombrar,
// Ctrl/Cmd+Shift+M mover y Ctrl/Cmd+Shift+Retroceso borrar (ver SHORTCUT_GROUPS en Ajustes → Atajos).
// También Ctrl/Cmd + rueda sobre la nota para el tamaño de fuente
export function useGlobalShortcuts(onQuickOpen: () => void) {
  // Los listeners se registran una sola vez: con la ref siempre se llama a la última `onQuickOpen`
  const onQuickOpenRef = useLatest(onQuickOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const fileAction = fileShortcutFor(e);
      if (fileAction) {
        const { activeTab } = useStore.getState();
        const target = e.target as Element | null;
        // Sin archivo abierto no hay nada que renombrar, mover ni borrar
        if (!activeTab || !canRunFileShortcut(fileAction, target, { overlayOpen: hasOpenOverlay() })) return;
        // Con un botón enfocado Intro/Espacio lo activan; no hay motivo para saltar a un diálogo
        if ((document.activeElement as HTMLElement | null)?.closest('button')) return;
        e.preventDefault();
        useNoteOverlayStore.getState().open(fileAction);
        return;
      }

      // Alt+1..9: abre el marcador que ocupa ese puesto en el panel (sin Shift: en algunos teclados da símbolos)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (digit && !hasOpenOverlay()) {
          const { bookmarks, bookmarkGroups } = useStore.getState();
          const target = visualOrder({ groups: bookmarkGroups, items: bookmarks })[Number(digit[1]) - 1];
          if (target) {
            e.preventDefault();
            openBookmark(target);
          }
        }
        return;
      }

      const withMod = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (!withMod) return;
      if (e.shiftKey) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          useStore.setState({ sidebarOpen: true, sidebarView: 'search' });
        }
        return;
      }
      const { activeTab, editMode, setEditMode, toggleSidebar } = useStore.getState();
      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          onQuickOpenRef.current();
          break;
        case 's':
          e.preventDefault();
          if (!activeTab) break;
          // Sin nada pendiente no hay guardado que avise: se confirma igualmente
          if (hasPendingSave(activeTab)) flushPendingSave(activeTab);
          else if (isNote(activeTab)) notify('save', t('toast.saved'));
          break;
        case 'e':
          // Solo las notas tienen modo edición: el resto de archivos son de solo lectura
          if (!activeTab || !isNote(activeTab)) return;
          e.preventDefault();
          setEditMode(!editMode);
          break;
        case 'b':
          e.preventDefault();
          toggleSidebar();
          break;
        case 'd':
          // Marca o quita la nota abierta (el navegador usaría Ctrl+D para marcar la página)
          if (!activeTab) break;
          e.preventDefault();
          toggleBookmark(activeTab);
          break;
        case 'k':
          // Solo con una nota, la IA configurada y sin un diálogo encima (si no, el atajo queda
          // para el navegador). El editor no usa Ctrl/Cmd+K (ni markdownKeymap, ni defaultKeymap,
          // ni historyKeymap)
          if (!hasOpenOverlay() && openAiBar()) e.preventDefault();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onQuickOpenRef]);

  // Ajuste rápido del tamaño de fuente: Ctrl/Cmd + rueda sobre la nota. Los navegadores también envían
  // el gesto de pellizcar del trackpad como rueda con ctrlKey. Fuera de la nota se mantiene el zoom del navegador
  useEffect(() => {
    let accumulated = 0;
    const onWheel = (e: WheelEvent) => {
      const { quickFontSize, fontSize, setFontSize } = useStore.getState();
      if (!quickFontSize || !(e.ctrlKey || e.metaKey)) return;
      if (!(e.target as Element).closest?.('.cm-editor, .reading-view')) return;
      e.preventDefault();
      // El trackpad manda muchos deltas pequeños: acumularlos para que el gesto no vaya demasiado rápido
      accumulated += e.deltaY;
      if (Math.abs(accumulated) < 20) return;
      setFontSize(fontSize + (accumulated < 0 ? 1 : -1));
      accumulated = 0;
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);
}
