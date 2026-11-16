// Operaciones de renombrar, mover y borrar que comparten el explorador y los atajos de teclado
// (NoteShortcuts). Aquí vive la lógica común para que no se comporten distinto según se haga
// con el ratón o con el teclado. El cálculo de rutas está en src/paths.ts
import { useStore } from '../store';
import { filesApi } from '../api';
import { flushPendingSave, changeNotePath, NOTES_CHANGED } from './Editor';
import { flushBookmarkSaves } from '../store/bookmarks';
import { fileName, joinPath, parentFolder } from '../paths';
import { notify } from '../toast';
import { t } from '../i18n';
import { rawFileUrl } from '../attachments';
import { changeExt, encodeImage } from '../imageConvert';

export const refreshTree = async () => useStore.getState().setTree(await filesApi.getTree());

// Copia del archivo en su misma carpeta (el servidor elige el nombre). Devuelve la ruta nueva, o null si falla
export const copyPath = async (path: string) => {
  try {
    await flushPendingSave(path);
    const copy = await filesApi.copyFile(path);
    await refreshTree();
    return copy.path;
  } catch (err) {
    notify('copy', t('file.copyError', { error: (err as Error).message }), 'error');
    return null;
  }
};

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
  // Lo pendiente de los marcadores se guarda antes: el servidor mueve las rutas al renombrar
  await flushBookmarkSaves();
  await changeNotePath(oldPath, newPath);
  await refreshTree();
  await useStore.getState().loadBookmarks();
};

// Tipo MIME de las imágenes que se pueden convertir (la extensión manda: el servidor no lo envía fiable)
const SOURCE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };

// Convierte una imagen del vault a WebP o JPG con la calidad de Preferencias → Archivos. La copia
// nueva queda en la misma carpeta, los enlaces de todo el vault pasan a ella y la original va a la papelera
export const convertImagePath = async (path: string, format: 'webp' | 'jpg') => {
  try {
    // Lo pendiente de las notas y de los marcadores se guarda antes: el servidor reescribe enlaces
    await flushPendingSave(null);
    await flushBookmarkSaves();
    const ext = fileName(path).split('.').pop()?.toLowerCase() ?? '';
    const res = await fetch(rawFileUrl(path));
    if (!res.ok) throw new Error(res.statusText);
    const source = new Blob([await res.blob()], { type: SOURCE_MIME[ext] });
    const converted = await encodeImage(source, format, useStore.getState().imageQuality);
    if (!converted) throw new Error(t('image.convertUnsupported'));
    // Como al pegar: si no reduce el tamaño, se mantiene la original y no se toca ningún enlace
    if (converted.size >= source.size) {
      notify('convert-image', t('image.convertNoGain'), 'info');
      return;
    }
    const name = changeExt(fileName(path), format);
    const { path: newPath, updated } = await filesApi.convertImage(path, name, converted);
    if (updated.length) window.dispatchEvent(new Event(NOTES_CHANGED));
    useStore.getState().removeTab(path);
    await refreshTree();
    await useStore.getState().loadBookmarks();
    notify('convert-image', t('image.converted', { name: fileName(newPath) }));
  } catch (err) {
    notify('convert-image', t('image.convertError', { error: (err as Error).message }), 'error');
  }
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
