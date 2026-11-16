import type { MessageKey } from './i18n';

// Botones de la cinta (la barra vertical de la izquierda), en su orden predeterminado. La cinta
// (components/Ribbon.tsx) los muestra según el orden y los ocultos guardados en las preferencias.
// Ajustes y cerrar sesión no están aquí: siempre quedan fijos abajo
export const RIBBON_IDS = [
  'sidebar',
  'files',
  'search',
  'tags',
  'trash',
  'bookmarks',
  'shortlinks',
  'daily',
  'templates',
] as const;
export type RibbonId = (typeof RIBBON_IDS)[number];

export const RIBBON_LABELS: Record<RibbonId, MessageKey> = {
  sidebar: 'sidebar.toggle',
  files: 'sidebar.files',
  search: 'sidebar.search',
  tags: 'sidebar.tags',
  trash: 'sidebar.trash',
  bookmarks: 'sidebar.bookmarks',
  shortlinks: 'sidebar.shortlinks',
  daily: 'daily.open',
  templates: 'templates.insert',
};

// Orden efectivo: primero los ids guardados que existan, después los que falten (botones nuevos
// o preferencias editadas a mano). Cada entrada indica si el botón está visible
export function ribbonLayout(order: string[], hidden: string[]): { id: RibbonId; visible: boolean }[] {
  const known: readonly string[] = RIBBON_IDS;
  const ids = [...new Set([...order, ...known])].filter((id): id is RibbonId => known.includes(id));
  return ids.map((id) => ({ id, visible: !hidden.includes(id) }));
}
