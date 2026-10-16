import * as vault from './vault.js';
import {
  SEARCH_MAX_FILE_BYTES as MAX_FILE_SIZE,
  SEARCH_MAX_SCANNED_BYTES as MAX_INDEX_BYTES,
} from './limits.js';

// Índice en memoria de las notas para la búsqueda. En cada consulta se recorre el árbol
// (solo stat, sin leer) y se vuelven a leer únicamente las notas cuya fecha de modificación
// o tamaño han cambiado. Así se recogen tanto lo guardado desde la web como los cambios
// de la sincronización con GitHub o de Obsidian de escritorio, sin vigilar la carpeta.
// Las notas que se pasan de los límites de tamaño no se indexan (ni se buscan)

// Mientras se escribe en el buscador llegan varias consultas seguidas: el resultado del
// recorrido se reutiliza durante SNAPSHOT_TTL. Cualquier cambio hecho desde la web lo
// invalida al momento (invalidateSnapshot, en index.js); los de fuera tardan como mucho eso
const SNAPSHOT_TTL = 2500;
let cached = null; // { vaultPath, at, out }

export const invalidateSnapshot = () => {
  cached = null;
};

let indexedVault = null;
const notes = new Map(); // ruta → { mtime, size, content, lower, tags }

// Las líneas no se guardan (duplicarían la memoria del índice): se calculan solo para las
// notas que coinciden con la búsqueda
export const noteLines = (note) => note.content.split(/\r?\n/);

const load = (vaultPath, file) => {
  try {
    const content = vault.readFile(vaultPath, file.path);
    return { mtime: file.mtime, size: file.size, content, lower: content.toLowerCase(), tags: null };
  } catch {
    return null; // Archivo ilegible: se omite
  }
};

// Árbol del vault con el contenido de cada nota indexada: [{ file, note }], note null si no se indexa
export function snapshot(vaultPath) {
  if (cached && cached.vaultPath === vaultPath && Date.now() - cached.at < SNAPSHOT_TTL) return cached.out;
  if (indexedVault !== vaultPath) {
    notes.clear();
    indexedVault = vaultPath;
  }
  const tree = vault.listTree(vaultPath);
  const seen = new Set();
  const out = [];
  let total = 0;
  for (const file of tree) {
    let note = null;
    if (file.type === 'file' && file.size <= MAX_FILE_SIZE && total + file.size <= MAX_INDEX_BYTES) {
      total += file.size;
      seen.add(file.path);
      note = notes.get(file.path);
      if (!note || note.mtime !== file.mtime || note.size !== file.size) {
        note = load(vaultPath, file);
        if (note) notes.set(file.path, note);
        else notes.delete(file.path);
      }
    }
    out.push({ file, note });
  }
  // Fuera lo borrado, renombrado o que ya no cabe
  for (const path of notes.keys()) if (!seen.has(path)) notes.delete(path);
  cached = { vaultPath, at: Date.now(), out };
  return out;
}
