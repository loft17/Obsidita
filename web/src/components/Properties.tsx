import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { formatDate, isDateString, parseDate, type FrontmatterData } from '../frontmatter';
import { attachmentUrl } from '../attachments';
import { searchApi, type VaultProperty } from '../api';
import { useT } from '../i18n';
import {
  IconTag,
  IconCalendar,
  IconText,
  IconLink,
  IconAliases,
  IconHash,
  IconCheckSquare,
  IconClose,
  IconPlus,
  IconImage,
} from './Icons';

interface Props {
  data: FrontmatterData;
  editable?: boolean;
  onChange?: (data: FrontmatterData) => void;
  onTagClick?: (tag: string) => void;
  // Ruta de la nota, para resolver imágenes del vault relativas a ella
  notePath?: string;
}

type Kind = 'tags' | 'list' | 'date' | 'number' | 'checkbox' | 'image' | 'text';

function kindOf(key: string, value: unknown): Kind {
  // Como en el índice del servidor: `tags`, `tag`, `Tags`...
  if (/^tags?$/i.test(key)) return 'tags';
  // cssclasses también es una lista en Obsidian, no una cadena
  if (key === 'aliases' || key === 'cssclasses' || Array.isArray(value)) return 'list';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'checkbox';
  if (isDateString(value)) return 'date';
  // Solo `image`/`imagen` con texto: se muestra la imagen debajo del valor
  if (/^(image|imagen)$/i.test(key) && (value === undefined || value === null || typeof value === 'string')) return 'image';
  return 'text';
}

// Propiedades con significado especial en Obsidian, sugeridas al añadir una
const KNOWN_KEYS = ['tags', 'aliases', 'cssclasses'];

// Variantes habituales que se escriben por error y se guardan con el nombre que reconoce Obsidian
const KEY_ALIASES: Record<string, string> = {
  tag: 'tags',
  etiqueta: 'tags',
  etiquetas: 'tags',
  etiquetes: 'tags',
  alias: 'aliases',
  cssclass: 'cssclasses',
};

function normalizeKey(raw: string): string {
  const key = raw.trim().replace(/:$/, '').trim();
  const lower = key.toLowerCase();
  if (KNOWN_KEYS.includes(lower)) return lower;
  return KEY_ALIASES[lower] ?? key;
}

const toList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined || value === '') return [];
  return [String(value)];
};

const toText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const ICONS: Record<Kind, typeof IconText> = {
  tags: IconTag,
  list: IconAliases,
  date: IconCalendar,
  number: IconHash,
  checkbox: IconCheckSquare,
  image: IconImage,
  text: IconText,
};

function ChipList({
  items,
  pill,
  editable,
  autoFocus,
  onChange,
  onItemClick,
}: {
  items: string[];
  pill: boolean;
  editable: boolean;
  autoFocus?: boolean;
  onChange: (items: string[]) => void;
  onItemClick?: (item: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const t = useT();

  // Los tags no llevan espacios: comas y espacios separan varios de golpe (también al pegar)
  const add = (text: string) => {
    const parts = pill ? text.split(/[,\s]+/).map((s) => s.replace(/^#/, '')) : [text];
    const next = [...items];
    for (const part of parts.map((s) => s.trim())) if (part && !next.includes(part)) next.push(part);
    if (next.length > items.length) onChange(next);
  };

  const commit = () => {
    setDraft('');
    add(draft);
  };

  // Los teclados móviles no siempre envían `key === ','` mientras componen la palabra:
  // el separador se detecta en el propio texto
  const onInput = (value: string) => {
    if (pill && /[,\s]/.test(value)) {
      const done = value.replace(/[^,\s]*$/, '');
      add(done);
      setDraft(value.slice(done.length));
    } else {
      setDraft(value);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      onChange(items.slice(0, -1));
    }
  };

  return (
    <div className="chip-list">
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className={`${pill ? 'chip chip-pill' : 'chip'}${onItemClick ? ' clickable' : ''}`}
          title={onItemClick ? t('props.searchTag', { tag: item }) : undefined}
          role={onItemClick ? 'button' : undefined}
          tabIndex={onItemClick ? 0 : undefined}
          onClick={onItemClick && (() => onItemClick(item))}
          onKeyDown={
            onItemClick &&
            ((e) => {
              // Ignora las teclas que suben desde el botón de quitar
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onItemClick(item);
              }
            })
          }
        >
          {item}
          {editable && (
            <button
              type="button"
              className="chip-remove"
              title={t('props.removeValue')}
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <IconClose size={14} />
            </button>
          )}
        </span>
      ))}
      {editable && (
        // En un form, la tecla "Intro" de los teclados móviles llega siempre como submit
        <form
          className="chip-form"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <input
            className="chip-input"
            autoFocus={autoFocus}
            value={draft}
            enterKeyHint="done"
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
          />
        </form>
      )}
    </div>
  );
}

