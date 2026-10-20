import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore, hiddenMatchers, isHiddenPath } from '../store';
import { filesApi, searchApi, type NoteInfo } from '../api';
import { getLang, useT } from '../i18n';
import { parseNote } from '../frontmatter';
import { findLinks, findTags, resolveLink } from '../../../server/noteContent.js';
import { formatBytes } from '../format';
import { fileName, isNote, noteTitle } from '../paths';
import { flushPendingSave, NOTE_SAVED, NOTES_CHANGED } from './Editor';
import { IconClose, IconSync } from './Icons';

// Palabras por minuto para estimar el tiempo de lectura
const WORDS_PER_MINUTE = 225;

// Tras guardar se espera un poco antes de volver a pedir la información: mientras se escribe
// hay un autoguardado cada pocos segundos y cada petición recorre el vault
const SAVED_REFRESH_DELAY = 5000;

interface LinkRow {
  key: string;
  path: string | null; // null: el enlace no lleva a ningún archivo
  label: string;
  count: number;
}

// Estadísticas del texto, sin contar el frontmatter (las líneas sí son las del archivo entero)
function textStats(content: string) {
  const { body } = parseNote(content);
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    words,
    chars: body.length,
    charsNoSpaces: body.replace(/\s/g, '').length,
    paragraphs: body.split(/\r?\n[ \t]*\r?\n/).filter((p) => p.trim()).length,
    lines: content === '' ? 0 : content.split(/\r?\n/).length,
    minutes: words / WORDS_PER_MINUTE,
  };
}

