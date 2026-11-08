import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import { isMobile } from '../mobile';
import { searchEmojis } from '../emojis';
import { IconChevronDown, IconSmile } from './Icons';

const RECENT_KEY = 'obsidita.emojiRecent';
const RECENT_MAX = 16;

// Recientes guardados en el navegador; si no hay acceso a localStorage, simplemente no se recuerdan
function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* sin almacenamiento disponible: no pasa nada */
  }
}

// Botón con desplegable de búsqueda de emojis; al elegir uno se llama a onPick con el emoji
export default function EmojiPicker({ title, onPick }: { title: string; onPick: (emoji: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(loadRecent);
  // En el móvil la barra se desliza en horizontal y recortaría el desplegable: se coloca fijo bajo el botón
  const [fixedAt, setFixedAt] = useState<CSSProperties>();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      const inside = ref.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const show = () => {
    if (isMobile() && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setFixedAt({
        position: 'fixed',
        top: r.bottom + 4,
        left: Math.max(4, Math.min(r.left, window.innerWidth - 310)),
      });
    } else setFixedAt(undefined);
    setQuery('');
    setOpen(true);
    // El foco pasa al buscador; la selección del editor se conserva
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pick = (emoji: string) => {
    onPick(emoji);
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
    setOpen(false);
  };

  const searching = query.trim() !== '';
  const results = searchEmojis(query);

  // Intro en el buscador elige el primer resultado
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && results.length) {
      e.preventDefault();
      pick(results[0]);
    }
  };

  const cell = (emoji: string) => (
    <button
      key={emoji}
      type="button"
      className="emoji-cell"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(emoji)}
    >
      {emoji}
    </button>
  );

  return (
    <div className="toolbar-menu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={'toolbar-btn' + (open ? ' active' : '')}
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <IconSmile />
        <IconChevronDown size={10} className="toolbar-caret" />
      </button>
      {open && (
        <div className="emoji-popover" role="dialog" aria-label={title} style={fixedAt}>
          <input
            ref={inputRef}
            type="search"
            className="emoji-search"
            placeholder={t('emoji.search')}
            aria-label={t('emoji.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
          />
          <div className="emoji-scroll">
            {!searching && recent.length > 0 && (
              <>
                <div className="emoji-label">{t('emoji.recent')}</div>
                <div className="emoji-grid">{recent.map(cell)}</div>
              </>
            )}
            {results.length > 0 ? (
              <div className="emoji-grid">{results.map(cell)}</div>
            ) : (
              <div className="emoji-empty">{t('emoji.none')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
