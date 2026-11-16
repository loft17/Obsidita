import type { StateCreator } from 'zustand';
import { bookmarksApi } from '../api';
import { notify } from '../toast';
import { t } from '../i18n';
import type { Bookmark, BookmarkStore } from '../types';
import { bookmarkKey, MAX_BOOKMARKS, newBookmarkId } from '../bookmarkUtils';
import type { AppStore } from './index';

// Marcadores: la lista vive aquí y se guarda en el servidor (data/bookmarks.json) para que la vean
// todos los dispositivos. Cada cambio se aplica al instante y se envía en cola: como cada envío
// manda el estado del momento en que se ejecuta, varios cambios seguidos acaban en una sola escritura

export type NewBookmark = Omit<Bookmark, 'id' | 'createdAt'>;

export interface BookmarksSlice {
  bookmarks: Bookmark[];
  bookmarkGroups: string[];
  bookmarksLoaded: boolean;
  loadBookmarks: () => Promise<void>;
  // No hace nada si ya existe (mismo tipo, ruta y encabezado)
  addBookmark: (bookmark: NewBookmark) => boolean;
  removeBookmark: (id: string) => void;
  // `group` vacío = sin grupo
  updateBookmark: (id: string, changes: { label: string; group: string }) => boolean;
  moveBookmark: (id: string, dir: -1 | 1) => void;
  addGroup: (name: string) => boolean;
  renameGroup: (from: string, to: string) => boolean;
  deleteGroup: (name: string) => void;
  moveGroup: (name: string, dir: -1 | 1) => void;
  // Mezcla marcadores ya validados (importación JSON) sin repetir los existentes
  mergeBookmarks: (incoming: BookmarkStore) => { added: number; skipped: number };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

let queue: Promise<unknown> = Promise.resolve();

export const createBookmarksSlice: StateCreator<AppStore, [], [], BookmarksSlice> = (set, get) => {
  const current = (): BookmarkStore => ({ groups: get().bookmarkGroups, items: get().bookmarks });

  const applyServer = (store: BookmarkStore) => set({ bookmarks: store.items, bookmarkGroups: store.groups, bookmarksLoaded: true });

  const loadNow = async () => {
    try {
      applyServer(await bookmarksApi.get());
    } catch (err) {
      notify('bookmarks', t('bookmarks.loadError', { error: errorText(err) }), 'error');
    }
  };

  // Aplica el cambio y lo envía. Si el servidor lo rechaza, se vuelve a lo que hay guardado
  const commit = (next: BookmarkStore) => {
    set({ bookmarks: next.items, bookmarkGroups: next.groups });
    queue = queue
      .then(() => bookmarksApi.save(current()))
      .catch((err) => {
        notify('bookmarks', t('bookmarks.saveError', { error: errorText(err) }), 'error');
        loadNow();
      });
  };

  return {
    bookmarks: [],
    bookmarkGroups: [],
    bookmarksLoaded: false,
    loadBookmarks: async () => {
      // Espera a los envíos pendientes: si no, la respuesta antigua pisaría un cambio recién hecho
      await queue;
      await loadNow();
    },

    addBookmark: (bookmark) => {
      const { bookmarks, bookmarkGroups } = get();
      const key = bookmarkKey(bookmark);
      if (bookmarks.some((b) => bookmarkKey(b) === key)) return false;
      if (bookmarks.length >= MAX_BOOKMARKS) {
        notify('bookmarks', t('bookmarks.limit', { max: MAX_BOOKMARKS }), 'error');
        return false;
      }
      const item: Bookmark = { ...bookmark, id: newBookmarkId(), createdAt: Date.now() };
      commit({ groups: bookmarkGroups, items: [...bookmarks, item] });
      return true;
    },

    removeBookmark: (id) => {
      const { bookmarks, bookmarkGroups } = get();
      commit({ groups: bookmarkGroups, items: bookmarks.filter((b) => b.id !== id) });
    },

    updateBookmark: (id, { label, group }) => {
      const { bookmarks, bookmarkGroups } = get();
      if (!bookmarks.some((b) => b.id === id)) return false;
      const groups = group && !bookmarkGroups.includes(group) ? [...bookmarkGroups, group] : bookmarkGroups;
      const items = bookmarks.map((b) => {
        if (b.id !== id) return b;
        const next: Bookmark = { ...b };
        delete next.label;
        delete next.group;
        if (label.trim()) next.label = label.trim();
        if (group) next.group = group;
        return next;
      });
      commit({ groups, items });
      return true;
    },

    // Sube o baja dentro de su grupo (o dentro de los sin grupo). Los de otros grupos no cuentan
    moveBookmark: (id, dir) => {
      const { bookmarks, bookmarkGroups } = get();
      const items = [...bookmarks];
      const i = items.findIndex((b) => b.id === id);
      if (i < 0) return;
      const group = items[i].group;
      let j = i + dir;
      while (j >= 0 && j < items.length && items[j].group !== group) j += dir;
      if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      commit({ groups: bookmarkGroups, items });
    },

    addGroup: (name) => {
      const clean = name.trim();
      const { bookmarks, bookmarkGroups } = get();
      if (!clean || clean.length > 60 || bookmarkGroups.includes(clean) || bookmarkGroups.length >= 100) return false;
      commit({ groups: [...bookmarkGroups, clean], items: bookmarks });
      return true;
    },

    renameGroup: (from, to) => {
      const clean = to.trim();
      const { bookmarks, bookmarkGroups } = get();
      if (!clean || clean.length > 60 || (clean !== from && bookmarkGroups.includes(clean))) return false;
      commit({
        groups: bookmarkGroups.map((g) => (g === from ? clean : g)),
        items: bookmarks.map((b) => (b.group === from ? { ...b, group: clean } : b)),
      });
      return true;
    },

    // Borrar un grupo no borra sus marcadores: pasan a la lista general
    deleteGroup: (name) => {
      const { bookmarks, bookmarkGroups } = get();
      commit({
        groups: bookmarkGroups.filter((g) => g !== name),
        items: bookmarks.map((b) => {
          if (b.group !== name) return b;
          const next: Bookmark = { ...b };
          delete next.group;
          return next;
        }),
      });
    },

    moveGroup: (name, dir) => {
      const { bookmarks, bookmarkGroups } = get();
      const groups = [...bookmarkGroups];
      const i = groups.indexOf(name);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= groups.length) return;
      [groups[i], groups[j]] = [groups[j], groups[i]];
      commit({ groups, items: bookmarks });
    },

    mergeBookmarks: (incoming) => {
      const { bookmarks, bookmarkGroups } = get();
      const keys = new Set(bookmarks.map(bookmarkKey));
      const groups = [...bookmarkGroups];
      const items = [...bookmarks];
      let added = 0;
      let skipped = 0;
      for (const b of incoming.items) {
        const key = bookmarkKey(b);
        if (keys.has(key) || items.length >= MAX_BOOKMARKS) {
          skipped++;
          continue;
        }
        if (b.group && !groups.includes(b.group)) groups.push(b.group);
        items.push({ ...b, id: newBookmarkId(), createdAt: b.createdAt ?? Date.now() });
        keys.add(key);
        added++;
      }
      if (added) commit({ groups, items });
      return { added, skipped };
    },
  };
};

// Espera a que se guarden los cambios pendientes (la importación y exportación de Obsidian leen lo guardado)
export const flushBookmarkSaves = () => queue;