// Admite URL (http/https) o una ruta/enlace del vault: `foto.jpg`, `[[foto.jpg]]` o `![[foto.jpg]]`
function imageSrc(value: string, notePath: string): string | null {
  const text = value.trim().replace(/^!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/, '$1').trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text)) return text;
  // Otros esquemas (javascript:, file:...) no se cargan
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//')) return null;
  return attachmentUrl(text, notePath);
}

function PropertyImage({ src }: { src: string }) {
  // Se recuerda qué src falló para volver a intentarlo si cambia la URL
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === src) return null;
  return (
    <a className="property-image" href={src} target="_blank" rel="noreferrer noopener">
      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />
    </a>
  );
}

function DateText({ value }: { value: string }) {
  const [y, m, d] = (parseDate(value)?.iso ?? value).split('-');
  return (
    <span className="date-value">
      <IconCalendar size={14} />
      <span>
        {d}
        <span className="date-sep">/</span>
        {m}
        <span className="date-sep">/</span>
        {y}
      </span>
      <IconLink size={14} className="date-link" />
    </span>
  );
}

type Candidate = { key: string; kind: Kind };

// Selector de nombre para una propiedad nueva: lista filtrable con las propiedades del vault
// (y las especiales de Obsidian), con iconos por tipo y navegación con las flechas
function NewPropertyPicker({
  existing,
  onPick,
  onCancel,
}: {
  existing: string[];
  onPick: (name: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [vault, setVault] = useState<VaultProperty[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Se elige una sola vez: el blur que llega tras Intro o Escape no debe añadir nada más
  const done = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    // Sin conexión o con el límite de búsquedas, quedan solo las propiedades especiales
    searchApi
      .properties({ signal: ac.signal, retries: 0 })
      .then(setVault)
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const candidates = useMemo(() => {
    const seen = new Set(existing.map((k) => k.toLowerCase()));
    const list: Candidate[] = [];
    const add = (key: string, kind: Kind) => {
      const id = key.toLowerCase();
      if (seen.has(id)) return;
      seen.add(id);
      list.push({ key, kind });
    };
    for (const k of KNOWN_KEYS) add(k, kindOf(k, undefined));
    for (const p of vault) add(p.key, p.kind);
    return list;
  }, [existing, vault]);

  const q = query.trim().toLowerCase();
  const filtered = candidates.filter((c) => c.key.toLowerCase().includes(q));
  const current = filtered[active];

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const finish = (name: string) => {
    if (done.current) return;
    done.current = true;
    onPick(name);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const Icon = ICONS[current?.kind ?? 'text'];

  return (
    <div className="property-new">
      <div className="property-row editable">
        <span className="property-key">
          <Icon size={16} />
        </span>
        <div className="property-value">
          <input
            className="property-new-key"
            autoFocus
            placeholder={t('props.name')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                finish(current ? current.key : query);
              } else if (e.key === 'Escape') {
                cancel();
              }
            }}
            onBlur={() => finish(query)}
          />
        </div>
      </div>
      {filtered.length > 0 && (
        // preventDefault en el mousedown mantiene el foco en el campo (también al usar la barra)
        <div className="property-picker" ref={listRef} role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {filtered.map((c, i) => {
            const ItemIcon = ICONS[c.kind];
            return (
              <button
                key={c.key}
                type="button"
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                className={i === active ? 'property-picker-item active' : 'property-picker-item'}
                onMouseEnter={() => setActive(i)}
                onClick={() => finish(c.key)}
              >
                <ItemIcon size={16} />
                <span>{c.key}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Properties({ data, editable = false, onChange, onTagClick, notePath = '' }: Props) {
  const [adding, setAdding] = useState(false);
  // Propiedad recién añadida, cuyo valor recibe el foco
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const t = useT();
  // Arrastre por el icono de cada propiedad: `from` es la fila que se mueve y `to` el hueco
  // donde caería (0 = antes de la primera, n = después de la última)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  const entries = Object.entries(data).filter(
    ([, value]) =>
      editable ||
      (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)),
  );

  if (!editable && entries.length === 0) return null;

  const setValue = (key: string, value: unknown) => onChange?.({ ...data, [key]: value });

  const removeKey = (key: string) => {
    const next = { ...data };
    delete next[key];
    onChange?.(next);
  };

  // El orden de las claves del objeto es el orden en que se escriben en el frontmatter
  const moveTo = (from: number, insertAt: number) => {
    const keys = Object.keys(data);
    const to = insertAt > from ? insertAt - 1 : insertAt;
    if (to === from) return;
    const [key] = keys.splice(from, 1);
    keys.splice(to, 0, key);
    onChange?.(Object.fromEntries(keys.map((k) => [k, data[k]])));
  };

  // Hueco más cercano según la altura del puntero: la mitad superior de una fila va antes que ella
  const dropIndex = (clientY: number) => {
    for (let i = 0; i < entries.length; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return entries.length;
  };

  const startDrag = (e: ReactPointerEvent<HTMLSpanElement>, index: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index });
  };

  const moveDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    const to = dropIndex(e.clientY);
    if (to !== drag.to) setDrag({ ...drag, to });
  };

  const endDrag = () => {
    if (drag) moveTo(drag.from, drag.to);
    setDrag(null);
  };

  // Con un hueco justo encima o debajo de la fila no hay nada que mover: no se marca
  const showLine = drag !== null && drag.to !== drag.from && drag.to !== drag.from + 1;

  const addProperty = (name: string) => {
    const key = normalizeKey(name);
    setAdding(false);
    if (!key || Object.keys(data).some((k) => k.toLowerCase() === key.toLowerCase())) return;
    // Las propiedades de tipo lista (tags, aliases, cssclasses) empiezan vacías
    const kind = kindOf(key, undefined);
    onChange?.({ ...data, [key]: kind === 'tags' || kind === 'list' ? [] : '' });
    // El foco pasa al valor recién creado para poder escribirlo enseguida
    setFocusKey(key);
  };

  return (
    <div className="properties">
      {entries.length > 0 && <div className="properties-heading">{t('props.title')}</div>}
      {entries.map(([key, value], index) => {
        const kind = kindOf(key, value);
        const Icon = ICONS[kind];
        const img = kind === 'image' ? imageSrc(toText(value), notePath) : null;
        const rowClass = [
          editable ? 'property-row editable' : 'property-row',
          drag?.from === index && 'dragging',
          showLine && drag.to === index && 'drop-before',
          showLine && drag.to === entries.length && index === entries.length - 1 && 'drop-after',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div key={key} className={rowClass} ref={(el) => void (rowRefs.current[index] = el)}>
            <span className="property-key">
              {/* El icono es el asa: arrastrarlo reordena la propiedad */}
              <span
                className={editable ? 'property-grip' : undefined}
                title={editable ? t('props.drag') : undefined}
                onPointerDown={editable ? (e) => startDrag(e, index) : undefined}
                onPointerMove={editable ? moveDrag : undefined}
                onPointerUp={editable ? endDrag : undefined}
                onPointerCancel={editable ? () => setDrag(null) : undefined}
              >
                <Icon size={16} />
              </span>
              <span className="property-label">{key}</span>
            </span>
            <div className={img ? 'property-value property-value-image' : 'property-value'}>
              {kind === 'tags' || kind === 'list' ? (
                <ChipList
                  items={toList(value)}
                  pill={kind === 'tags'}
                  editable={editable}
                  autoFocus={key === focusKey}
                  onChange={(items) => setValue(key, items)}
                  onItemClick={kind === 'tags' && !editable ? onTagClick : undefined}
                />
              ) : kind === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={value === true}
                  disabled={!editable}
                  onChange={(e) => setValue(key, e.target.checked)}
                />
              ) : editable ? (
                <input
                  className="property-input"
                  autoFocus={key === focusKey}
                  type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'}
                  // El selector trabaja en AAAA-MM-DD; al elegir una fecha se escribe con el formato de la nota
                  value={kind === 'date' ? (parseDate(toText(value))?.iso ?? '') : toText(value)}
                  onChange={(e) => {
                    const text = e.target.value;
                    // Al escribir, el tipo del campo puede cambiar (p. ej. al completar una fecha) y la
                    // fila se vuelve a montar: el foco se pide de nuevo para no perder lo que se escribe
                    setFocusKey(key);
                    if (kind === 'date') {
                      const style = parseDate(toText(value))?.style ?? 'iso';
                      setValue(key, text ? formatDate(text, style) : '');
                    } else {
                      setValue(key, kind === 'number' && text !== '' ? Number(text) : text);
                    }
                  }}
                />
              ) : kind === 'date' ? (
                <DateText value={value as string} />
              ) : (
                <span>{toText(value)}</span>
              )}
              {img && <PropertyImage src={img} />}
            </div>
            {editable && (
              <div className="property-actions">
                <button
                  type="button"
                  className="property-action property-remove"
                  title={t('props.remove')}
                  onClick={() => removeKey(key)}
                >
                  <IconClose size={14} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {editable &&
        (adding ? (
          <NewPropertyPicker
            existing={Object.keys(data)}
            onPick={addProperty}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="property-add" onClick={() => setAdding(true)}>
            <IconPlus size={16} />
            {t('props.add')}
          </button>
        ))}
    </div>
  );
}
