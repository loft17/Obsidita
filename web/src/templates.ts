// Notas diarias y plantillas, compatibles con los plugins del mismo nombre de Obsidian de escritorio:
// misma configuración (.obsidian/daily-notes.json y templates.json), mismos formatos de fecha (moment.js)
// y mismas variables en las plantillas: {{title}}, {{date}}, {{time}}, {{date:FORMATO}} y {{time:FORMATO}}
import { useStore } from './store';
import { filesApi, settingsApi, type NotesConfig } from './api';
import { getLang, t } from './i18n';
import { notify } from './toast';

export const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TIME_FORMAT = 'HH:mm';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

// Los nombres de meses y días siguen el idioma de la interfaz
const locale = getLang;
const monthName = (d: Date, month: 'long' | 'short') => d.toLocaleDateString(locale(), { month });
const weekdayName = (d: Date, weekday: 'long' | 'short' | 'narrow') => d.toLocaleDateString(locale(), { weekday });

// Semana ISO 8601 (lunes como primer día; la semana 1 contiene el primer jueves del año)
const isoWeek = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const ordinal = (n: number) => {
  if (locale().toLowerCase().startsWith('es')) return `${n}º`;
  if (locale().toLowerCase().startsWith('ca')) return n + ({ 1: 'r', 2: 'n', 3: 'r', 4: 't' }[n] ?? 'è');
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const TOKENS: Record<string, (d: Date) => string> = {
  YYYY: (d) => String(d.getFullYear()),
  YY: (d) => pad(d.getFullYear() % 100),
  MMMM: (d) => monthName(d, 'long'),
  MMM: (d) => monthName(d, 'short'),
  MM: (d) => pad(d.getMonth() + 1),
  M: (d) => String(d.getMonth() + 1),
  Do: (d) => ordinal(d.getDate()),
  DD: (d) => pad(d.getDate()),
  D: (d) => String(d.getDate()),
  dddd: (d) => weekdayName(d, 'long'),
  ddd: (d) => weekdayName(d, 'short'),
  dd: (d) => weekdayName(d, 'narrow'),
  d: (d) => String(d.getDay()),
  E: (d) => String(d.getDay() || 7),
  WW: (d) => pad(isoWeek(d)),
  W: (d) => String(isoWeek(d)),
  ww: (d) => pad(isoWeek(d)),
  w: (d) => String(isoWeek(d)),
  HH: (d) => pad(d.getHours()),
  H: (d) => String(d.getHours()),
  hh: (d) => pad(d.getHours() % 12 || 12),
  h: (d) => String(d.getHours() % 12 || 12),
  mm: (d) => pad(d.getMinutes()),
  m: (d) => String(d.getMinutes()),
  ss: (d) => pad(d.getSeconds()),
  s: (d) => String(d.getSeconds()),
  A: (d) => (d.getHours() < 12 ? 'AM' : 'PM'),
  a: (d) => (d.getHours() < 12 ? 'am' : 'pm'),
  X: (d) => String(Math.floor(d.getTime() / 1000)),
};

// Los tokens más largos primero; el texto entre corchetes se copia tal cual: [Semana] WW
const TOKEN_RE = new RegExp(
  `\\[([^\\]]*)\\]|${Object.keys(TOKENS).sort((a, b) => b.length - a.length).join('|')}`,
  'g'
);

// Formatea una fecha con la sintaxis de moment.js (la que usa Obsidian)
export const formatDate = (date: Date, format: string) =>
  format.replace(TOKEN_RE, (match, literal) => (literal !== undefined ? literal : TOKENS[match](date)));

// Sustituye las variables de una plantilla
export const applyTemplate = (text: string, title: string, config: NotesConfig['templates'], date = new Date()) =>
  text.replace(/{{\s*(title|date|time)\s*(?::([^}]*))?}}/gi, (_, name: string, format?: string) => {
    const key = name.toLowerCase();
    if (key === 'title') return title;
    const fallback = key === 'date' ? config.dateFormat || DEFAULT_DATE_FORMAT : config.timeFormat || DEFAULT_TIME_FORMAT;
    return formatDate(date, format?.trim() || fallback);
  });

const withMd = (path: string) => (/\.md$/i.test(path) ? path : `${path}.md`);
const noteTitle = (path: string) => (path.split('/').pop() || path).replace(/\.md$/i, '');

export const dailyNotePath = (config: NotesConfig['dailyNotes'], date = new Date()) => {
  const name = formatDate(date, config.format || DEFAULT_DAILY_FORMAT);
  return withMd([config.folder, name].filter(Boolean).join('/'));
};

// Abre la nota diaria de hoy; si no existe la crea (con la plantilla configurada, si hay)
export async function openDailyNote() {
  const { setTree, openFile, setEditMode } = useStore.getState();
  const config = await settingsApi.getNotes();
  const path = dailyNotePath(config.dailyNotes);
  // El árbol se relee: la nota puede haberse creado en otro dispositivo
  const tree = await filesApi.getTree();
  setTree(tree);
  const existing = (tree as { path: string }[]).find((item) => item.path.toLowerCase() === path.toLowerCase());
  if (existing) {
    openFile(existing.path, existing.path.split('/').pop() || existing.path);
    return;
  }

  let content = '';
  let missingTemplate = '';
  if (config.dailyNotes.template) {
    try {
      const { content: template } = await filesApi.readFile(withMd(config.dailyNotes.template));
      content = applyTemplate(template, noteTitle(path), config.templates);
    } catch {
      missingTemplate = config.dailyNotes.template;
    }
  }
  await filesApi.createNote(path, content);
  setTree(await filesApi.getTree());
  openFile(path, path.split('/').pop() || path);
  // Recién creada: se abre en modo edición
  setEditMode(true);
  if (missingTemplate) notify('daily', t('daily.templateMissing', { template: missingTemplate }), 'error');
}

// Plantillas disponibles: las notas de la carpeta de plantillas (y sus subcarpetas)
export const templateFiles = (tree: { type: string; path: string; name: string }[], folder: string) => {
  const base = folder.replace(/^\/+|\/+$/g, '');
  if (!base) return [];
  const prefix = base.toLowerCase() + '/';
  return tree.filter((item) => item.type === 'file' && /\.md$/i.test(item.path) && item.path.toLowerCase().startsWith(prefix));
};
