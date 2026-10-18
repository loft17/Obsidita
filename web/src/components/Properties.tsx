import { useState, type KeyboardEvent } from 'react';
import { isDateString, type FrontmatterData } from '../frontmatter';
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
  IconChevronUp,
  IconChevronDown,
} from './Icons';

interface Props {
  data: FrontmatterData;
  editable?: boolean;
  onChange?: (data: FrontmatterData) => void;
  onTagClick?: (tag: string) => void;
}

type Kind = 'tags' | 'list' | 'date' | 'number' | 'checkbox' | 'text';

function kindOf(key: string, value: unknown): Kind {
  // Como en el índice del servidor: `tags`, `tag`, `Tags`...
  if (/^tags?$/i.test(key)) return 'tags';
  // cssclasses también es una lista en Obsidian, no una cadena
  if (key === 'aliases' || key === 'cssclasses' || Array.isArray(value)) return 'list';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'checkbox';
  if (isDateString(value)) return 'date';
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
  text: IconText,
};

function ChipList({
  items,
  pill,
  editable,
  onChange,
  onItemClick,
}: {
  items: string[];
  pill: boolean;
  editable: boolean;
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
          onClick={onItemClick && (() => onItemClick(item))}
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

function DateText({ value }: { value: string }) {
  const [y, m, d] = value.split('-');
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

export default function Properties({ data, editable = false, onChange, onTagClick }: Props) {
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const t = useT();

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
  const moveKey = (key: string, delta: number) => {
    const keys = Object.keys(data);
    const from = keys.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= keys.length) return;
    keys.splice(to, 0, ...keys.splice(from, 1));
    onChange?.(Object.fromEntries(keys.map((k) => [k, data[k]])));
  };

  const addProperty = () => {
    const key = normalizeKey(newKey);
    setAdding(false);
    setNewKey('');
    if (!key || Object.keys(data).some((k) => k.toLowerCase() === key.toLowerCase())) return;
    // Las propiedades de tipo lista (tags, aliases, cssclasses) empiezan vacías
    const kind = kindOf(key, undefined);
    onChange?.({ ...data, [key]: kind === 'tags' || kind === 'list' ? [] : '' });
  };

  return (
    <div className="properties">
      {entries.length > 0 && <div className="properties-heading">{t('props.title')}</div>}
      {entries.map(([key, value], index) => {
        const kind = kindOf(key, value);
        const Icon = ICONS[kind];
        return (
          <div key={key} className={editable ? 'property-row editable' : 'property-row'}>
            <span className="property-key">
              <Icon size={16} />
              <span className="property-label">{key}</span>
            </span>
            <div className="property-value">
              {kind === 'tags' || kind === 'list' ? (
                <ChipList
                  items={toList(value)}
                  pill={kind === 'tags'}
                  editable={editable}
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
                  type={kind === 'date' ? 'date' : kind === 'number' ? 'number' : 'text'}
                  value={toText(value)}
                  onChange={(e) => {
                    const text = e.target.value;
                    setValue(key, kind === 'number' && text !== '' ? Number(text) : text);
                  }}
                />
              ) : kind === 'date' ? (
                <DateText value={value as string} />
              ) : (
                <span>{toText(value)}</span>
              )}
            </div>
            {editable && (
              <div className="property-actions">
                <button
                  type="button"
                  className="property-action"
                  title={t('props.moveUp')}
                  disabled={index === 0}
                  onClick={() => moveKey(key, -1)}
                >
                  <IconChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="property-action"
                  title={t('props.moveDown')}
                  disabled={index === entries.length - 1}
                  onClick={() => moveKey(key, 1)}
                >
                  <IconChevronDown size={14} />
                </button>
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
          <input
            className="property-new-key"
            autoFocus
            list="property-known-keys"
            placeholder={t('props.name')}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addProperty();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewKey('');
              }
            }}
            onBlur={addProperty}
          />
        ) : (
          <button type="button" className="property-add" onClick={() => setAdding(true)}>
            <IconPlus size={16} />
            {t('props.add')}
          </button>
        ))}
      {editable && adding && (
        <datalist id="property-known-keys">
          {KNOWN_KEYS.filter((k) => !Object.keys(data).some((d) => normalizeKey(d) === k)).map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      )}
    </div>
  );
}
