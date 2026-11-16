// Compatibilidad con el plugin de marcadores de Obsidian: lee y escribe SOLO
// .obsidian/bookmarks.json. El resto de .obsidian sigue bloqueado (vault.js), porque ahí están
// los plugins de escritorio que ejecutan código al sincronizar.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'fs';
import { join, resolve, relative, isAbsolute } from 'path';
import { writeFileAtomic } from './dataFiles.js';
import { isSafeVaultPath } from './bookmarks.js';
import { randomBytes } from 'crypto';

const MAX_FILE_BYTES = 1024 * 1024;

const newId = () => randomBytes(8).toString('hex');

// Carpeta .obsidian de la bóveda, comprobando que es una carpeta real dentro de la bóveda (sin enlaces simbólicos)
const obsidianDir = (vaultPath, { create = false } = {}) => {
  const root = realpathSync(resolve(vaultPath));
  const dir = join(root, '.obsidian');
  if (!existsSync(dir)) {
    if (!create) return null;
    mkdirSync(dir);
  }
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('.obsidian no es una carpeta normal');
  const rel = relative(root, realpathSync(dir));
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Ruta protegida');
  return dir;
};

const readObsidianJson = (vaultPath) => {
  const dir = obsidianDir(vaultPath);
  if (!dir) return null;
  const file = join(dir, 'bookmarks.json');
  if (!existsSync(file)) return null;
  const st = lstatSync(file);
  if (st.isSymbolicLink() || !st.isFile()) throw new Error('bookmarks.json no es un archivo normal');
  if (st.size > MAX_FILE_BYTES) throw new Error('bookmarks.json es demasiado grande');
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('bookmarks.json de Obsidian no es un JSON válido');
  }
  return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
};

// Convierte un marcador de Obsidian ({type:'file', path, subpath:'#Encabezado'}...) al nuestro.
// Devuelve null para lo que no soportamos (búsquedas, bloques, formatos raros)
const fromObsidian = (raw, group) => {
  if (!raw || typeof raw !== 'object') return null;
  const label = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 200) : undefined;
  const base = { id: newId(), group, label };
  if (raw.type === 'folder' && isSafeVaultPath(raw.path)) {
    return { ...base, type: 'folder', path: raw.path };
  }
  if (raw.type === 'file' && isSafeVaultPath(raw.path)) {
    const sub = typeof raw.subpath === 'string' ? raw.subpath : '';
    // Enlaces a bloques (#^id) no tienen equivalente: se importan como la nota
    if (sub.startsWith('#') && !sub.startsWith('#^') && sub.length > 1) {
      const heading = sub.slice(1).split('#').pop().trim();
      if (heading && heading.length <= 300) return { ...base, type: 'heading', path: raw.path, heading };
    }
    return { ...base, type: 'file', path: raw.path };
  }
  return null;
};

// Lee .obsidian/bookmarks.json y devuelve los marcadores en nuestro formato, sin guardar nada
export const importFromObsidian = (vaultPath) => {
  const json = readObsidianJson(vaultPath);
  if (!json) return { groups: [], items: [], skipped: 0 };
  const groups = new Set();
  const items = [];
  let skipped = 0;
  const visit = (list, group) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      if (raw?.type === 'group') {
        // Los grupos anidados se aplanan: el marcador queda en el grupo más externo
        const name = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 60) : 'Obsidian';
        if (group) visit(raw.items, group);
        else {
          groups.add(name);
          visit(raw.items, name);
        }
        continue;
      }
      const item = fromObsidian(raw, group);
      if (item) items.push(item);
      else skipped++;
    }
  };
  visit(json.items, undefined);
  return { groups: [...groups], items, skipped };
};

const toObsidian = (item) => {
  const title = item.label || undefined;
  if (item.type === 'folder') return { type: 'folder', path: item.path, ...(title && { title }) };
  if (item.type === 'heading') return { type: 'file', path: item.path, subpath: `#${item.heading}`, ...(title && { title }) };
  return { type: 'file', path: item.path, ...(title && { title }) };
};

// Escribe nuestros marcadores en .obsidian/bookmarks.json. Lo que Obsidian tenga y nosotros no
// manejamos (búsquedas guardadas, por ejemplo) se conserva tal cual
export const exportToObsidian = (vaultPath, store) => {
  const existing = readObsidianJson(vaultPath) ?? {};
  const kept = (Array.isArray(existing.items) ? existing.items : []).filter(
    (raw) => !['file', 'folder', 'group'].includes(raw?.type),
  );
  const ungrouped = store.items.filter((i) => !i.group).map(toObsidian);
  const groupBlocks = store.groups
    .map((name) => ({
      type: 'group',
      title: name,
      items: store.items.filter((i) => i.group === name).map(toObsidian),
    }))
    .filter((g) => g.items.length > 0);
  const json = { ...existing, items: [...groupBlocks, ...ungrouped, ...kept] };
  const dir = obsidianDir(vaultPath, { create: true });
  writeFileAtomic(join(dir, 'bookmarks.json'), JSON.stringify(json, null, 2), 0o644);
  return { exported: store.items.length, kept: kept.length };
};
