import { useDeferredValue, useMemo } from 'react';
import { useT } from '../i18n';

interface Props {
  content: string;
}

export default function StatusBar({ content }: Props) {
  const t = useT();
  // El contador de caracteres es O(1); el de palabras recorre la nota entera y `content` cambia
  // en cada pulsación: se calcula sobre una versión diferida para no bloquear la escritura
  const charCount = content.length;
  const deferredContent = useDeferredValue(content);
  const wordCount = useMemo(
    () => deferredContent.trim().split(/\s+/).filter((w) => w.length > 0).length,
    [deferredContent]
  );

  return (
    <div className="status-bar">
      <div className="status-bar-item">{t(wordCount === 1 ? 'status.word' : 'status.words', { n: wordCount })}</div>
      <div className="status-bar-item">{t(charCount === 1 ? 'status.char' : 'status.chars', { n: charCount })}</div>
    </div>
  );
}
