import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, rmSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';
import { writeFileAtomic } from './dataFiles.js';
import { createLogger } from './logger.js';
const log = createLogger('LocalHistory');

// Historial local de las notas: copias del contenido anterior de cada nota que se guardan
// al editarla, en data/local_history/<ruta-de-la-nota>/<fecha>.md. Está fuera del vault
// (no aparece en el árbol ni en el Git de la sincronización); la descarga del vault puede
// incluirlo con ?history=1.

const DIR = 'local_history';
// Historial de los elementos de la papelera: data/local_history/.trash/<id de la papelera>/
const TRASH = '.trash';
const CONFIG = 'local_history.json';
const DAY = 24 * 60 * 60 * 1000;

// Opciones permitidas (la interfaz solo ofrece estas)
// 0 = en cada guardado (solo se omite si el contenido es igual al de la última copia)
export const INTERVAL_MINUTES = [0, 1, 5, 15, 30, 60];
export const MAX_VERSIONS = [5, 10, 20, 50, 100];
export const MAX_DAYS = [0, 7, 30, 90, 365]; // 0 = sin límite de días
const DEFAULTS = { enabled: false, intervalMinutes: 5, maxVersions: 20, maxDays: 30 };
const ID = /^[0-9TZ-]+\.md$/;

const sha = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Copias pendientes: contenido guardado dentro del intervalo, que se escribe al terminar el intervalo.
// Clave: carpeta del historial + ruta de la nota
const pending = new Map();
const nameFor = (ms) => `${new Date(ms).toISOString().replace(/[:.]/g, '-')}.md`;

