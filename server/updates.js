import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from './logger.js';
const log = createLogger('Updates');

// Aviso de nueva versión: compara la versión del package.json local (la que está en marcha)
// con la del package.json de la rama main en GitHub. Se consulta desde el servidor, con caché,
// para no depender de la CSP del navegador ni pasarse del límite de peticiones de GitHub.
// UPDATE_CHECK=0 lo desactiva (el servidor no se conecta a GitHub)

const REPO = 'loft17/Obsidita';
const REMOTE_PACKAGE = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
export const REPO_URL = `https://github.com/${REPO}`;

const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // con éxito, se vuelve a comprobar a las 6 h
const RETRY_INTERVAL = 30 * 60 * 1000; // si GitHub no responde, a los 30 min
const TIMEOUT = 5000;

const enabled = !['0', 'false', 'no', 'off'].includes((process.env.UPDATE_CHECK || '').trim().toLowerCase());

const current = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')
).version;

// 1 si a > b, -1 si a < b, 0 si son iguales (solo x.y.z numérico; lo demás se ignora)
const compareVersions = (a, b) => {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
};

let latest = null;
let nextCheck = 0;
let pending = null;

const fetchLatest = async () => {
  try {
    const res = await fetch(REMOTE_PACKAGE, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const version = (await res.json()).version;
    if (typeof version !== 'string' || !/^\d+(\.\d+)*$/.test(version)) throw new Error('versión no válida');
    latest = version;
    nextCheck = Date.now() + CHECK_INTERVAL;
  } catch (err) {
    log.warn('No se pudo comprobar si hay una versión nueva:', err.message);
    nextCheck = Date.now() + RETRY_INTERVAL;
  }
};

export const getUpdateStatus = async () => {
  if (enabled && Date.now() >= nextCheck) {
    pending ??= fetchLatest().finally(() => (pending = null));
    await pending;
  }
  return {
    enabled,
    current,
    latest,
    updateAvailable: Boolean(latest) && compareVersions(latest, current) > 0,
    url: REPO_URL,
  };
};
