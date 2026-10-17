// Operaciones de renombrar, mover y borrar que comparten el explorador y los atajos de teclado
// (NoteShortcuts). Aquí vive la lógica común para que no se comporten distinto según se haga
// con el ratón o con el teclado. El cálculo de rutas está en filePaths.ts
import { useStore } from '../store';
import { filesApi } from '../api';
import { flushPendingSave, changeNotePath } from './Editor';

export { fileName, filePathParent, movedPath, renamedPath } from './filePaths';

export const refreshTree = async () => useStore.getState().setTree(await filesApi.getTree());

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
