// Catálogo completo de emojis (Unicode) con los grupos de categoría de Unicode, como en el iPhone.
// Los datos vienen de emojibase-data y se cargan solo al abrir el selector, por idioma de la interfaz.
import type { Lang } from './i18n';

interface RawEmoji {
  hexcode: string;
  label: string;
  unicode: string;
  group?: number;
  order?: number;
  tags?: string[];
}

export interface EmojiItem {
  emoji: string;
  group: number;
  // Texto en el que se busca: nombre + palabras clave, sin tildes y en minúsculas
  search: string;
}

// Categorías en el orden del selector. Se omiten el grupo 2 (componentes: tonos de piel, peinados)
export const EMOJI_GROUPS: { id: number; icon: string; key: 'smileys' | 'people' | 'nature' | 'food' | 'travel' | 'activities' | 'objects' | 'symbols' | 'flags' }[] = [
  { id: 0, icon: '😀', key: 'smileys' },
  { id: 1, icon: '👋', key: 'people' },
  { id: 3, icon: '🐶', key: 'nature' },
  { id: 4, icon: '🍎', key: 'food' },
  { id: 5, icon: '🚗', key: 'travel' },
  { id: 6, icon: '⚽', key: 'activities' },
  { id: 7, icon: '💡', key: 'objects' },
  { id: 8, icon: '❤️', key: 'symbols' },
  { id: 9, icon: '🏁', key: 'flags' },
];

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Los idiomas sin datos propios (catalán) usan español
const DATA_LOADERS: Record<Lang, () => Promise<{ default: RawEmoji[] }>> = {
  es: () => import('emojibase-data/es/compact.json'),
  en: () => import('emojibase-data/en/compact.json'),
  ca: () => import('emojibase-data/es/compact.json'),
};

const cache = new Map<Lang, Promise<EmojiItem[]>>();

// Carga (una sola vez por idioma) la lista de emojis agrupada, ordenada como en Unicode
export function loadEmojis(lang: Lang): Promise<EmojiItem[]> {
  let p = cache.get(lang);
  if (!p) {
    p = DATA_LOADERS[lang]().then((mod) => {
      const groups = new Set(EMOJI_GROUPS.map((g) => g.id));
      return mod.default
        .filter((e) => e.group !== undefined && groups.has(e.group))
        .sort((a, b) => (a.group ?? 0) - (b.group ?? 0) || (a.order ?? 0) - (b.order ?? 0))
        .map((e) => ({
          emoji: e.unicode,
          group: e.group as number,
          search: normalize(`${e.label} ${(e.tags ?? []).join(' ')}`),
        }));
    });
    cache.set(lang, p);
  }
  return p;
}

// Emojis cuyo nombre o palabras clave contienen todas las palabras buscadas
export function filterEmojis(items: EmojiItem[], query: string): EmojiItem[] {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => words.every((w) => it.search.includes(w)));
}