// Enlaces salientes agrupados por destino; los que no llegan a ningún archivo, por lo escrito
function outgoingLinks(content: string, notePath: string, paths: string[]): LinkRow[] {
  const rows = new Map<string, LinkRow>();
  for (const link of findLinks(content)) {
    const path = resolveLink(link, notePath, paths);
    const key = path ?? `?${link.target.toLowerCase()}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { key, path, label: path ? noteTitle(path) : link.target, count: 1 });
  }
  return [...rows.values()].sort(
    (a, b) => Number(!a.path) - Number(!b.path) || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );
}

// Etiquetas del frontmatter y del cuerpo, sin distinguir mayúsculas (se muestra la primera forma)
function noteTags(content: string) {
  const tags = new Map<string, { tag: string; count: number }>();
  for (const { text } of findTags(content.split(/\r?\n/))) {
    const tag = text.replace(/^#/, '').replace(/\/+$/, '');
    if (!tag) continue;
    const key = tag.toLowerCase();
    const entry = tags.get(key);
    if (entry) entry.count++;
    else tags.set(key, { tag, count: 1 });
  }
  return [...tags.values()].sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
}

const formatDate = (ms: number) => new Date(ms).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' });

// «hace 5 minutos», «ayer»...
function relativeTime(ms: number) {
  const seconds = (ms - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <details className="note-info-section" open>
      <summary className="note-info-heading">
        <span>{title}</span>
        {count !== undefined && <span className="search-result-count">{count}</span>}
      </summary>
      {children}
    </details>
  );
}

function Row({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd title={title}>{children}</dd>
    </>
  );
}

function LinkList({ rows, empty, onOpen }: { rows: LinkRow[]; empty: string; onOpen: (path: string) => void }) {
  const t = useT();
  if (!rows.length) return <div className="dropdown-empty">{empty}</div>;
  return (
    <div className="note-info-list">
      {rows.map((row) =>
        row.path ? (
          <button
            type="button"
            key={row.key}
            className="tree-item note-info-item"
            title={row.path}
            onClick={() => onOpen(row.path!)}
          >
            <span className="tree-label">{row.label}</span>
            {row.count > 1 && <span className="search-result-count">{row.count}</span>}
          </button>
        ) : (
          <div key={row.key} className="tree-item note-info-item is-unresolved" title={t('info.unresolved')}>
            <span className="tree-label">{row.label}</span>
            {row.count > 1 && <span className="search-result-count">{row.count}</span>}
          </div>
        ),
      )}
    </div>
  );
}

// Diálogo con la información de un archivo: el archivo en el disco, estadísticas del texto,
// enlaces salientes y entrantes y etiquetas. Lo que sale del contenido se calcula aquí; las
// fechas y los enlaces entrantes los da el servidor. `content`: el texto que se está editando
// si es la nota abierta (se actualiza al escribir); si no, se lee del servidor
export default function NoteInfoModal({
  path,
  content,
  onClose,
}: {
  path: string;
  content?: string;
  onClose: () => void;
}) {
  const tree = useStore((s) => s.tree);
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const openFile = useStore((s) => s.openFile);
  const searchTag = useStore((s) => s.searchTag);
  const t = useT();
  const [data, setData] = useState<NoteInfo | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  const note = isNote(path);
  // `content` cambia en cada pulsación: los cálculos van sobre una versión diferida
  const text = useDeferredValue(note ? (content ?? loaded ?? '') : '');
  const textReady = !note || content !== undefined || loaded !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Nota que no es la abierta: su contenido se lee una vez (antes, lo pendiente de guardar)
  useEffect(() => {
    if (!note || content !== undefined) return;
    let cancelled = false;
    flushPendingSave(path)
      .then(() => filesApi.readFile(path))
      .then(
        (d) => !cancelled && setLoaded(d.content),
        (err: Error) => !cancelled && setError(err.message),
      );
    return () => {
      cancelled = true;
    };
  }, [path, note, content === undefined]);

  useEffect(() => {
    const ctrl = new AbortController();
    setNotice('');
    searchApi
      .noteInfo(path, {
        signal: ctrl.signal,
        onWait: (ms) => setNotice(t('search.rateLimitedWait', { s: Math.max(1, Math.ceil(ms / 1000)) })),
      })
      .then(
        (info) => {
          if (ctrl.signal.aborted) return;
          setData(info);
          setError('');
        },
        (err: Error) => {
          if (err.name !== 'AbortError') setError(err.message);
        },
      )
      .finally(() => {
        if (!ctrl.signal.aborted) setNotice('');
      });
    return () => ctrl.abort();
  }, [path, reload]);

  // Se vuelve a pedir al guardar la nota (cambian el tamaño y la fecha) y cuando el servidor
  // reescribe enlaces de otras notas (renombrar o mover)
  useEffect(() => {
    let timer: number | undefined;
    const onSaved = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== path) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => setReload((n) => n + 1), SAVED_REFRESH_DELAY);
    };
    const onChanged = () => setReload((n) => n + 1);
    window.addEventListener(NOTE_SAVED, onSaved);
    window.addEventListener(NOTES_CHANGED, onChanged);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(NOTE_SAVED, onSaved);
      window.removeEventListener(NOTES_CHANGED, onChanged);
    };
  }, [path]);

  const paths = useMemo(() => tree.filter((i) => i.type !== 'folder').map((i) => i.path), [tree]);
  const stats = useMemo(() => textStats(text), [text]);
  const outgoing = useMemo(() => (note ? outgoingLinks(text, path, paths) : []), [text, path, note, paths]);
  const tags = useMemo(() => noteTags(text), [text]);

  const backlinks = useMemo<LinkRow[]>(() => {
    const matchers = hiddenMatchers(hiddenFolders);
    return (data?.backlinks ?? [])
      .filter((b) => !matchers.length || !isHiddenPath(b.path, false, matchers))
      .map((b) => ({ key: b.path, path: b.path, label: noteTitle(b.path), count: b.count }));
  }, [data, hiddenFolders]);

  // Abrir un enlace o buscar una etiqueta cierra el diálogo
  const open = (target: string) => {
    openFile(target, fileName(target));
    onClose();
  };

  const n = (value: number) => value.toLocaleString(getLang());
  // Tamaño: el del texto que se está editando (UTF-8) si es la nota abierta; si no, el del disco
  const size = content !== undefined && note ? new TextEncoder().encode(text).length : data?.size;
  const readingTime =
    stats.words === 0
      ? t('info.minutes', { n: 0 })
      : stats.minutes < 1
        ? t('info.lessThanMinute')
        : t('info.minutes', { n: Math.round(stats.minutes) });
  const encoding =
    data && note
      ? [
          data.encoding ? (data.bom ? t('info.utf8Bom') : data.encoding) : t('info.notUtf8'),
          data.lineEndings === 'mixed' ? t('info.mixedEndings') : data.lineEndings,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;
  const pending = <div className="dropdown-empty">{error || t('common.loading')}</div>;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="note-info-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('note.info')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-titlebar">
          <span className="note-info-title" title={path}>
            {noteTitle(path)}
          </span>
          <div className="note-info-actions">
            <button className="icon-btn" title={t('common.refresh')} onClick={() => setReload((n) => n + 1)}>
              <IconSync size={16} />
            </button>
            <button className="icon-btn" title={t('common.close')} onClick={onClose}>
              <IconClose size={16} />
            </button>
          </div>
        </div>
        <div className="note-info">
          {notice && <div className="search-summary-warning">{notice}</div>}
          {error && data && <div className="search-summary-warning">{error}</div>}

          <Section title={t('info.file')}>
            <dl className="note-info-grid">
              <Row label={t('info.path')}>
                <span className="note-info-path">{path}</span>
              </Row>
              <Row label={t('info.size')}>{size === undefined ? '…' : formatBytes(size)}</Row>
              <Row label={t('info.created')} title={data?.created ? formatDate(data.created) : undefined}>
                {data ? (data.created ? relativeTime(data.created) : t('info.unknown')) : '…'}
              </Row>
              <Row label={t('info.modified')} title={data ? formatDate(data.modified) : undefined}>
                {data ? relativeTime(data.modified) : '…'}
              </Row>
              {note && <Row label={t('info.encoding')}>{encoding ?? '…'}</Row>}
            </dl>
            {!data && error && pending}
          </Section>

          {note && (
            <Section title={t('info.stats')}>
              {textReady ? (
                <dl className="note-info-grid" title={t('info.statsHint')}>
                  <Row label={t('info.words')}>{n(stats.words)}</Row>
                  <Row label={t('info.chars')}>{n(stats.chars)}</Row>
                  <Row label={t('info.charsNoSpaces')}>{n(stats.charsNoSpaces)}</Row>
                  <Row label={t('info.readingTime')}>{readingTime}</Row>
                  <Row label={t('info.paragraphs')}>{n(stats.paragraphs)}</Row>
                  <Row label={t('info.lines')}>{n(stats.lines)}</Row>
                </dl>
              ) : (
                pending
              )}
            </Section>
          )}

          {note && (
            <Section title={t('info.outgoing')} count={textReady ? outgoing.length : undefined}>
              {textReady ? <LinkList rows={outgoing} empty={t('info.noOutgoing')} onOpen={open} /> : pending}
            </Section>
          )}

          <Section title={t('info.backlinks')} count={data ? backlinks.length : undefined}>
            {data ? <LinkList rows={backlinks} empty={t('info.noBacklinks')} onOpen={open} /> : pending}
          </Section>

          {note && (
            <Section title={t('info.tags')} count={textReady ? tags.length : undefined}>
              {!textReady ? (
                pending
              ) : tags.length ? (
                <div className="note-info-tags">
                  {tags.map(({ tag, count }) => (
                    <button
                      type="button"
                      key={tag}
                      className="note-info-tag"
                      title={count > 1 ? `#${tag} (${count})` : `#${tag}`}
                      onClick={() => {
                        searchTag(tag);
                        onClose();
                      }}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dropdown-empty">{t('info.noTags')}</div>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
