// Contenido de las notas incrustadas con ![[nota]]. El markdown se pinta de forma síncrona,
// así que las notas se leen en segundo plano y, al llegar, se avisa para volver a pintar
import { filesApi } from './api';

interface Entry {
  content: string | null; // null: no se pudo leer
  stale: boolean; // se muestra, pero se vuelve a leer la próxima vez que se pida
}

const cache = new Map<string, Entry>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const notify = () => {
  version++;
  listeners.forEach((fn) => fn());
};

function load(path: string) {
  if (loading.has(path)) return;
  loading.add(path);
  filesApi.readFile(path).then(
    ({ content }) => {
      loading.delete(path);
      const prev = cache.get(path);
      cache.set(path, { content, stale: false });
      if (prev?.content !== content) notify();
    },
    () => {
      loading.delete(path);
      const prev = cache.get(path);
      // Sin conexión: se mantiene lo que ya se mostraba
      cache.set(path, { content: prev?.content ?? null, stale: false });
      if (!prev) notify();
    },
  );
}

// Contenido de la nota; undefined mientras se carga por primera vez
export function getEmbedContent(path: string): string | null | undefined {
  const entry = cache.get(path);
  if (!entry || entry.stale) load(path);
  return entry?.content;
}

// Nota guardada desde el editor: las incrustaciones muestran ya la versión nueva
export function setEmbedContent(path: string, content: string) {
  const prev = cache.get(path);
  if (!prev || prev.content === content) return;
  cache.set(path, { content, stale: false });
  notify();
}

// Las notas pueden haber cambiado fuera (otro dispositivo, sincronización, renombrados...):
// se siguen mostrando y se vuelven a leer al pintar
export function refreshEmbeds() {
  if (!cache.size) return;
  for (const entry of cache.values()) entry.stale = true;
  notify();
}

export const subscribeEmbeds = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getEmbedsVersion = () => version;

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

// Parte de la nota que se incrusta: con #encabezado, esa sección (hasta el siguiente
// encabezado del mismo nivel o superior); con #^bloque, el párrafo marcado con ^bloque.
// null si no se encuentra
export function embedSection(body: string, heading: string): string | null {
  if (!heading) return body;
  const lines = body.split('\n');

  if (heading.startsWith('^')) {
    const marker = new RegExp(`\\s\\^${heading.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
    const at = lines.findIndex((l) => marker.test(` ${l}`));
    if (at < 0) return null;
    let start = at;
    while (start > 0 && lines[start - 1].trim() && !HEADING.test(lines[start - 1])) start--;
    return lines
      .slice(start, at + 1)
      .join('\n')
      .replace(marker, '');
  }

  const wanted = heading.trim().toLowerCase();
  let inFence = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const m = HEADING.exec(lines[i]);
    if (!m) continue;
    if (start < 0) {
      if (m[2].trim().toLowerCase() === wanted) {
        start = i;
        level = m[1].length;
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start < 0 ? null : lines.slice(start).join('\n');
}
