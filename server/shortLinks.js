// Enlaces cortos privados: código → ruta de una nota o carpeta del vault (data/shortlinks.json).
// Los crea y los borra el usuario a mano; una nota puede tener varios o ninguno. Abrir el enlace
// exige sesión: la ruta pública solo redirige a la app, que pide la ruta a la API protegida.
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { writeFileAtomic } from './dataFiles.js';
import { isSafeVaultPath } from './bookmarks.js';
import { createLogger } from './logger.js';
const log = createLogger('ShortLinks');

export const CODE = /^[A-Za-z0-9_-]{3,32}$/;
// Rutas de la propia web: un enlace con estos nombres nunca llegaría a abrirse
export const RESERVED_CODES = new Set(['api', 'assets', 'healthz', 'go']);
export const MAX_LINKS = 500;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const AUTO_LENGTH = 6;

const readStore = (dataDir) => {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, 'shortlinks.json'), 'utf8'));
    if (Array.isArray(raw?.links)) return { links: raw.links };
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn('No se pudo leer shortlinks.json:', err.message);
  }
  return { links: [] };
};

const writeStore = (dataDir, store) => {
  writeFileAtomic(join(dataDir, 'shortlinks.json'), JSON.stringify(store, null, 2));
};

export const listLinks = (dataDir) => readStore(dataDir).links;

export const findLink = (dataDir, code) => readStore(dataDir).links.find((l) => l.code === code) ?? null;

// Código aleatorio sin ambigüedades de lectura en el que no se repita ninguno existente
const randomCode = (taken) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(AUTO_LENGTH);
    let code = '';
    for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
    if (!taken.has(code) && !RESERVED_CODES.has(code)) return code;
  }
  throw new Error('No se pudo generar un código libre');
};

export const createLink = (dataDir, { path, code }) => {
  if (!isSafeVaultPath(path)) throw new Error('Ruta no válida');
  const store = readStore(dataDir);
  if (store.links.length >= MAX_LINKS) throw new Error('Demasiados enlaces cortos');
  const taken = new Set(store.links.map((l) => l.code));
  let finalCode;
  if (code === undefined || code === null || code === '') {
    finalCode = randomCode(taken);
  } else {
    if (typeof code !== 'string' || !CODE.test(code)) {
      throw new Error('El código solo puede tener letras, números, guion y guion bajo (3 a 32 caracteres)');
    }
    if (RESERVED_CODES.has(code)) throw new Error('Ese código está reservado');
    finalCode = code;
  }
  if (taken.has(finalCode)) throw new Error('Ese código ya existe');
  const link = { code: finalCode, path, createdAt: Date.now() };
  store.links.push(link);
  writeStore(dataDir, store);
  return link;
};

export const removeLink = (dataDir, code) => {
  const store = readStore(dataDir);
  const next = store.links.filter((l) => l.code !== code);
  if (next.length === store.links.length) throw new Error('El enlace no existe');
  writeStore(dataDir, { links: next });
};

// Al renombrar o mover una nota o carpeta, sus enlaces siguen a la nueva ruta (igual que los marcadores)
export const remapLinks = (dataDir, oldPath, newPath) => {
  const store = readStore(dataDir);
  let changed = false;
  for (const link of store.links) {
    if (link.path === oldPath || link.path.startsWith(oldPath + '/')) {
      link.path = newPath + link.path.slice(oldPath.length);
      changed = true;
    }
  }
  if (changed) writeStore(dataDir, store);
};
