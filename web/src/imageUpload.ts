// Subida de imágenes al pegar desde el portapapeles o arrastrar y soltar en el editor
import { StateEffect, StateField } from '@codemirror/state';
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

// Tramos donde irá cada subida en curso. Se mapean con cada cambio del documento, así que
// lo que se escriba mientras tanto no desplaza el enlace a otro sitio. Si se cambia de nota
// el estado se sustituye entero y el tramo desaparece: no se inserta nada en la otra nota
type Pending = { from: number; to: number };
const addPending = StateEffect.define<{ id: number } & Pending>();
const removePending = StateEffect.define<number>();
const pendingUploads = StateField.define<Map<number, Pending>>({
  create: () => new Map(),
  update(value, tr) {
    let next = value;
    if (tr.docChanged && value.size) {
      next = new Map();
      for (const [id, { from, to }] of value) {
        // Sin selección, lo escrito justo en ese punto queda detrás de la imagen. Con selección,
        // el tramo no crece por los bordes para no borrar lo que se escriba junto a él
        if (from === to) {
          const at = tr.changes.mapPos(from, -1);
          next.set(id, { from: at, to: at });
        } else {
          const a = tr.changes.mapPos(from, 1);
          next.set(id, { from: a, to: Math.max(a, tr.changes.mapPos(to, -1)) });
        }
      }
    }
    for (const e of tr.effects) {
      if (e.is(addPending)) {
        if (next === value) next = new Map(value);
        next.set(e.value.id, { from: e.value.from, to: e.value.to });
      } else if (e.is(removePending) && next.has(e.value)) {
        if (next === value) next = new Map(value);
        next.delete(e.value);
      }
    }
    return next;
  },
});

let nextId = 0;

// La selección no se borra hasta que la subida ha ido bien: si falla, el texto sigue ahí
async function upload(view: EditorView, notePath: string, files: File[], range: Pending, named: (f: File) => string) {
  const id = nextId++;
  const effects: StateEffect<unknown>[] = [addPending.of({ id, ...range })];
  if (!view.state.field(pendingUploads, false)) effects.unshift(StateEffect.appendConfig.of(pendingUploads));
  view.dispatch({ effects });
  try {
    const paths: string[] = [];
    for (const file of files) paths.push((await filesApi.uploadAttachment(notePath, file, named(file))).path);
    // Refrescar el árbol antes de insertar, para que el enlace se resuelva al pintarlo
    useStore.getState().setTree(await filesApi.getTree());
    const target = view.state.field(pendingUploads, false)?.get(id);
    // Editor cerrado u otra nota abierta: la imagen ya está subida, pero no hay dónde enlazarla
    if (!target || !view.dom.isConnected) return;
    const text = paths.map((p) => `![[${linkTarget(p)}]]`).join('\n');
    view.dispatch({
      changes: { from: target.from, to: target.to, insert: text },
      selection: { anchor: target.from + text.length },
      effects: removePending.of(id),
      scrollIntoView: true,
    });
    view.focus();
  } catch (err) {
    if (view.state.field(pendingUploads, false)?.has(id)) view.dispatch({ effects: removePending.of(id) });
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
    // Las fotos de la cámara se llaman todas igual (image.jpg): mejor con fecha, como al pegar
    upload(view, notePath, files, { from, to }, files.length > 1 ? (f) => f.name || pastedName(f) : pastedName);
  };
  input.click();
}

export const imageUpload = (getPath: () => string) => [
  pendingUploads,
  EditorView.domEventHandlers({
    paste(event, view) {
      const files = imageFiles(event.clipboardData?.files);
      if (!files.length) return false;
      event.preventDefault();
      const { from, to } = view.state.selection.main;
      upload(view, getPath(), files, { from, to }, pastedName);
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
      upload(view, getPath(), files, { from: pos, to: pos }, (f) => f.name || pastedName(f));
      return true;
    },
  }),
];
