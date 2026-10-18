// Subida de archivos y carpetas arrastrados desde el sistema al explorador de archivos.
// Solo se suben las extensiones permitidas en Preferencias (por defecto, notas e imágenes); el
// resto se ignora. Las carpetas soltadas se recrean dentro de la carpeta destino con su
// estructura (solo con lo que se sube)
import { filesApi, settingsApi } from './api';

const uploadable = (extensions: string[]) => {
  const allowed = new Set(extensions);
  return (name: string) => {
    const dot = name.lastIndexOf('.');
    return dot > 0 && allowed.has(name.slice(dot + 1).toLowerCase());
  };
};

interface PendingFile {
  dir: string; // subcarpeta relativa a la carpeta destino ('' = la propia carpeta)
  file: File;
}

// ¿El arrastre trae archivos del sistema (y no un elemento del propio explorador)?
export const hasExternalFiles = (dt: DataTransfer | null) => !!dt && [...dt.types].includes('Files');

const readAllEntries = async (dir: FileSystemDirectoryEntry) => {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  // readEntries devuelve los elementos por tandas: se repite hasta que llega vacía
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return all;
    all.push(...batch);
  }
};

const entryFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));

async function collect(entry: FileSystemEntry, dir: string, out: PendingFile[], isUploadable: (name: string) => boolean) {
  // Ocultos (.git, .obsidian, .DS_Store...) no se suben
  if (entry.name.startsWith('.')) return;
  if (entry.isFile) {
    if (isUploadable(entry.name)) out.push({ dir, file: await entryFile(entry as FileSystemFileEntry) });
  } else if (entry.isDirectory) {
    const sub = dir ? `${dir}/${entry.name}` : entry.name;
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) await collect(child, sub, out, isUploadable);
  }
}

// Hay que leer las entradas en el mismo evento `drop`: después el navegador vacía el dataTransfer
export function droppedEntries(dt: DataTransfer) {
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of [...dt.items]) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }
  return { entries, loose };
}

// Sube lo soltado a `folder` ('' = raíz). Devuelve cuántos se han subido y los errores
export async function uploadDropped(folder: string, dropped: ReturnType<typeof droppedEntries>) {
  const isUploadable = uploadable((await settingsApi.getUploads()).extensions);
  const pending: PendingFile[] = dropped.loose.filter((f) => isUploadable(f.name)).map((file) => ({ dir: '', file }));
  for (const entry of dropped.entries) await collect(entry, '', pending, isUploadable);

  const errors: string[] = [];
  let uploaded = 0;
  for (const { dir, file } of pending) {
    const target = [folder, dir].filter(Boolean).join('/');
    try {
      await filesApi.uploadToFolder(target, file, file.name);
      uploaded++;
    } catch (err) {
      errors.push(`${file.name}: ${(err as Error).message}`);
    }
  }
  return { uploaded, errors };
}
