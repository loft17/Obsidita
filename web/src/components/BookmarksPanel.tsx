import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { flushBookmarkSaves } from '../store/bookmarks';
import { bookmarksApi } from '../api';
import type { Bookmark, BookmarkType } from '../types';
import { defaultLabel } from '../bookmarkUtils';
import { isBroken, openBookmark, downloadBookmarks, parseBookmarkJson } from '../bookmarks';
import { notify } from '../toast';
import { parentFolder } from '../paths';
import { t as translate, useT } from '../i18n';
import { ConfirmDialog, RenameDialog } from './FileDialogs';
import { BookmarkEditDialog } from './BookmarkDialogs';
import { MenuItem, focusMenuItem, onMenuKeyDown } from './menuNav';
import {
  IconBookmark,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconClose,
  IconEdit,
  IconFile,
  IconFolderNew,
  IconFolderOpen,
  IconHash,
  IconMenu,
  IconSearch,
  IconTrash,
} from './Icons';
import '../styles/bookmarks.css';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const ICONS: Record<BookmarkType, typeof IconFile> = { file: IconFile, heading: IconHash, folder: IconFolderOpen };

type Dialog =
  | { type: 'edit'; bookmark: Bookmark }
  | { type: 'newGroup' }
  | { type: 'renameGroup'; name: string }
  | { type: 'deleteGroup'; name: string }
  | null;

