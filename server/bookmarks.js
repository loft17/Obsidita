// Marcadores de la web (archivos, encabezados y carpetas) guardados en data/bookmarks.json.
// Como las preferencias, viven en el servidor para que los vean todos los dispositivos.
// Las rutas son relativas a la bóveda, con '/' como separador (igual que el árbol de /files/tree).
import { readFileSync } from 'fs';
import { join } from 'path';
import { writeFileAtomic } from './dataFiles.js';
import { createLogger } from './logger.js';
const log = createLogger('Bookmarks');

export const BOOKMARK_TYPES = ['file', 'heading', 'folder'];
export const MAX_BOOKMARKS = 1000;
export const MAX_GROUPS = 100;
const MAX_PATH = 1024;
const MAX_HEADING = 300;
const MAX_LABEL = 200;
const MAX_GROUP_NAME = 60;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const emptyStore = () => ({ groups: [], items: [] });

// Vault-relative path check: no vacío, sin '..', sin '.' ni '' en medio, sin barra inicial,
// sin carpetas ocultas (.obsidian, .git, .trash) que la web no gestiona
export const isSafeVaultPath = (p) => {
  if (typeof p !== 'string' || !p || p.length > MAX_PATH) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  const parts = p.split('/');
  return parts.every((s) => s && s !== '.' && s !== '..') && !parts[0].startsWith('.');
};

const readStore = (dataDir) => {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, 'bookmarks.json'), 'utf8'));
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !Array.isArray(raw.groups)) return emptyStore();
    return { groups: raw.groups, items: raw.items };
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn('No se pudo leer bookmarks.json:', err.message);
    return emptyStore();
  }
};

const writeStore = (dataDir, store) => {
  writeFileAtomic(join(dataDir, 'bookmarks.json'), JSON.stringify(store, null, 2));
};

export const getBookmarks = (dataDir) => readStore(dataDir);

// Valida y normaliza una lista completa enviada por el cliente. Lanza Error con un mensaje
// legible si algo no encaja; nunca confía en campos extra
export const normalizeBookmarks = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Marcadores no válidos');
  const { groups, items } = body;
  if (!Array.isArray(groups) || !Array.isArray(items)) throw new Error('Marcadores no válidos');
  if (groups.length > MAX_GROUPS) throw new Error('Demasiados grupos de marcadores');
  if (items.length > MAX_BOOKMARKS) throw new Error('Demasiados marcadores');

  const cleanGroups = [];
  for (const g of groups) {
    if (typeof g !== 'string') throw new Error('Grupo no válido');
    const name = g.trim();
    if (!name || name.length > MAX_GROUP_NAME) throw new Error('Nombre de grupo no válido');
    if (cleanGroups.includes(name)) throw new Error('Grupo repetido');
    cleanGroups.push(name);
  }

  const ids = new Set();
  const cleanItems = items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Marcador no válido');
    const { id, type, path } = raw;
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) throw new Error('Identificador de marcador no válido');
    ids.add(id);
    if (!BOOKMARK_TYPES.includes(type)) throw new Error('Tipo de marcador no válido');
    if (!isSafeVaultPath(path)) throw new Error('Ruta de marcador no válida');
    const item = { id, type, path };
    if (type === 'heading') {
      const heading = typeof raw.heading === 'string' ? raw.heading.trim() : '';
      if (!heading || heading.length > MAX_HEADING || /[\r\n]/.test(heading)) throw new Error('Encabezado no válido');
      item.heading = heading;
    }
    if (raw.label !== undefined && raw.label !== null && raw.label !== '') {
      if (typeof raw.label !== 'string' || raw.label.length > MAX_LABEL) throw new Error('Etiqueta no válida');
      item.label = raw.label.trim();
    }
    if (raw.group !== undefined && raw.group !== null && raw.group !== '') {
      if (typeof raw.group !== 'string' || !cleanGroups.includes(raw.group)) throw new Error('Grupo no válido');
      item.group = raw.group;
    }
    if (Number.isFinite(raw.createdAt)) item.createdAt = raw.createdAt;
    return item;
  });

  return { groups: cleanGroups, items: cleanItems };
};

export const saveBookmarks = (dataDir, body) => {
  const store = normalizeBookmarks(body);
  writeStore(dataDir, store);
  return store;
};

// Al renombrar o mover un archivo o una carpeta, sus marcadores (y los de lo que contiene) siguen
// la nueva ruta. Se llama desde la ruta de renombrado de los archivos, tras moverlos en disco
export const remapBookmarks = (dataDir, oldPath, newPath) => {
  const store = readStore(dataDir);
  let changed = false;
  for (const item of store.items) {
    if (item.path === oldPath || item.path.startsWith(oldPath + '/')) {
      item.path = newPath + item.path.slice(oldPath.length);
      changed = true;
    }
  }
  if (changed) writeStore(dataDir, store);
};

// Une marcadores importados a los actuales sin duplicar los que ya existen (mismo tipo, ruta y encabezado)
export const mergeBookmarks = (dataDir, incoming) => {
  const store = readStore(dataDir);
  const keyOf = (i) => `${i.type}\u0000${i.path}\u0000${i.heading ?? ''}`;
  const existing = new Set(store.items.map(keyOf));
  let added = 0;
  let skipped = 0;
  for (const item of incoming.items) {
    if (existing.has(keyOf(item)) || store.items.length >= MAX_BOOKMARKS) {
      skipped++;
      continue;
    }
    if (item.group && !store.groups.includes(item.group)) {
      if (store.groups.length >= MAX_GROUPS) {
        skipped++;
        continue;
      }
      store.groups.push(item.group);
    }
    store.items.push(item);
    existing.add(keyOf(item));
    added++;
  }
  // Los grupos de los importados se dejan ya validados por el llamador
  writeStore(dataDir, normalizeBookmarks(store));
  return { added, skipped, store: readStore(dataDir) };
};
