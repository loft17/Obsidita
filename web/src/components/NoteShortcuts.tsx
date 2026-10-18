// Diálogos que abren los atajos de renombrar (F2), mover (Ctrl/Cmd+Shift+M) y borrar
// (Ctrl/Cmd+Shift+Retroceso). Las teclas se atienden en MainLayout, que solo necesita pedir
// la acción; aquí vive el mismo flujo que en el menú de la nota (NoteMenu), apoyado en las
// operaciones compartidas de fileActions.ts para que no se comporten distinto
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import { useT } from '../i18n';
import { RenameDialog, MoveDialog, DeleteFileDialog } from './FileDialogs';
import { applyPathChange, deletePath } from './fileActions';
import { movedPath, noteTitle, parentFolder, renamedPath } from '../paths';

export type NoteFileAction = 'rename' | 'move' | 'delete';

// Estado mínimo para que el manejador de teclas (fuera de React) pueda abrir los diálogos
export const useNoteOverlayStore = create<{ action: NoteFileAction | null; open: (a: NoteFileAction) => void }>(
  (set) => ({ action: null, open: (action) => set({ action }) }),
);

export default function NoteShortcuts() {
  const action = useNoteOverlayStore((s) => s.action);
  const activeTab = useStore((s) => s.activeTab);
  const tree = useStore((s) => s.tree);
  const t = useT();
  const close = () => useNoteOverlayStore.setState({ action: null });

  // Al cambiar de nota, el diálogo abierto ya no corresponde a lo que se ve. Se compara con el
  // anterior para no cerrar en el primer montaje lo que acaba de abrir el atajo
  const shownFor = useRef(activeTab);
  useEffect(() => {
    if (shownFor.current !== activeTab) {
      shownFor.current = activeTab;
      close();
    }
  }, [activeTab]);

  if (!activeTab || !action) return null;

  const folders = tree
    .filter((i) => i.type === 'folder')
    .map((i) => i.path)
    .sort((a, b) => a.localeCompare(b));

  const done = () => close();

  // Renombrar y mover son el mismo cambio de ruta en el servidor (reescribe enlaces y pestañas)
  const rename = (newName: string) => applyPathChange(activeTab, renamedPath(activeTab, newName)).then(done);

  const move = (folder: string) => applyPathChange(activeTab, movedPath(activeTab, folder)).then(done);

  const remove = (images: string[]) => deletePath(activeTab, images).then(done);

  if (action === 'rename') {
    return <RenameDialog initialName={noteTitle(activeTab)} onSubmit={rename} onClose={close} />;
  }
  if (action === 'move') {
    return <MoveDialog folders={folders} currentFolder={parentFolder(activeTab)} onSubmit={move} onClose={close} />;
  }
  // La pestaña abierta puede ser una carpeta (se selecciona en el árbol): el título y el
  // borrado de sus imágenes deben tratarla como tal y no como una nota
  const isFolder = tree.some((i) => i.type === 'folder' && i.path === activeTab);

  return (
    <DeleteFileDialog
      path={activeTab}
      isFolder={isFolder}
      title={isFolder ? t('file.deleteFolder') : t('file.deleteFile')}
      confirmLabel={t('common.delete')}
      onDelete={remove}
      onClose={close}
    />
  );
}
