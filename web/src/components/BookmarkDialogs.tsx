// Diálogo para cambiar la etiqueta y el grupo de un marcador
import { useEffect, useState } from 'react';
import type { Bookmark } from '../types';
import { t as translate, useT } from '../i18n';
import { useStore } from '../store';
import { filesApi } from '../api';
import { defaultLabel, headingsOf, type HeadingRef } from '../bookmarkUtils';
import { notify } from '../toast';
import { flushPendingSave } from './Editor';
import { DialogButtons, DialogShell, QuickOpenDialog } from './FileDialogs';

export function BookmarkEditDialog({
  bookmark,
  groups,
  onSave,
  onClose,
}: {
  bookmark: Bookmark;
  groups: string[];
  onSave: (label: string, group: string) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(bookmark.label ?? '');
  const [group, setGroup] = useState(bookmark.group ?? '');
  const t = useT();

  return (
    <DialogShell title={t('bookmarks.edit')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(label, group);
        }}
      >
        <div className="bookmark-dialog-path" title={bookmark.path}>
          {bookmark.type === 'heading' ? `${bookmark.path} › ${bookmark.heading}` : bookmark.path}
        </div>
        <label className="bookmark-dialog-field">
          <span>{t('bookmarks.label')}</span>
          <input
            autoFocus
            className="file-dialog-input"
            placeholder={defaultLabel({ ...bookmark, label: undefined })}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="bookmark-dialog-field">
          <span>{t('bookmarks.group')}</span>
          <select className="file-dialog-input" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{t('bookmarks.noGroup')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <DialogButtons confirmLabel={t('common.save')} onCancel={onClose} />
      </form>
    </DialogShell>
  );
}

// Elige un encabezado de la nota abierta para marcarlo (menú de la nota → "Marcar encabezado")
export function HeadingPicker({ path, onClose }: { path: string; onClose: () => void }) {
  const [headings, setHeadings] = useState<HeadingRef[] | null>(null);
  const t = useT();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Lo que se está escribiendo aún no está en el servidor: se guarda antes de leer los encabezados
        await flushPendingSave(path);
        const { content } = await filesApi.readFile(path);
        if (!cancelled) setHeadings(headingsOf(content));
      } catch (err) {
        notify('bookmarks', translate('bookmarks.loadError', { error: (err as Error).message }), 'error');
        if (!cancelled) onClose();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!headings) return null;

  return (
    <QuickOpenDialog
      files={headings.map((h, i) => ({ path: String(i), name: h.text }))}
      title={t('bookmarks.pickHeading')}
      placeholder={t('bookmarks.searchHeading')}
      emptyText={t('bookmarks.noHeadings')}
      label={(key) => {
        const h = headings[Number(key)];
        return h ? `${'\u00a0\u00a0'.repeat(h.level - 1)}${h.text}` : '';
      }}
      onSelect={(key) => {
        const h = headings[Number(key)];
        if (!h) return;
        const added = useStore.getState().addBookmark({ type: 'heading', path, heading: h.text });
        if (added) notify('bookmarks', translate('bookmarks.added'));
      }}
      onClose={onClose}
    />
  );
}
