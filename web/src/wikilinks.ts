// Enlaces internos al estilo Obsidian: [[nota]], [[nota|alias]], [[nota#encabezado]], [[#encabezado]]
import { useStore } from './store';
import { filesApi } from './api';
import { rawFileUrl } from './attachments';
import { resolveWikilink as resolveInVault } from '../../shared/wikilinks.js';
import { fileName } from './paths';
import log from './logger';

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

const lower = (s: string) => s.toLowerCase();

// Ruta del archivo (nota o adjunto) enlazado desde `notePath`, o null si no existe.
// La lógica es la misma que usa el servidor al actualizar enlaces: ver shared/wikilinks.js
export function resolveWikilink(target: string, notePath: string): string | null {
  const paths = useStore
    .getState()
    .tree.filter((item) => item.type !== 'folder')
    .map((item) => item.path);
  return resolveInVault(target, notePath, paths);
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
    (h) => lower(h.textContent?.trim() ?? '') === wanted,
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
  // Adjunto (PDF, audio...): lo abre el navegador en otra pestaña, como Obsidian lo abre fuera del editor
  if (path && !/\.md$/i.test(path)) {
    window.open(rawFileUrl(path), '_blank', 'noopener');
    return;
  }
  const created = !path;
  if (!path) {
    path = target.replace(/^\/+/, '').replace(/\.md$/i, '') + '.md';
    try {
      await filesApi.createNote(path);
      useStore.getState().setTree(await filesApi.getTree());
    } catch (err) {
      log.error('No se pudo crear la nota enlazada:', err);
      return;
    }
  }
  pendingScroll = heading ? { path, heading } : null;
  const name = fileName(path);
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
