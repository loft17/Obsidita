import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { applyPathChange } from './fileActions';
import { noteTitle, renamedPath } from '../paths';
import { useT } from '../i18n';

const INVALID_CHARS = /[\\/:*?"<>|]/;

// Los archivos ocultos no se listan en el explorador (el servidor los omite): crearlos desde
// aquí dejaría la nota abierta en una pestaña pero invisible en el árbol
const isValidName = (name: string) => !INVALID_CHARS.test(name) && !name.startsWith('.');

// Título en línea: el nombre del archivo encima de la nota; al editarlo se renombra el archivo
export default function InlineTitle({ filePath, onEnter }: { filePath: string; onEnter?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const t = useT();
  const name = noteTitle(filePath);

  // contentEditable no es controlado por React: sincronizar el texto a mano al cambiar de nota
  useEffect(() => {
    if (ref.current) ref.current.textContent = name;
    setError('');
  }, [name]);

  const restore = () => {
    if (ref.current) ref.current.textContent = name;
  };

  const commit = async () => {
    const newName = (ref.current?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (newName === name) return restore();
    if (!newName) {
      setError(t('name.empty'));
      return restore();
    }
    if (!isValidName(newName)) {
      setError(t('name.invalid'));
      return restore();
    }
    try {
      await applyPathChange(filePath, renamedPath(filePath, newName));
      setError('');
    } catch (err) {
      setError((err as Error).message);
      restore();
    }
  };

  return (
    <div className="inline-title-wrap">
      <div
        ref={ref}
        className="inline-title"
        contentEditable="plaintext-only"
        role="textbox"
        aria-label={t('name.noteTitle')}
        aria-multiline={false}
        spellCheck={true}
        suppressContentEditableWarning
        onBlur={commit}
        onInput={() => error && setError('')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            ref.current?.blur();
            onEnter?.();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            restore();
            ref.current?.blur();
          }
        }}
      />
      {error && <div className="inline-title-error">{error}</div>}
    </div>
  );
}
