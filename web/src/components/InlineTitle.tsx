import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { filesApi } from '../api';
import { changeNotePath } from './Editor';
import { useT } from '../i18n';

const INVALID_CHARS = /[\\/:*?"<>|]/;

// Los archivos ocultos no se listan en el explorador (el servidor los omite): crearlos desde
// aquí dejaría la nota abierta en una pestaña pero invisible en el árbol
const isValidName = (name: string) => !INVALID_CHARS.test(name) && !name.startsWith('.');

const baseName = (path: string) => (path.split('/').pop() || '').replace(/\.md$/i, '');
const parentFolder = (path: string) => (path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '');

// Título en línea: el nombre del archivo encima de la nota; al editarlo se renombra el archivo
export default function InlineTitle({ filePath, onEnter }: { filePath: string; onEnter?: () => void }) {
  const setTree = useStore((s) => s.setTree);
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const t = useT();
  const name = baseName(filePath);

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
    const folder = parentFolder(filePath);
    // Sin esta comprobación, escribir "Nota.md" como título renombraría a "Nota.md.md"
    const ext = /\.md$/i.test(filePath) && !/\.md$/i.test(newName) ? '.md' : '';
    const newPath = `${folder ? folder + '/' : ''}${newName}${ext}`;
    try {
      await changeNotePath(filePath, newPath);
      setError('');
      setTree(await filesApi.getTree());
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
