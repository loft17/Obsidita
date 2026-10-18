import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { filesApi, trashApi } from '../api';
import type { TrashItem } from '../types';
import { ConfirmDialog } from './FileDialogs';
import { getLang, Trans, useT } from '../i18n';
import { IconClose, IconFile, IconFolderOpen, IconRestore, IconSearch, IconSync, IconTrash } from './Icons';

const formatDate = (ms: number) => new Date(ms).toLocaleString(getLang(), { dateStyle: 'short', timeStyle: 'short' });

// Papelera del vault (.trash): restaurar a la ruta original o borrar definitivamente
export default function TrashPanel() {
  const setTree = useStore((s) => s.setTree);
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const [confirm, setConfirm] = useState<{ type: 'purge'; item: TrashItem } | { type: 'empty' } | null>(null);

  const load = async () => {
    try {
      setItems(await trashApi.list());
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (item: TrashItem) => {
    setBusy(true);
    try {
      await trashApi.restore(item.id);
      setTree(await filesApi.getTree());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const f = filter.trim().toLowerCase();
  const shown = (items ?? []).filter((i) => !f || i.path.toLowerCase().includes(f));

  return (
    <>
      <div className="sidebar-toolbar">
        <button className="icon-btn" title={t('common.refresh')} onClick={load}>
          <IconSync size={16} />
        </button>
        <button
          className="icon-btn"
          title={t('trash.empty')}
          disabled={!items?.length}
          onClick={() => setConfirm({ type: 'empty' })}
        >
          <IconTrash size={16} />
        </button>
      </div>
      <div className="search-input-wrapper">
        <span className="search-input-icon">
          <IconSearch size={14} />
        </span>
        <input
          className="search-input"
          placeholder={t('trash.filter')}
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
      {error && <div className="dropdown-empty">{error}</div>}
      <div className="file-explorer">
        {items === null ? (
          !error && <div className="dropdown-empty">{t('common.loading')}</div>
        ) : shown.length === 0 ? (
          <div className="dropdown-empty">{f ? t('trash.noMatch') : t('trash.isEmpty')}</div>
        ) : (
          shown.map((item) => {
            const folder = item.path.split('/').slice(0, -1).join('/');
            return (
              <div
                key={item.id}
                className="tree-item trash-item"
                title={`${item.path}\n${t('trash.deletedAt', { date: formatDate(item.deletedAt) })}`}
              >
                <span className="tree-chevron">
                  {item.isFolder ? <IconFolderOpen size={14} /> : <IconFile size={14} />}
                </span>
                <span className="tree-label">
                  {item.name.replace(/\.md$/i, '')}
                  <span className="search-result-folder">{folder || '/'}</span>
                </span>
                <span className="trash-item-actions">
                  <button className="icon-btn" title={t('trash.restore')} disabled={busy} onClick={() => restore(item)}>
                    <IconRestore size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    title={t('trash.purge')}
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'purge', item })}
                  >
                    <IconClose size={14} />
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.type === 'empty' ? t('trash.empty') : t('trash.purge')}
          message={
            confirm.type === 'empty' ? (
              t('trash.confirmEmpty', { n: items?.length ?? 0 })
            ) : (
              <Trans
                k={confirm.item.isFolder ? 'trash.confirmPurgeFolder' : 'trash.confirmPurge'}
                values={{ name: <strong>{confirm.item.name}</strong> }}
              />
            )
          }
          confirmLabel={t('common.delete')}
          onConfirm={async () => {
            if (confirm.type === 'empty') await trashApi.empty();
            else await trashApi.purge(confirm.item.id);
            setConfirm(null);
            await load();
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
