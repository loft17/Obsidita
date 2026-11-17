import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { linksApi } from '../api';
import { SHORTLINKS_CHANGED } from '../shortLinks';
import { useT } from '../i18n';
import { IconBookmark, IconLink } from './Icons';

interface Props {
  content: string;
  filePath: string | null;
}

export default function StatusBar({ content, filePath }: Props) {
  const t = useT();
  // El contador de caracteres es O(1); el de palabras recorre la nota entera y `content` cambia
  // en cada pulsación: se calcula sobre una versión diferida para no bloquear la escritura
  const charCount = content.length;
  const deferredContent = useDeferredValue(content);
  const wordCount = useMemo(
    () =>
      deferredContent
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0).length,
    [deferredContent],
  );

  // Marcador: la lista de marcadores ya está en el store, basta con buscar esta ruta
  const bookmarked = useStore((s) => !!filePath && s.bookmarks.some((b) => b.type === 'file' && b.path === filePath));

  // Enlace corto: se piden todos y se busca esta ruta. Se vuelve a pedir al crear o borrar uno
  const [linkedPaths, setLinkedPaths] = useState<string[] | null>(null);
  useEffect(() => {
    if (!filePath) return;
    let alive = true;
    const load = () =>
      linksApi
        .list()
        .then(({ links }) => alive && setLinkedPaths(links.map((l) => l.path)))
        .catch(() => {});
    load();
    window.addEventListener(SHORTLINKS_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(SHORTLINKS_CHANGED, load);
    };
  }, [filePath]);
  const shortLinked = !!filePath && !!linkedPaths?.includes(filePath);

  return (
    <div className="status-bar">
      <div className="status-bar-item">{t(wordCount === 1 ? 'status.word' : 'status.words', { n: wordCount })}</div>
      <div className="status-bar-item">{t(charCount === 1 ? 'status.char' : 'status.chars', { n: charCount })}</div>
      {/* Los iconos solo aparecen si la nota tiene enlace corto o está en marcadores */}
      {shortLinked && (
        <span className="status-bar-indicator is-on" title={t('status.shortLink')} role="img" aria-label={t('status.shortLink')}>
          <IconLink size={13} />
        </span>
      )}
      {bookmarked && (
        <span
          className="status-bar-indicator is-on is-filled"
          title={t('status.bookmarked')}
          role="img"
          aria-label={t('status.bookmarked')}
        >
          <IconBookmark size={13} />
        </span>
      )}
    </div>
  );
}
