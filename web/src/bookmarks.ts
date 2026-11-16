// Acciones de los marcadores que tocan la interfaz: abrir, marcar/desmarcar, exportar e importar JSON.
// La lista y sus cambios están en store/bookmarks.ts; las funciones puras, en bookmarkUtils.ts
import { useStore } from './store';
import { filesApi } from './api';
import { notify } from './toast';
import { t } from './i18n';
import { fileName } from './paths';
import { isMobile } from './mobile';
import { setPendingLine } from './wikilinks';
import { findHeadingLine } from './bookmarkUtils';
import type { Bookmark, BookmarkStore, BookmarkType, TreeItem } from './types';

const BOOKMARK_TYPES: BookmarkType[] = ['file', 'heading', 'folder'];

// Un marcador está roto si su archivo o carpeta ya no está en el árbol (renombrado fuera de la web,
// borrado, cambio por sincronización). Los encabezados se comprueban al abrirlos
export const isBroken = (b: Bookmark, tree: TreeItem[]) =>
  !tree.some((i) => i.path === b.path && (b.type === 'folder') === (i.type === 'folder'));

// El marcador de la nota (o carpeta) abierta, si lo hay. Los de encabezado no cuentan
export const bookmarkOfPath = (bookmarks: Bookmark[], path: string) =>
  bookmarks.find((b) => b.type !== 'heading' && b.path === path);

const closeSidebarOnMobile = () => {
  if (isMobile()) useStore.setState({ sidebarOpen: false });
};

// Abre el marcador. Un encabezado abre la nota desplazada hasta su línea, como los enlaces [[nota#encabezado]]
export async function openBookmark(b: Bookmark) {
  const { tree, openFile, revealFile, revealFolder } = useStore.getState();
  if (isBroken(b, tree)) {
    notify('bookmarks', t('bookmarks.missing', { path: b.path }), 'error');
    return;
  }
  if (b.type === 'folder') {
    revealFolder(b.path);
    closeSidebarOnMobile();
    return;
  }
  if (b.type === 'heading' && b.heading) {
    try {
      const { content } = await filesApi.readFile(b.path);
      const line = findHeadingLine(content, b.heading);
      if (line === null) notify('bookmarks', t('bookmarks.headingMissing'), 'info');
      else setPendingLine(b.path, line);
    } catch (err) {
      notify('bookmarks', t('bookmarks.loadError', { error: (err as Error).message }), 'error');
      return;
    }
  }
  openFile(b.path, fileName(b.path));
  revealFile(b.path);
  closeSidebarOnMobile();
}

// Marca o quita la nota (o carpeta) abierta. Ctrl/Cmd+D y el menú de la nota usan esto
export function toggleBookmark(path: string) {
  const { tree, bookmarks, addBookmark, removeBookmark } = useStore.getState();
  const existing = bookmarkOfPath(bookmarks, path);
  if (existing) {
    removeBookmark(existing.id);
    notify('bookmarks', t('bookmarks.removed'));
    return;
  }
  const folder = tree.some((i) => i.path === path && i.type === 'folder');
  if (addBookmark({ type: folder ? 'folder' : 'file', path })) notify('bookmarks', t('bookmarks.added'));
}

// Descarga la lista como JSON (copia de seguridad o para pasarla a otro navegador)
export function downloadBookmarks(store: BookmarkStore) {
  const data = JSON.stringify({ version: 1, groups: store.groups, items: store.items }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'obsidita-marcadores.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Lee un JSON exportado. Descarta lo que no encaja; el servidor valida lo que queda al guardar
export function parseBookmarkJson(text: string): BookmarkStore | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as BookmarkStore).items)) return null;
  const { items, groups } = data as { items: unknown[]; groups?: unknown };
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  const groupNames = Array.isArray(groups) ? groups.filter(isStr) : [];
  const out: Bookmark[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!BOOKMARK_TYPES.includes(r.type as BookmarkType) || !isStr(r.path)) continue;
    if (r.path.startsWith('/') || r.path.split('/').some((s) => s === '' || s === '.' || s === '..')) continue;
    if (r.type === 'heading' && !isStr(r.heading)) continue;
    const item: Bookmark = { id: '', type: r.type as BookmarkType, path: r.path };
    if (r.type === 'heading') item.heading = r.heading as string;
    if (isStr(r.label)) item.label = r.label;
    if (isStr(r.group)) {
      item.group = r.group;
      if (!groupNames.includes(r.group)) groupNames.push(r.group);
    }
    out.push(item);
  }
  return { groups: groupNames, items: out };
}
