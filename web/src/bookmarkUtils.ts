// Funciones puras de los marcadores (sin store ni React): claves, orden visual, etiquetas y
// búsqueda de encabezados. Las acciones que los abren viven en bookmarks.ts
import type { Bookmark, BookmarkStore } from './types';
import { fileName, noteTitle } from './paths';

export const MAX_BOOKMARKS = 1000;

// Identidad de un marcador: un mismo archivo, carpeta o encabezado no se marca dos veces
export const bookmarkKey = (b: { type: string; path: string; heading?: string }) =>
  `${b.type}\u0000${b.path}\u0000${b.heading ?? ''}`;

export const newBookmarkId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Orden en que se ven en el panel (y el de los atajos Alt+1..9): primero los sin grupo, luego
// cada grupo en su orden, y dentro de cada uno el orden de la lista
export const visualOrder = (store: BookmarkStore): Bookmark[] => [
  ...store.items.filter((b) => !b.group),
  ...store.groups.flatMap((g) => store.items.filter((b) => b.group === g)),
];

// Etiqueta por defecto: nota sin extensión, "Nota › Encabezado" o carpeta con barra final
export const defaultLabel = (b: Bookmark): string => {
  if (b.label) return b.label;
  if (b.type === 'heading') return `${noteTitle(b.path)} › ${b.heading}`;
  if (b.type === 'folder') return `${fileName(b.path)}/`;
  return noteTitle(b.path);
};

// Encabezados de una nota con su línea (1-indexed sobre el archivo completo, frontmatter incluido,
// como espera setPendingLine). Ignora el frontmatter YAML y los bloques de código
export interface HeadingRef {
  text: string;
  level: number;
  line: number;
}

export const headingsOf = (content: string): HeadingRef[] => {
  const lines = content.split(/\r?\n/);
  const out: HeadingRef[] = [];
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, i) => i > 0 && (l.trim() === '---' || l.trim() === '...'));
    if (close > 0) start = close + 1;
  }
  let fence: string | null = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ text: m[2].trim(), level: m[1].length, line: i + 1 });
  }
  return out;
};

// Línea del primer encabezado con ese texto (sin distinguir mayúsculas), o null si ya no existe
export const findHeadingLine = (content: string, heading: string): number | null => {
  const wanted = heading.trim().toLowerCase();
  const found = headingsOf(content).find((h) => h.text.toLowerCase() === wanted);
  return found ? found.line : null;
};