export const createLocalHistory = (dataDir) => {
  const root = join(dataDir, DIR);
  const configPath = join(dataDir, CONFIG);

  const getConfig = () => {
    let saved = {};
    try {
      if (existsSync(configPath)) saved = JSON.parse(readFileSync(configPath, 'utf8')) ?? {};
    } catch (err) {
      log.warn('No se pudo leer local_history.json:', err.message);
    }
    return {
      enabled: saved.enabled === true,
      intervalMinutes: INTERVAL_MINUTES.includes(saved.intervalMinutes) ? saved.intervalMinutes : DEFAULTS.intervalMinutes,
      maxVersions: MAX_VERSIONS.includes(saved.maxVersions) ? saved.maxVersions : DEFAULTS.maxVersions,
      maxDays: MAX_DAYS.includes(saved.maxDays) ? saved.maxDays : DEFAULTS.maxDays,
    };
  };

  // Cambios parciales. Valores fuera de las opciones permitidas lanzan error
  const setConfig = (changes = {}) => {
    const next = { ...getConfig() };
    if (changes.enabled !== undefined) {
      if (typeof changes.enabled !== 'boolean') throw new Error('Valor no válido');
      next.enabled = changes.enabled;
    }
    const numeric = [
      ['intervalMinutes', INTERVAL_MINUTES],
      ['maxVersions', MAX_VERSIONS],
      ['maxDays', MAX_DAYS],
    ];
    for (const [key, allowed] of numeric) {
      if (changes[key] === undefined) continue;
      if (!allowed.includes(Number(changes[key]))) throw new Error('Valor no válido');
      next[key] = Number(changes[key]);
    }
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    writeFileAtomic(configPath, JSON.stringify(next, null, 2));
    return next;
  };

  // Carpeta de una nota (ruta relativa al vault). Sin ".." ni rutas absolutas: no puede salir de root
  const noteDir = (notePath) => {
    const parts = String(notePath ?? '').replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length || parts.some((p) => p === '.' || p === '..')) throw new Error('Ruta no válida');
    return join(root, ...parts);
  };

  const pendingKey = (notePath) => `${root}\u0000${notePath}`;

  const checkId = (id) => {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('Versión no válida');
    return id;
  };

  // Versiones de una nota, de la más nueva a la más antigua
  const listFiles = (dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && ID.test(e.name))
      .map((e) => {
        const st = statSync(join(dir, e.name));
        return { id: e.name, time: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => (a.id < b.id ? 1 : -1));
  };

  const list = (notePath) => listFiles(noteDir(notePath)).map(({ id, time, size }) => ({ id, date: time, size }));

  // Borra las versiones que sobrepasan el número máximo o la antigüedad configurada
  const prune = (notePath, cfg) => {
    const dir = noteDir(notePath);
    const cutoff = cfg.maxDays ? Date.now() - cfg.maxDays * DAY : 0;
    listFiles(dir).forEach((v, i) => {
      if (i >= cfg.maxVersions || (cutoff && v.time < cutoff)) rmSync(join(dir, v.id), { force: true });
    });
  };

  // Escribe `content` como nueva versión, salvo que sea igual a la última. Devuelve true si la guardó
  const writeIfNew = (notePath, content, cfg) => {
    const dir = noteDir(notePath);
    const last = listFiles(dir)[0];
    if (last && sha(readFileSync(join(dir, last.id), 'utf8')) === sha(content)) return false;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Dos copias pueden caer en el mismo milisegundo: se desplaza el nombre para no sobrescribir
    let stamp = Date.now();
    while (existsSync(join(dir, nameFor(stamp)))) stamp++;
    writeFileAtomic(join(dir, nameFor(stamp)), content);
    prune(notePath, cfg);
    return true;
  };

  // Escribe la copia pendiente de una nota (si la hay) ahora, sin esperar al intervalo
  const flushPending = (notePath) => {
    const key = pendingKey(notePath);
    const entry = pending.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(key);
    const cfg = getConfig();
    if (!cfg.enabled) return false;
    try {
      return writeIfNew(notePath, entry.content, cfg);
    } catch (err) {
      log.warn('No se pudo guardar la copia pendiente:', err.message);
      return false;
    }
  };

  // Pendientes de una nota o de todo lo que hay dentro de una carpeta
  const flushPendingUnder = (notePath) => {
    const rel = String(notePath ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const prefix = `${root}\u0000`;
    for (const key of [...pending.keys()]) {
      if (!key.startsWith(prefix)) continue;
      const path = key.slice(prefix.length);
      if (path === rel || path.startsWith(`${rel}/`)) flushPending(path);
    }
  };

  // Registra un guardado. `previous` es el contenido antes del guardado y `current` el que se acaba
  // de escribir. La primera vez se guarda también `previous` como versión de partida. Después:
  //  - si ha pasado el intervalo desde la última copia, se guarda `current`;
  //  - si no, se queda pendiente y se escribe cuando termine el intervalo (así el último estado
  //    nunca se pierde). Con frecuencia 0 cada guardado se copia al momento.
  // Devuelve true si escribió una versión ahora
  const record = (notePath, previous, current) => {
    const cfg = getConfig();
    if (!cfg.enabled || typeof current !== 'string') return false;
    const dir = noteDir(notePath);
    if (!listFiles(dir).length && typeof previous === 'string' && previous.length) {
      writeIfNew(notePath, previous, cfg);
    }
    const last = listFiles(dir)[0];
    const waitMs = last ? cfg.intervalMinutes * 60 * 1000 - (Date.now() - last.time) : 0;
    const key = pendingKey(notePath);
    if (waitMs <= 0) {
      const entry = pending.get(key);
      if (entry) {
        clearTimeout(entry.timer);
        pending.delete(key);
      }
      return writeIfNew(notePath, current, cfg);
    }
    const entry = pending.get(key) ?? {};
    entry.content = current;
    if (!entry.timer) {
      entry.timer = setTimeout(() => flushPending(notePath), waitMs);
      entry.timer.unref?.();
    }
    pending.set(key, entry);
    return false;
  };

  const readVersion = (notePath, id) => {
    checkId(id);
    return readFileSync(join(noteDir(notePath), id), 'utf8');
  };

  const removeVersion = (notePath, id) => {
    checkId(id);
    rmSync(join(noteDir(notePath), id), { force: true });
  };

  // Sin ruta: vacía todo el historial. Con ruta: solo el de esa nota (o carpeta)
  const clear = (notePath) => {
    rmSync(notePath ? noteDir(notePath) : root, { recursive: true, force: true });
  };

  // Mueve una carpeta de historial. Si el destino ya tiene historial, lo fusiona
  const mergeInto = (src, dst) => {
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const from = join(src, entry.name);
      const to = join(dst, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true, mode: 0o700 });
        mergeInto(from, to);
      } else if (entry.isFile()) {
        renameSync(from, to);
      }
    }
    rmSync(src, { recursive: true, force: true });
  };

  const moveDir = (src, dst) => {
    if (!existsSync(src)) return;
    if (existsSync(dst)) {
      mergeInto(src, dst);
    } else {
      mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
      renameSync(src, dst);
    }
  };

  // Al renombrar una nota o carpeta, su historial la sigue
  const move = (oldPath, newPath) => {
    flushPendingUnder(oldPath);
    moveDir(noteDir(oldPath), noteDir(newPath));
  };

  // Carpeta de un elemento de la papelera (su id es el nombre dentro de .trash del vault)
  const trashDirFor = (id) => {
    const name = String(id ?? '');
    if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Elemento no válido');
    return join(root, TRASH, name);
  };

  // Al borrar una nota pasa a la papelera del vault: su historial se guarda junto a ese elemento
  const moveToTrash = (notePath, trashId) => {
    flushPendingUnder(notePath);
    moveDir(noteDir(notePath), trashDirFor(trashId));
  };

  // Al restaurar vuelve a la ruta donde quedó la nota
  const restoreFromTrash = (trashId, notePath) => moveDir(trashDirFor(trashId), noteDir(notePath));

  // Borrado definitivo de un elemento de la papelera, o de toda la papelera
  const purgeTrash = (trashId) => rmSync(trashDirFor(trashId), { recursive: true, force: true });
  const emptyTrash = () => rmSync(join(root, TRASH), { recursive: true, force: true });

  // Espacio ocupado: bytes, número de versiones y de notas que tienen alguna
  const usage = () => {
    const out = { bytes: 0, versions: 0, notes: 0 };
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      let hasVersions = false;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && ID.test(entry.name)) {
          out.bytes += statSync(full).size;
          out.versions++;
          hasVersions = true;
        }
      }
      if (hasVersions) out.notes++;
    };
    walk(root);
    return out;
  };

  return {
    root,
    getConfig,
    setConfig,
    list,
    record,
    readVersion,
    removeVersion,
    clear,
    move,
    moveToTrash,
    restoreFromTrash,
    purgeTrash,
    emptyTrash,
    usage,
  };
};
