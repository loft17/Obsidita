import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { flushPendingSave } from './Editor';
import { noteImageUsage } from '../attachments';
import { syncApi, type NoteCommit } from '../api';
import { getLang, Trans, useT } from '../i18n';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

function DialogShell({
  title,
  error,
  onClose,
  children,
}: {
  title: string;
  error?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscape(onClose);
  // Portal: un ancestro con `transform` rompería el `position: fixed` del overlay
  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal file-dialog">
        <div className="file-dialog-title">{title}</div>
        {children}
        {error && <div className="error">{error}</div>}
      </div>
    </div>,
    document.body
  );
}

function DialogButtons({
  confirmLabel,
  danger,
  disabled,
  onCancel,
}: {
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="file-dialog-buttons">
      <button type="button" className="btn-secondary" onClick={onCancel}>
        {t('common.cancel')}
      </button>
      <button type="submit" className={danger ? 'btn-danger' : ''} disabled={disabled}>
        {confirmLabel}
      </button>
    </div>
  );
}

export function RenameDialog({
  title,
  confirmLabel,
  placeholder,
  initialName,
  onSubmit,
  onClose,
}: {
  title?: string;
  confirmLabel?: string;
  placeholder?: string;
  initialName: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t('name.empty'));
    // Los nombres ocultos no se listan en el explorador (el servidor omite los archivos que
    // empiezan por punto), así que el archivo quedaría creado pero invisible
    if (/[\\/:*?"<>|]/.test(trimmed) || trimmed.startsWith('.')) return setError(t('name.invalid'));
    if (trimmed === initialName) return onClose();
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <DialogShell title={title ?? t('file.rename')} error={error} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="file-dialog-input"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <DialogButtons confirmLabel={confirmLabel ?? t('file.rename')} disabled={busy} onCancel={onClose} />
      </form>
    </DialogShell>
  );
}

export function MoveDialog({
  title,
  folders,
  currentFolder,
  onSubmit,
  onClose,
}: {
  title?: string;
  folders: string[];
  currentFolder: string;
  onSubmit: (folder: string) => Promise<void>;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();

  // '' representa la raíz de la bóveda
  const options = ['', ...folders]
    .filter((f) => f !== currentFolder)
    .filter((f) => (f || '/').toLowerCase().includes(filter.toLowerCase()));

  const choose = async (folder: string) => {
    setBusy(true);
    try {
      await onSubmit(folder);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <DialogShell title={title ?? t('file.moveFile')} error={error} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (options.length > 0 && !busy) choose(options[0]);
        }}
      >
        <input
          autoFocus
          className="file-dialog-input"
          placeholder={t('move.search')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </form>
      <div className="file-dialog-list">
        {options.length === 0 && <div className="dropdown-empty">{t('move.noMatch')}</div>}
        {options.map((folder) => (
          <div
            key={folder || '/'}
            className={`dropdown-item ${busy ? 'disabled' : ''}`}
            onClick={() => !busy && choose(folder)}
          >
            {folder || t('move.root')}
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

// Selector de notas con filtro; también sirve para elegir plantilla (`label` acorta lo que se muestra)
export function QuickOpenDialog({
  files,
  onSelect,
  onClose,
  title,
  placeholder,
  emptyText,
  label = (path) => path.replace(/\.md$/i, ''),
}: {
  files: { path: string; name: string }[];
  onSelect: (path: string, name: string) => void;
  onClose: () => void;
  title?: string;
  placeholder?: string;
  emptyText?: string;
  label?: (path: string) => string;
}) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const t = useT();

  const needle = filter.toLowerCase();
  const options = files.filter((f) => label(f.path).toLowerCase().includes(needle)).slice(0, 50);
  const current = Math.min(selected, Math.max(options.length - 1, 0));

  const choose = (i: number) => {
    const file = options[i];
    if (!file) return;
    onSelect(file.path, file.name);
    onClose();
  };

  return (
    <DialogShell title={title ?? t('quickOpen.title')} onClose={onClose}>
      <input
        autoFocus
        className="file-dialog-input"
        placeholder={placeholder ?? t('quickOpen.search')}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            choose(current);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelected(Math.min(current + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelected(Math.max(current - 1, 0));
          }
        }}
      />
      <div className="file-dialog-list">
        {options.length === 0 && <div className="dropdown-empty">{emptyText ?? t('quickOpen.noMatch')}</div>}
        {options.map((f, i) => (
          <div
            key={f.path}
            ref={(el) => i === current && el?.scrollIntoView({ block: 'nearest' })}
            className="dropdown-item"
            style={i === current ? { background: 'var(--interactive-hover)' } : undefined}
            onClick={() => choose(i)}
          >
            {label(f.path)}
          </div>
        ))}
      </div>
    </DialogShell>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  disabled,
  children,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <DialogShell title={title} error={error} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="file-dialog-message">{message}</p>
        {children}
        <DialogButtons confirmLabel={confirmLabel} danger disabled={busy || disabled} onCancel={onClose} />
      </form>
    </DialogShell>
  );
}

// Confirmación de borrado; si es una nota, ofrece borrar también sus imágenes (marcado por defecto).
// Las imágenes que otras notas también usan nunca se borran.
export function DeleteFileDialog({
  path,
  isFolder,
  title,
  confirmLabel,
  onDelete,
  onClose,
}: {
  path: string;
  isFolder?: boolean;
  title: string;
  confirmLabel: string;
  onDelete: (images: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const isNote = !isFolder && /\.md$/i.test(path);
  const [usage, setUsage] = useState<{ own: string[]; shared: string[] } | null>(null);
  const [loading, setLoading] = useState(isNote);
  const [deleteImages, setDeleteImages] = useState(true);
  const t = useT();

  useEffect(() => {
    if (!isNote) return;
    let cancelled = false;
    (async () => {
      try {
        await flushPendingSave(path);
        const result = await noteImageUsage(path);
        if (!cancelled) setUsage(result);
      } catch {
        // Si falla la detección se borra solo la nota
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, isNote]);

  const own = usage?.own ?? [];
  const shared = usage?.shared ?? [];
  const name = path.split('/').pop() || path;

  return (
    <ConfirmDialog
      title={title}
      message={
        <Trans
          k={isFolder ? 'delete.confirmFolder' : 'delete.confirm'}
          values={{ name: <strong>{name}</strong> }}
        />
      }
      confirmLabel={confirmLabel}
      disabled={loading}
      onConfirm={() => onDelete(deleteImages ? own : [])}
      onClose={onClose}
    >
      {loading && <p className="file-dialog-message">{t('delete.findingImages')}</p>}
      {own.length > 0 && (
        <div className="delete-images">
          <label className="delete-images-toggle">
            <input type="checkbox" checked={deleteImages} onChange={(e) => setDeleteImages(e.target.checked)} />
            {own.length === 1 ? t('delete.alsoImage') : t('delete.alsoImages', { n: own.length })}
          </label>
          <ul className="delete-images-list">
            {own.map((p) => (
              <li key={p} title={p}>
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      {shared.length > 0 && (
        <p className="file-dialog-message">
          {shared.length === 1 ? t('delete.sharedImage') : t('delete.sharedImages', { n: shared.length })}
        </p>
      )}
    </ConfirmDialog>
  );
}

// La nota ha cambiado en otro sitio mientras se editaba aquí: hay que elegir qué versión
// conservar. No se puede cerrar sin elegir, para no seguir escribiendo sobre una versión vieja
export function ConflictDialog({
  path,
  mine,
  theirs,
  onKeepMine,
  onKeepTheirs,
}: {
  path: string;
  mine: string;
  theirs: string;
  onKeepMine: () => Promise<void>;
  onKeepTheirs: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const name = (path.split('/').pop() || path).replace(/\.md$/i, '');

  const keepMine = async () => {
    setBusy(true);
    try {
      await onKeepMine();
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell title={t('conflict.title')} onClose={() => {}}>
      <p className="file-dialog-message">
        <Trans k="conflict.message" values={{ name: <strong>{name}</strong> }} />
      </p>
      <div className="conflict-versions">
        <div>
          <div className="conflict-label">{t('conflict.mine')}</div>
          <pre className="conflict-text">{mine}</pre>
        </div>
        <div>
          <div className="conflict-label">{t('conflict.theirs')}</div>
          <pre className="conflict-text">{theirs}</pre>
        </div>
      </div>
      <div className="file-dialog-buttons">
        <button type="button" className="btn-secondary" disabled={busy} onClick={onKeepTheirs}>
          {t('conflict.useTheirs')}
        </button>
        <button type="button" disabled={busy} onClick={keepMine}>
          {t('conflict.keepMine')}
        </button>
      </div>
    </DialogShell>
  );
}

const formatCommitDate = (ms: number) =>
  new Date(ms).toLocaleString(getLang(), { dateStyle: 'short', timeStyle: 'short' });

// Solo las líneas de cambios del diff de git (sin las cabeceras), con su tipo
function diffLines(diff: string) {
  const lines = diff.split('\n');
  const start = lines.findIndex((l) => l.startsWith('@@'));
  if (start < 0) return [];
  return lines
    .slice(start)
    .filter((l) => l !== '' && !l.startsWith('\\'))
    .map((l) => ({
      text: l,
      kind: l.startsWith('@@') ? 'hunk' : l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'ctx',
    }));
}

// Historial de versiones de la nota sacado de git (sincronización con GitHub): cada commit
// que la tocó, su contenido en ese momento y los cambios de ese commit; se puede restaurar
export function HistoryDialog({
  path,
  onRestore,
  onClose,
}: {
  path: string;
  onRestore: (content: string) => Promise<void>;
  onClose: () => void;
}) {
  const [commits, setCommits] = useState<NoteCommit[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState<(NoteCommit & { content: string; diff: string }) | null>(null);
  const [view, setView] = useState<'content' | 'diff'>('diff');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const name = (path.split('/').pop() || path).replace(/\.md$/i, '');

  useEffect(() => {
    syncApi
      .history(path)
      .then((list) => {
        setCommits(list);
        if (list.length) setSelected(list[0].hash);
      })
      .catch((err) => setError((err as Error).message));
  }, [path]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setVersion(null);
    syncApi
      .version(path, selected)
      .then((v) => !cancelled && setVersion(v))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [path, selected]);

  const restore = async () => {
    if (!version) return;
    setBusy(true);
    setError('');
    try {
      await onRestore(version.content);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const lines = version ? diffLines(version.diff) : [];

  return (
    <DialogShell title={t('history.title', { name })} error={error} onClose={onClose}>
      {commits === null ? (
        !error && <p className="file-dialog-message">{t('common.loading')}</p>
      ) : commits.length === 0 ? (
        <p className="file-dialog-message">
          {t('history.empty')}
        </p>
      ) : (
        <div className="history-layout">
          <ul className="history-list">
            {commits.map((c, i) => (
              <li
                key={c.hash}
                className={`history-item ${c.hash === selected ? 'active' : ''}`}
                title={`${c.message}\n${c.author} · ${c.hash.slice(0, 8)}${c.path !== path ? `\n${c.path}` : ''}`}
                onClick={() => setSelected(c.hash)}
              >
                <div className="history-item-date">
                  {formatCommitDate(c.date)}
                  {i === 0 && <span className="history-item-badge">{t('history.latest')}</span>}
                </div>
                <div className="history-item-message">{c.message}</div>
              </li>
            ))}
          </ul>
          <div className="history-preview">
            <div className="history-tabs">
              <button className={view === 'diff' ? 'active' : ''} onClick={() => setView('diff')}>
                {t('history.changes')}
              </button>
              <button className={view === 'content' ? 'active' : ''} onClick={() => setView('content')}>
                {t('history.content')}
              </button>
              {version && version.path !== path && <span className="history-old-path">{version.path}</span>}
            </div>
            {!version ? (
              <p className="file-dialog-message">{t('common.loading')}</p>
            ) : view === 'content' ? (
              <pre className="conflict-text history-text">{version.content}</pre>
            ) : lines.length === 0 ? (
              <p className="file-dialog-message">{t('history.noChanges')}</p>
            ) : (
              <pre className="conflict-text history-text">
                {lines.map((l, i) => (
                  <div key={i} className={`diff-line diff-${l.kind}`}>
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        </div>
      )}
      <div className="file-dialog-buttons">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('common.close')}
        </button>
        {commits && commits.length > 0 && (
          <button type="button" disabled={busy || !version} onClick={restore}>
            {t('history.restore')}
          </button>
        )}
      </div>
    </DialogShell>
  );
}