// Marcadores de la web: archivos, encabezados y carpetas, agrupados y ordenables. Se abre desde la
// barra lateral (icono de marcador) y los cambios se guardan en el servidor al instante
export default function BookmarksPanel() {
  const bookmarks = useStore((s) => s.bookmarks);
  const groups = useStore((s) => s.bookmarkGroups);
  const loaded = useStore((s) => s.bookmarksLoaded);
  const tree = useStore((s) => s.tree);
  const loadBookmarks = useStore((s) => s.loadBookmarks);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const updateBookmark = useStore((s) => s.updateBookmark);
  const moveBookmark = useStore((s) => s.moveBookmark);
  const moveGroup = useStore((s) => s.moveGroup);
  const addGroup = useStore((s) => s.addGroup);
  const renameGroup = useStore((s) => s.renameGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const mergeBookmarks = useStore((s) => s.mergeBookmarks);
  const t = useT();

  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Al abrir el panel se recarga: los marcadores pueden haberse cambiado desde otro dispositivo
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // Cierra el menú al pulsar fuera de él
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const f = filter.trim().toLowerCase();
  const matches = (b: Bookmark) =>
    !f || defaultLabel(b).toLowerCase().includes(f) || b.path.toLowerCase().includes(f);

  const ungrouped = useMemo(() => bookmarks.filter((b) => !b.group), [bookmarks]);

  // Posición del marcador entre los de su mismo grupo, para desactivar subir/bajar en los extremos
  const edge = (b: Bookmark) => {
    const same = bookmarks.filter((x) => x.group === b.group);
    const i = same.indexOf(b);
    return { first: i <= 0, last: i === same.length - 1 };
  };

  const runMenuAction = async (action: () => Promise<void>) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const importObsidian = () =>
    runMenuAction(async () => {
      try {
        await flushBookmarkSaves();
        const { added, skipped } = await bookmarksApi.importObsidian();
        await loadBookmarks();
        notify('bookmarks', translate('bookmarks.importedObsidian', { added, skipped }));
      } catch (err) {
        notify('bookmarks', translate('bookmarks.obsidianError', { error: errorText(err) }), 'error');
      }
    });

  const exportObsidian = () =>
    runMenuAction(async () => {
      try {
        await flushBookmarkSaves();
        const { exported } = await bookmarksApi.exportObsidian();
        notify('bookmarks', translate('bookmarks.exportedObsidian', { exported }));
      } catch (err) {
        notify('bookmarks', translate('bookmarks.obsidianError', { error: errorText(err) }), 'error');
      }
    });

  const exportJson = () => {
    setMenuOpen(false);
    downloadBookmarks({ groups, items: bookmarks });
  };

  const importJson = async (file: File) => {
    let incoming: ReturnType<typeof parseBookmarkJson> = null;
    try {
      incoming = parseBookmarkJson(await file.text());
    } catch {
      incoming = null;
    }
    if (!incoming) return notify('bookmarks', t('bookmarks.invalidJson'), 'error');
    const { added, skipped } = mergeBookmarks(incoming);
    notify('bookmarks', t('bookmarks.importedJson', { added, skipped }));
  };

  const toggleGroup = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const renderRow = (b: Bookmark) => {
    const Icon = ICONS[b.type];
    const broken = isBroken(b, tree);
    const { first, last } = edge(b);
    const sub = b.type === 'heading' ? b.path : parentFolder(b.path) || '/';
    return (
      <div key={b.id} className={`bookmark-row ${broken ? 'is-broken' : ''}`}>
        <span className="tree-chevron">
          <Icon size={14} />
        </span>
        <button
          type="button"
          className="bookmark-open"
          title={b.type === 'heading' ? `${b.path} › ${b.heading}` : b.path}
          onClick={() => openBookmark(b)}
        >
          <span className="tree-label">
            {defaultLabel(b)}
            <span className="bookmark-sub">{sub}</span>
          </span>
        </button>
        {broken && <span className="bookmark-missing">{t('bookmarks.missingBadge')}</span>}
        <span className="bookmark-actions">
          <button className="icon-btn" title={t('bookmarks.moveUp')} disabled={first} onClick={() => moveBookmark(b.id, -1)}>
            <IconChevronUp size={14} />
          </button>
          <button className="icon-btn" title={t('bookmarks.moveDown')} disabled={last} onClick={() => moveBookmark(b.id, 1)}>
            <IconChevronDown size={14} />
          </button>
          <button className="icon-btn" title={t('bookmarks.edit')} onClick={() => setDialog({ type: 'edit', bookmark: b })}>
            <IconEdit size={14} />
          </button>
          <button className="icon-btn" title={t('bookmarks.remove')} onClick={() => removeBookmark(b.id)}>
            <IconClose size={14} />
          </button>
        </span>
      </div>
    );
  };

  const shownGroups = groups
    .map((name) => ({ name, items: bookmarks.filter((b) => b.group === name && matches(b)) }))
    .filter((g) => !f || g.items.length > 0);
  const shownUngrouped = ungrouped.filter(matches);
  const nothingShown = shownUngrouped.length === 0 && shownGroups.length === 0;

  return (
    <>
      <div className="sidebar-toolbar bookmark-toolbar">
        <button className="icon-btn" title={t('bookmarks.newGroup')} onClick={() => setDialog({ type: 'newGroup' })}>
          <IconFolderNew size={16} />
        </button>
        <div className="dropdown" ref={menuRef}>
          <button
            className="icon-btn"
            disabled={busy}
            title={t('bookmarks.more')}
            aria-label={t('bookmarks.more')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((o) => !o);
              requestAnimationFrame(() => focusMenuItem(menuListRef.current, 'first'));
            }}
          >
            <IconMenu size={16} />
          </button>
          {menuOpen && (
            <div
              ref={menuListRef}
              className="dropdown-menu bookmark-menu"
              role="menu"
              onKeyDown={(e) => onMenuKeyDown(e, () => setMenuOpen(false))}
            >
              <MenuItem onClick={importObsidian}>{t('bookmarks.importObsidian')}</MenuItem>
              <MenuItem onClick={exportObsidian}>{t('bookmarks.exportObsidian')}</MenuItem>
              <hr className="dropdown-divider" />
              <MenuItem onClick={() => fileInput.current?.click()}>{t('bookmarks.uploadJson')}</MenuItem>
              <MenuItem onClick={exportJson}>{t('bookmarks.downloadJson')}</MenuItem>
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) importJson(file);
          }}
        />
      </div>
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <IconSearch size={14} />
        </span>
        <input
          className="search-input"
          placeholder={t('bookmarks.filter')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
        />
        {filter && (
          <button className="icon-btn search-clear" title={t('common.clear')} onClick={() => setFilter('')}>
            <IconClose size={14} />
          </button>
        )}
      </div>
      <div className="file-explorer bookmark-list">
        {!loaded ? (
          <div className="dropdown-empty">{t('common.loading')}</div>
        ) : bookmarks.length === 0 && groups.length === 0 ? (
          <div className="dropdown-empty bookmark-empty">
            <IconBookmark size={28} />
            <span>{t('bookmarks.empty')}</span>
          </div>
        ) : nothingShown ? (
          <div className="dropdown-empty">{t('bookmarks.noMatch')}</div>
        ) : (
          <>
            {shownUngrouped.map(renderRow)}
            {shownGroups.map((g) => {
              const isCollapsed = collapsed.has(g.name) && !f;
              const groupIndex = groups.indexOf(g.name);
              return (
                <div key={g.name} className="bookmark-group">
                  <div className="bookmark-group-head">
                    <button
                      type="button"
                      className="bookmark-group-toggle"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleGroup(g.name)}
                    >
                      {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                      <span className="bookmark-group-name">{g.name}</span>
                      <span className="bookmark-count">{g.items.length}</span>
                    </button>
                    <span className="bookmark-actions">
                      <button className="icon-btn" title={t('bookmarks.moveUp')} disabled={groupIndex === 0} onClick={() => moveGroup(g.name, -1)}>
                        <IconChevronUp size={14} />
                      </button>
                      <button className="icon-btn" title={t('bookmarks.moveDown')} disabled={groupIndex === groups.length - 1} onClick={() => moveGroup(g.name, 1)}>
                        <IconChevronDown size={14} />
                      </button>
                      <button className="icon-btn" title={t('bookmarks.renameGroup')} onClick={() => setDialog({ type: 'renameGroup', name: g.name })}>
                        <IconEdit size={14} />
                      </button>
                      <button className="icon-btn" title={t('bookmarks.deleteGroup')} onClick={() => setDialog({ type: 'deleteGroup', name: g.name })}>
                        <IconTrash size={14} />
                      </button>
                    </span>
                  </div>
                  {!isCollapsed && g.items.map(renderRow)}
                </div>
              );
            })}
          </>
        )}
      </div>

      {dialog?.type === 'edit' && (
        <BookmarkEditDialog
          bookmark={dialog.bookmark}
          groups={groups}
          onClose={() => setDialog(null)}
          onSave={(label, group) => {
            updateBookmark(dialog.bookmark.id, { label, group });
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'newGroup' && (
        <RenameDialog
          title={t('bookmarks.newGroup')}
          confirmLabel={t('common.create')}
          placeholder={t('bookmarks.groupName')}
          initialName=""
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            if (!addGroup(name)) throw new Error(t('bookmarks.groupInvalid'));
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'renameGroup' && (
        <RenameDialog
          title={t('bookmarks.renameGroup')}
          confirmLabel={t('common.save')}
          placeholder={t('bookmarks.groupName')}
          initialName={dialog.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            if (!renameGroup(dialog.name, name)) throw new Error(t('bookmarks.groupInvalid'));
            setDialog(null);
          }}
        />
      )}
      {dialog?.type === 'deleteGroup' && (
        <ConfirmDialog
          title={t('bookmarks.deleteGroup')}
          message={t('bookmarks.confirmDeleteGroup', { name: dialog.name })}
          confirmLabel={t('common.delete')}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            deleteGroup(dialog.name);
            setDialog(null);
          }}
        />
      )}
    </>
  );
}
