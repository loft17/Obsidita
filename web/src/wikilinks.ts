// Enlaces internos al estilo Obsidian: [[nota]], [[nota|alias]], [[nota#encabezado]], [[#encabezado]]
import { useStore } from './store';
import { filesApi } from './api';

export interface Wikilink {
  target: string; // ruta o nombre de la nota, sin #encabezado ('' = la propia nota)
  heading: string;
  alias: string;
}

export function parseWikilink(inner: string): Wikilink {
  const bar = inner.indexOf('|');
  const link = (bar < 0 ? inner : inner.slice(0, bar)).trim();
  const hash = link.indexOf('#');
  const target = (hash < 0 ? link : link.slice(0, hash)).trim();
  const heading = hash < 0 ? '' : link.slice(hash + 1).trim();
  const alias = bar < 0 ? '' : inner.slice(bar + 1).trim();
  return { target, heading, alias };
}

// Texto visible del enlace: el alias o, si no hay, lo escrito tal cual
export const wikilinkLabel = (inner: string) => parseWikilink(inner).alias || inner.split('|')[0].trim();

const parentDir = (path: string) => path.split('/').slice(0, -1).join('/');
const lower = (s: string) => s.toLowerCase();

// Ruta de la nota enlazada desde `notePath`, o null si no existe.
// Orden: ruta exacta desde la raíz, relativa a la nota y, por último, por
// nombre en cualquier carpeta (la más cercana a la nota).
export function resolveWikilink(target: string, notePath: string): string | null {
  if (!target) return notePath || null;
  const files = useStore.getState().tree.filter((item) => item.type === 'file');
  const withExt = /\.[^/]+$/.test(target) && !/\.md$/i.test(target) ? target : target.replace(/\.md$/i, '') + '.md';
  const clean = withExt.replace(/^\/+/, '');
  const find = (p: string) => files.find((f) => lower(f.path) === lower(p))?.path;

  const exact = find(clean) ?? find(parentDir(notePath) ? `${parentDir(notePath)}/${clean}` : clean);
  if (exact) return exact;

  const suffix = lower(`/${clean}`);
  const matches = files.filter((f) => lower(`/${f.path}`).endsWith(suffix));
  if (!matches.length) return null;
  const noteDir = parentDir(notePath).split('/');
  const shared = (p: string) => {
    const a = parentDir(p).split('/');
    let n = 0;
    while (n < a.length && n < noteDir.length && a[n] === noteDir[n]) n++;
    return n;
  };
  return matches.sort((x, y) => shared(y.path) - shared(x.path) || x.path.length - y.path.length)[0].path;
}

export const isResolved = (inner: string, notePath: string) =>
  resolveWikilink(parseWikilink(inner).target, notePath) !== null;

// Encabezado o línea al que desplazarse cuando la vista de lectura termine de pintar la nota
let pendingScroll: { path: string; heading?: string; line?: number } | null = null;

const pendingListeners = new Set<() => void>();

// Avisa cuando llega un destino nuevo: la nota puede estar ya abierta y no volver a pintarse
export function subscribePendingScroll(fn: () => void) {
  pendingListeners.add(fn);
  return () => {
    pendingListeners.delete(fn);
  };
}

// Cada una consume solo lo suyo: leer el encabezado no debe descartar una línea pendiente
export function takePendingHeading(path: string) {
  if (pendingScroll?.path !== path || !pendingScroll.heading) return '';
  const { heading } = pendingScroll;
  pendingScroll = null;
  return heading;
}

export function takePendingLine(path: string) {
  if (pendingScroll?.path !== path || !pendingScroll.line) return null;
  const { line } = pendingScroll;
  pendingScroll = null;
  return line;
}

// `line`: 1-indexed sobre el fichero completo (frontmatter incluido), como la devuelve la búsqueda
export function setPendingLine(path: string, line: number) {
  pendingScroll = { path, line };
  pendingListeners.forEach((fn) => fn());
}

// Desplaza `container` hasta el encabezado cuyo texto coincide (sin distinguir mayúsculas)
export function scrollToHeading(container: HTMLElement, heading: string) {
  const wanted = lower(heading.trim());
  const el = [...container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')].find(
    (h) => lower(h.textContent?.trim() ?? '') === wanted
  );
  el?.scrollIntoView({ block: 'start' });
}

// Desplaza `container` hasta el bloque que contiene `bodyLine` (0-indexed sobre el cuerpo):
// solo los inicios de bloque llevan data-line, así que se busca el último que empieza antes
export function scrollToLine(container: HTMLElement, bodyLine: number) {
  let target: HTMLElement | undefined;
  for (const el of container.querySelectorAll<HTMLElement>('[data-line]')) {
    if (Number(el.dataset.line) <= bodyLine) target = el;
  }
  target?.scrollIntoView({ block: 'center' });
}

// Abre la nota enlazada; si no existe la crea en la raíz del vault, como Obsidian
export async function followWikilink(inner: string, notePath: string, newTab = false) {
  const { target, heading } = parseWikilink(inner);
  let path = resolveWikilink(target, notePath);
  const created = !path;
  if (!path) {
    path = target.replace(/^\/+/, '').replace(/\.md$/i, '') + '.md';
    try {
      await filesApi.createNote(path);
      useStore.getState().setTree(await filesApi.getTree());
    } catch (err) {
      console.error('No se pudo crear la nota enlazada:', err);
      return;
    }
  }
  pendingScroll = heading ? { path, heading } : null;
  const name = path.split('/').pop() || path;
  const { addTab, setActiveTab, openFile, setEditMode } = useStore.getState();
  if (newTab) {
    addTab(path, name);
    setActiveTab(path);
  } else {
    openFile(path, name);
  }
  // Recién creada: se abre en modo edición
  if (created) setEditMode(true);
}
