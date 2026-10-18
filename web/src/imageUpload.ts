// Subida de imágenes al pegar desde el portapapeles o arrastrar y soltar en el editor
import { EditorView } from '@codemirror/view';
import { filesApi } from './api';
import { useStore } from './store';
import { isImage } from './attachments';
import { t } from './i18n';
import { notify } from './toast';

const pad = (n: number) => String(n).padStart(2, '0');

// Mismo nombre que usa Obsidian: "Pasted image 20240131120000.png"
const pastedName = (file: File) => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace('svg+xml', 'svg') || 'png';
  return `Pasted image ${stamp}.${ext}`;
};

const imageFiles = (list: FileList | null | undefined) =>
  [...(list ?? [])].filter((f) => f.type.startsWith('image/') || isImage(f.name));

// Enlace más corto posible: solo el nombre si no hay otro archivo que se llame igual
const linkTarget = (path: string) => {
  const name = path.split('/').pop()!;
  const lower = name.toLowerCase();
  const same = useStore.getState().tree.filter((f) => f.path.split('/').pop()!.toLowerCase() === lower);
  return same.length > 1 ? path : name;
};

async function upload(view: EditorView, notePath: string, files: File[], pos: number, named: (f: File) => string) {
  try {
    const paths: string[] = [];
    for (const file of files) paths.push((await filesApi.uploadAttachment(notePath, file, named(file))).path);
    // Refrescar el árbol antes de insertar, para que el enlace se resuelva al pintarlo
    useStore.getState().setTree(await filesApi.getTree());
    const text = paths.map((p) => `![[${linkTarget(p)}]]`).join('\n');
    const at = Math.min(pos, view.state.doc.length);
    view.dispatch({
      changes: { from: at, insert: text },
      selection: { anchor: at + text.length },
      scrollIntoView: true,
    });
    view.focus();
  } catch (err) {
    notify('imageUpload', t('image.uploadError', { error: (err as Error).message }), 'error');
  }
}

// Botón "Insertar imagen" de la barra de herramientas: en el móvil no hay arrastrar y soltar, y
// el selector de archivos permite elegir de la galería o hacer una foto con la cámara
export function pickImages(view: EditorView, notePath: string) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    const files = imageFiles(input.files);
    if (!files.length) return;
    const { from, to } = view.state.selection.main;
    if (from !== to) view.dispatch({ changes: { from, to } });
    // Las fotos de la cámara se llaman todas igual (image.jpg): mejor con fecha, como al pegar
    upload(view, notePath, files, from, files.length > 1 ? (f) => f.name || pastedName(f) : pastedName);
  };
  input.click();
}

export const imageUpload = (getPath: () => string) =>
  EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFiles(event.clipboardData?.files);
      if (!files.length) return false;
      event.preventDefault();
      const { from, to } = view.state.selection.main;
      if (from !== to) view.dispatch({ changes: { from, to } });
      upload(view, getPath(), files, from, pastedName);
      return true;
    },
    dragover(event) {
      if ([...(event.dataTransfer?.items ?? [])].some((i) => i.kind === 'file')) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    drop(event, view) {
      const files = imageFiles(event.dataTransfer?.files);
      if (!files.length) return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
      upload(view, getPath(), files, pos, (f) => f.name || pastedName(f));
      return true;
    },
  });
