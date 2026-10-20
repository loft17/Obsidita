// Operaciones de renombrar, mover y borrar que comparten el explorador y los atajos de teclado
// (NoteShortcuts). Aquí vive la lógica común para que no se comporten distinto según se haga
// con el ratón o con el teclado. El cálculo de rutas está en src/paths.ts
import { useStore } from '../store';
import { filesApi } from '../api';
import { flushPendingSave, changeNotePath } from './Editor';
import { fileName, joinPath, parentFolder } from '../paths';
import { notify } from '../toast';
import { t } from '../i18n';

export const refreshTree = async () => useStore.getState().setTree(await filesApi.getTree());

// Nota nueva "Sin título.md" ("Sin título 1.md"...) en la carpeta de la pestaña activa (la raíz si
// no hay ninguna). Se abre en una pestaña nueva y en modo edición; el nombre se cambia en el título
export const createUntitledNote = async () => {
  const { activeTab, addTab, setActiveTab, setEditMode, expandedFolders, toggleFolder } = useStore.getState();
  const folder = activeTab ? parentFolder(activeTab) : '';
  try {
    // El árbol se relee: la nota puede haberse creado en otro dispositivo
    const tree = await filesApi.getTree();
    const taken = new Set(tree.map((item) => item.path.toLowerCase()));
    const base = t('file.untitled');
    let path = joinPath(folder, `${base}.md`);
    for (let n = 1; taken.has(path.toLowerCase()); n++) path = joinPath(folder, `${base} ${n}.md`);
    await filesApi.createNote(path);
    await refreshTree();
    if (folder && !expandedFolders.has(folder)) toggleFolder(folder);
    addTab(path, fileName(path));
    setActiveTab(path);
    setEditMode(true);
  } catch (err) {
    notify('new-note', t('file.createNoteError', { error: (err as Error).message }), 'error');
  }
};

// Renombrar y mover son el mismo cambio de ruta en el servidor: además de la ruta, se
// reescriben los enlaces de las notas y se actualizan pestañas y carpetas abiertas
export const applyPathChange = async (oldPath: string, newPath: string) => {
  await changeNotePath(oldPath, newPath);
  await refreshTree();
};

// Borra y quita las pestañas que ya no existen. Lo que haya a medio guardar dentro del elemento
// se escribe antes (cancelarlo perdería hasta 2 s de edición en cada nota de la carpeta)
export const deletePath = async (path: string, images: string[] = []) => {
  const { removeTab } = useStore.getState();
  await flushPendingSave(path);
  await filesApi.deleteFile(path);
  removeTab(path);
  for (const image of images) {
    await filesApi.deleteFile(image);
    removeTab(image);
  }
  await refreshTree();
};
