// Tablas Markdown editables como tabla dentro de CodeMirror. Cada celda es un <input>.
// El modelo (cabecera, filas y alineaciones) vive en el DOM del widget: cada cambio de
// contenido reserializa la tabla a Markdown (GFM) y lo sustituye en el documento, así que el
// archivo sigue siendo una tabla normal. La vista (ordenaciones, filtros y búsqueda) se guarda
// como un comentario HTML `<!-- table-view: … -->` justo encima de la tabla: no se ve en ningún
// visor de Markdown.
import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, Transaction, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { t, type MessageKey } from './i18n';
import { useStore } from './store';

type Align = 'left' | 'center' | 'right' | null;

interface TableModel {
  head: string[];
  body: string[][];
  aligns: Align[];
}

interface SortRule {
  col: number;
  dir: 'asc' | 'desc';
}

type FilterOp = 'contains' | 'notContains' | 'equals' | 'empty' | 'notEmpty';

interface FilterRule {
  col: number; // -1 = cualquier columna
  op: FilterOp;
  value: string;
}

interface TableView {
  sorts: SortRule[]; // el primer criterio manda; los siguientes desempatan
  filters: FilterRule[]; // todos deben cumplirse
  query: string; // búsqueda global
}

interface TableState {
  source: string; // Markdown del bloque tal como está en el documento (comentario de vista + tabla)
  model: TableModel;
  view: TableView;
  searchFilters: boolean; // la búsqueda oculta filas (ajuste); si no, solo resalta celdas
}

// Estado vivo del widget, guardado en su DOM (CodeMirror reutiliza el DOM entre versiones)
interface TableDom extends HTMLElement {
  cmTable: TableState;
  cmView: EditorView;
  cmTimer?: number;
  cmNames: string[]; // columnas numeradas (ajuste), ver numberNames
}

const VIEW_LINE_RE = /^<!--\s*table-view:(.*)-->\s*$/;
const FILTER_OPS: FilterOp[] = ['contains', 'notContains', 'equals', 'empty', 'notEmpty'];
const OP_KEY: Record<FilterOp, MessageKey> = {
  contains: 'table.op.contains',
  notContains: 'table.op.notContains',
  equals: 'table.op.equals',
  empty: 'table.op.empty',
  notEmpty: 'table.op.notEmpty',
};

// Lo dispara el editor cuando cambia el ajuste de columnas numeradas: repinta las tablas
export const refreshTables = StateEffect.define<null>();

function splitRow(line: string) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

function parseTable(source: string): TableModel {
  const lines = source.split('\n');
  const aligns: Align[] = splitRow(lines[1] ?? '').map((d) =>
    d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : null,
  );
  const rows = [lines[0], ...lines.slice(2)].map(splitRow);
  const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push('');
  while (aligns.length < cols) aligns.push(null);
  const [head, ...body] = rows;
  return { head, body, aligns };
}

function serializeTable({ head, body, aligns }: TableModel) {
  const cells = [head, ...body].map((r) => r.map((c) => c.replace(/\n/g, ' ').replace(/\|/g, '\\|')));
  const widths = aligns.map((_, i) => Math.max(3, ...cells.map((r) => r[i].length)));
  const line = (r: string[]) => '| ' + r.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  const delim = aligns.map((a, i) => {
    const w = widths[i];
    if (a === 'center') return ':' + '-'.repeat(w - 2) + ':';
    if (a === 'left') return ':' + '-'.repeat(w - 1);
    if (a === 'right') return '-'.repeat(w - 1) + ':';
    return '-'.repeat(w);
  });
  return [line(cells[0]), line(delim), ...cells.slice(1).map(line)].join('\n');
}

// Vista guardada en el comentario:
// `{"sorts":[{"col":1,"dir":"desc"}],"filters":[{"col":0,"op":"contains","value":"x"}],"query":"t"}`
function parseSource(source: string): { view: TableView; table: string } {
  const view: TableView = { sorts: [], filters: [], query: '' };
  const nl = source.indexOf('\n');
  const first = nl < 0 ? source : source.slice(0, nl);
  const m = VIEW_LINE_RE.exec(first);
  if (!m) return { view, table: source };
  try {
    const o = JSON.parse(m[1]);
    if (Array.isArray(o.sorts)) {
      for (const s of o.sorts) {
        if (Number.isInteger(s?.col) && s.col >= 0) view.sorts.push({ col: s.col, dir: s.dir === 'desc' ? 'desc' : 'asc' });
      }
    } else if (o.sort && Number.isInteger(o.sort.col) && o.sort.col >= 0) {
      // formato anterior: una sola ordenación
      view.sorts.push({ col: o.sort.col, dir: o.sort.dir === 'desc' ? 'desc' : 'asc' });
    }
    if (Array.isArray(o.filters)) {
      for (const f of o.filters) {
        if (Number.isInteger(f?.col) && f.col >= -1 && FILTER_OPS.includes(f.op) && typeof f.value === 'string') {
          view.filters.push({ col: f.col, op: f.op, value: f.value });
        }
      }
    }
    if (typeof o.query === 'string') view.query = o.query;
  } catch {
    // comentario dañado: se ignora y la tabla se muestra sin orden ni filtros
  }
  return { view, table: nl < 0 ? '' : source.slice(nl + 1) };
}

function formatSource(st: TableState) {
  const table = serializeTable(st.model);
  const { sorts, filters, query } = st.view;
  const saved: { sorts?: SortRule[]; filters?: FilterRule[]; query?: string } = {};
  if (sorts.length) saved.sorts = sorts;
  if (filters.length) saved.filters = filters;
  if (query.trim()) saved.query = query;
  if (!Object.keys(saved).length) return table;
  // `>` escapado para que el JSON nunca cierre el comentario por accidente
  const json = JSON.stringify(saved).replace(/>/g, '\\u003e');
  return `<!-- table-view: ${json} -->\n${table}`;
}

function loadState(source: string, searchFilters: boolean): TableState {
  const { view, table } = parseSource(source);
  const model = parseTable(table);
  const cols = model.head.length;
  // Criterios de columnas que ya no existen (p. ej. tras borrar una columna en otro sitio)
  view.sorts = view.sorts.filter((s) => s.col < cols);
  view.filters = view.filters.filter((f) => f.col < cols);
  return { source, model, view, searchFilters };
}

// Para buscar: sin mayúsculas ni tildes
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toNum(v: string): number | null {
  const s = v.replace(/\s/g, '').replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

// Las celdas vacías van siempre al final; números por valor; resto por texto
function compareCells(a: string, b: string, dir: number) {
  if (a === '' || b === '') return (a === '' ? 1 : 0) - (b === '' ? 1 : 0);
  const na = toNum(a);
  const nb = toNum(b);
  const r = na !== null && nb !== null ? na - nb : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return r * dir;
}

// Varias ordenaciones: cada criterio desempata al anterior
function compareByRules(a: string[], b: string[], sorts: SortRule[]): number {
  for (const s of sorts) {
    const r = compareCells(a[s.col] ?? '', b[s.col] ?? '', s.dir === 'asc' ? 1 : -1);
    if (r) return r;
  }
  return 0;
}

// Un filtro sobre una fila. Con "cualquier columna", las condiciones positivas basta con que
// se cumplan en una celda y las negativas tienen que cumplirse en todas
function matchesFilter(row: string[], f: FilterRule): boolean {
  const v = fold(f.value.trim());
  const test = (cell: string) => {
    const x = fold(cell.trim());
    switch (f.op) {
      case 'contains':
        return x.includes(v);
      case 'notContains':
        return !x.includes(v);
      case 'equals':
        return x === v;
      case 'empty':
        return x === '';
      case 'notEmpty':
        return x !== '';
    }
  };
  const cells = f.col < 0 ? row : [row[f.col] ?? ''];
  const negative = f.op === 'notContains' || f.op === 'notEmpty';
  return negative ? cells.every(test) : cells.some(test);
}

// Columnas numeradas: el ajuste lista sus nombres (sin mayúsculas ni tildes, separados por comas)
function numberNames(setting: string): string[] {
  return setting
    .split(/[,;]/)
    .map((s) => fold(s.trim()))
    .filter(Boolean);
}

function numberedCols(head: string[], names: string[]): boolean[] {
  return head.map((h) => names.includes(fold(h.trim())));
}

// Escribe 1, 2, 3… en las columnas numeradas, según el orden del archivo. Devuelve si cambió algo
function applyNumbering(model: TableModel, names: string[]): boolean {
  if (!names.length) return false;
  let changed = false;
  numberedCols(model.head, names).forEach((on, c) => {
    if (!on) return;
    model.body.forEach((row, r) => {
      const v = String(r + 1);
      if (row[c] !== v) {
        row[c] = v;
        changed = true;
      }
    });
  });
  return changed;
}

// Pasa los números nuevos a las celdas ya pintadas, sin repintar (no se pierde el foco)
function syncNumbers(wrap: TableDom) {
  const m = wrap.cmTable.model;
  const auto = numberedCols(m.head, wrap.cmNames);
  wrap.querySelectorAll<HTMLTableRowElement>('tbody tr[data-idx]').forEach((tr) => {
    const row = m.body[Number(tr.dataset.idx)];
    if (!row) return;
    auto.forEach((on, c) => {
      const input = on ? tr.cells[c]?.querySelector('input') : null;
      if (input && input.value !== row[c]) {
        input.value = row[c];
        (input.parentElement as HTMLElement).dataset.value = row[c];
      }
    });
  });
}

// Si al abrir la tabla cambian los números, se guarda una vez, fuera del ciclo de CodeMirror
function commitLater(wrap: TableDom) {
  window.setTimeout(() => {
    if (wrap.isConnected) commit(wrap, 'table.numbers', false);
  }, 0);
}

// La búsqueda cuenta como vista activa solo si oculta filas (si solo resalta, no mueve nada)
const queryHides = (st: TableState) => st.searchFilters && st.view.query.trim() !== '';
const viewActive = (st: TableState) => st.view.sorts.length > 0 || st.view.filters.length > 0 || queryHides(st);

const tableOf = (wrap: HTMLElement) => wrap.querySelector('table')!;
const searchOf = (wrap: HTMLElement) => wrap.querySelector<HTMLInputElement>('input.cm-lp-table-search')!;
const inputsOf = (wrap: HTMLElement) => [...tableOf(wrap).querySelectorAll<HTMLInputElement>('input.cm-lp-cell-input')];

function makeCell(value: string, header: boolean, align: Align, auto = false) {
  const cell = document.createElement(header ? 'th' : 'td');
  if (align) cell.style.textAlign = align;
  // El <label> crece con el texto gracias al ::after con data-value (ver CSS)
  const sizer = document.createElement('label');
  sizer.className = 'cm-lp-cell';
  sizer.dataset.value = value;
  const input = document.createElement('input');
  input.className = 'cm-lp-cell-input';
  input.value = value;
  input.spellcheck = false;
  if (align) input.style.textAlign = align;
  if (auto) {
    // Columna numerada: la escribe la tabla, no se edita a mano
    input.readOnly = true;
    cell.classList.add('is-auto');
  }
  sizer.appendChild(input);
  cell.appendChild(sizer);
  return cell;
}

function makeBtn(cls: string, text: string, title: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `cm-lp-table-btn ${cls}`;
  b.textContent = text;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

function makeGrip(title: string, draggable: boolean) {
  const g = document.createElement('span');
  g.className = 'cm-lp-table-btn cm-lp-table-grip';
  g.textContent = '⠿';
  g.title = title;
  g.setAttribute('aria-label', title);
  g.draggable = draggable;
  g.classList.toggle('is-disabled', !draggable);
  return g;
}

// Vuelca el modelo (y la vista) al documento. Antes de despachar se actualiza `source`, así el
// updateDOM que dispara CodeMirror ve que el cambio viene de la propia tabla y conserva el DOM.
// `addToHistory` false para los cambios de vista (orden, filtro): no ensucian el deshacer
function commit(wrap: TableDom, userEvent: string, addToHistory = true) {
  const st = wrap.cmTable;
  if (applyNumbering(st.model, wrap.cmNames)) syncNumbers(wrap);
  const text = formatSource(st);
  if (text === st.source) return;
  const view = wrap.cmView;
  const from = view.posAtDOM(wrap);
  const oldLength = st.source.length;
  st.source = text;
  view.dispatch({
    changes: { from, to: from + oldLength, insert: text },
    userEvent,
    annotations: addToHistory ? [] : [Transaction.addToHistory.of(false)],
  });
}

// La vista (búsqueda y filtros) se escribe en el archivo con un pequeño retardo: no en cada tecla
function persistViewLater(wrap: TableDom) {
  window.clearTimeout(wrap.cmTimer);
  wrap.cmTimer = window.setTimeout(() => {
    if (wrap.isConnected) commit(wrap, 'view.table', false);
  }, 400);
}

function visibleRows(st: TableState): number[] {
  const { model, view } = st;
  const q = st.searchFilters ? fold(view.query.trim()) : '';
  const idx = model.body.map((_, i) => i).filter((i) => {
    const row = model.body[i];
    if (q && !row.some((c) => fold(c).includes(q))) return false;
    return view.filters.every((f) => matchesFilter(row, f));
  });
  if (view.sorts.length) idx.sort((a, b) => compareByRules(model.body[a], model.body[b], view.sorts));
  return idx;
}

function updateCount(wrap: TableDom, shown: number, matches: number) {
  const st = wrap.cmTable;
  const total = st.model.body.length;
  let text: string;
  if (st.view.query.trim() && !st.searchFilters) text = t('table.matches', { n: matches });
  else if (viewActive(st)) text = t('table.rowsFiltered', { shown, n: total });
  else text = t('table.rows', { n: total });
  wrap.querySelector('.cm-lp-table-count')!.textContent = text;
}

// Modo «resaltar»: marca las celdas que contienen la búsqueda y devuelve cuántas son
function markMatches(wrap: TableDom): number {
  const st = wrap.cmTable;
  const q = fold(st.view.query.trim());
  const highlight = !!q && !st.searchFilters;
  let n = 0;
  wrap.querySelectorAll<HTMLTableCellElement>('table td, table th').forEach((cell) => {
    const input = cell.querySelector<HTMLInputElement>('input.cm-lp-cell-input');
    const hit = highlight && !!input && fold(input.value).includes(q);
    if (hit) n++;
    cell.classList.toggle('is-match', hit);
  });
  return n;
}

// Contadores de «Ordenar» y «Filtrar» de la barra
function setBadge(wrap: TableDom, selector: string, n: number) {
  const el = wrap.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.textContent = n ? String(n) : '';
  el.classList.toggle('is-on', n > 0);
}

function renderTools(wrap: TableDom) {
  const v = wrap.cmTable.view;
  setBadge(wrap, '.cm-lp-tool-sort-count', v.sorts.length);
  setBadge(wrap, '.cm-lp-tool-filter-count', v.filters.length);
}

function renderHead(wrap: TableDom) {
  const { model, view } = wrap.cmTable;
  const tr = document.createElement('tr');
  tr.dataset.idx = '-1';
  model.head.forEach((value, col) => {
    const th = makeCell(value, true, model.aligns[col]);
    const rule = view.sorts.find((s) => s.col === col);
    const grip = makeGrip(t('table.dragColumn'), true);
    grip.addEventListener('dragstart', (e) => startDrag(wrap, e, 'col', col, th));
    // Menú de la columna (cortar, copiar, pegar, insertar, eliminar)
    grip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openColMenu(wrap, col, grip, e.clientX, e.clientY);
    });
    const sort = makeBtn(
      rule ? 'cm-lp-table-sort is-active' : 'cm-lp-table-sort',
      rule ? (rule.dir === 'asc' ? '↑' : '↓') : '↕',
      t('table.sort'),
      () => quickSort(wrap, col),
    );
    // Clic derecho (o pulsación larga en móvil): más opciones de orden
    sort.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openPanel(wrap, 'sort', sort);
    });
    const del = makeBtn('cm-lp-table-del-col', '×', t('table.deleteColumn'), () => deleteColumn(wrap, col));
    del.disabled = model.head.length <= 1;
    // Los controles van en un bloque que no se parte: así la cabecera no cambia de altura
    const actions = document.createElement('span');
    actions.className = 'cm-lp-th-actions';
    actions.append(grip, sort, del);
    th.append(actions);
    tr.appendChild(th);
  });
  const act = document.createElement('th');
  act.className = 'cm-lp-table-act';
  tr.appendChild(act);
  tableOf(wrap).tHead!.replaceChildren(tr);
}

function makeBodyRow(wrap: TableDom, i: number) {
  const { model } = wrap.cmTable;
  const tr = document.createElement('tr');
  tr.dataset.idx = String(i);
  const auto = numberedCols(model.head, wrap.cmNames);
  model.body[i].forEach((value, col) => tr.appendChild(makeCell(value, false, model.aligns[col], auto[col])));
  const act = document.createElement('td');
  act.className = 'cm-lp-table-act';
  // Mover filas solo sin orden ni filtro: si no, la posición en pantalla no es la del archivo
  const off = viewActive(wrap.cmTable);
  const grip = makeGrip(off ? t('table.dragDisabled') : t('table.dragRow'), !off);
  grip.addEventListener('dragstart', (e) => startDrag(wrap, e, 'row', i, tr));
  // Menú de la fila (cortar, copiar, pegar, insertar, eliminar)
  grip.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openRowMenu(wrap, i, grip, e.clientX, e.clientY);
  });
  tr.appendChild(act);
  // El tirador va a la izquierda de la fila (posicionado en CSS), sin añadir columnas
  tr.cells[0].prepend(grip);
  return tr;
}

function renderBody(wrap: TableDom) {
  const idx = visibleRows(wrap.cmTable);
  tableOf(wrap).tBodies[0].replaceChildren(...idx.map((i) => makeBodyRow(wrap, i)));
  updateCount(wrap, idx.length, markMatches(wrap));
  renderTools(wrap);
}

function render(wrap: TableDom) {
  closePanel?.(); // los paneles se cierran al repintar la cabecera (cambios de columnas)
  renderHead(wrap);
  renderBody(wrap);
}

function focusCell(wrap: TableDom, idx: number, col: number) {
  const table = tableOf(wrap);
  const tr = idx < 0 ? table.tHead?.rows[0] : table.tBodies[0].querySelector<HTMLTableRowElement>(`tr[data-idx="${idx}"]`);
  tr?.cells[col]?.querySelector('input')?.focus();
}

function addRow(wrap: TableDom, focusCol = 0) {
  const st = wrap.cmTable;
  st.model.body.push(st.model.aligns.map(() => ''));
  // Si la fila nueva quedaría oculta por la búsqueda o los filtros, se quitan para verla
  if (!visibleRows(st).includes(st.model.body.length - 1)) clearView(wrap);
  commit(wrap, 'input.table');
  renderBody(wrap);
  focusCell(wrap, st.model.body.length - 1, focusCol);
}

// Quita la búsqueda y los filtros (no las ordenaciones)
function clearView(wrap: TableDom) {
  const v = wrap.cmTable.view;
  v.query = '';
  v.filters = [];
  searchOf(wrap).value = '';
}

function addColumn(wrap: TableDom) {
  const m = wrap.cmTable.model;
  m.head.push('');
  m.body.forEach((r) => r.push(''));
  m.aligns.push(null);
  commit(wrap, 'input.table');
  render(wrap);
  focusCell(wrap, -1, m.head.length - 1);
}

function deleteRow(wrap: TableDom, i: number) {
  wrap.cmTable.model.body.splice(i, 1);
  commit(wrap, 'delete.table');
  renderBody(wrap);
}

// Portapapeles interno de filas (cortar/copiar desde el menú del tirador)
let rowClipboard: string[][] | null = null;

// Ajusta una fila al número de columnas de la tabla
function fitRow(wrap: TableDom, cells: string[]) {
  return wrap.cmTable.model.aligns.map((_, c) => cells[c] ?? '');
}

// Inserta filas en `at`; si quedarían ocultas por búsqueda o filtros, se quitan para verlas
function insertRows(wrap: TableDom, at: number, rows: string[][]) {
  const st = wrap.cmTable;
  st.model.body.splice(at, 0, ...rows.map((r) => fitRow(wrap, r)));
  if (!visibleRows(st).includes(at)) clearView(wrap);
  commit(wrap, 'input.table');
  renderBody(wrap);
  focusCell(wrap, at, 0);
}

function copyRow(wrap: TableDom, i: number) {
  const row = wrap.cmTable.model.body[i].slice();
  rowClipboard = [row];
  // También al portapapeles del sistema (como TSV), para pegarla en otras aplicaciones
  navigator.clipboard?.writeText(row.join('\t')).catch(() => undefined);
}

function cutRow(wrap: TableDom, i: number) {
  copyRow(wrap, i);
  deleteRow(wrap, i);
}

async function pasteRows(wrap: TableDom, i: number) {
  let rows = rowClipboard;
  if (!rows) {
    try {
      rows = parseClipboard(await navigator.clipboard.readText());
    } catch {
      return;
    }
  }
  if (rows.length) insertRows(wrap, i + 1, rows);
}

function clearRow(wrap: TableDom, i: number) {
  wrap.cmTable.model.body[i] = wrap.cmTable.model.aligns.map(() => '');
  commit(wrap, 'delete.table');
  renderBody(wrap);
}

type MenuItem = { label: string; action: () => void } | 'sep';

// Menú contextual genérico (filas y columnas). Se cierra como los paneles: clic fuera, Escape, redimensionar
function openMenu(anchor: HTMLElement, x: number, y: number, items: MenuItem[]) {
  closePanel?.();
  const menu = document.createElement('div');
  menu.className = 'cm-lp-row-menu';
  menu.setAttribute('role', 'menu');
  for (const it of items) {
    if (it === 'sep') {
      const s = document.createElement('div');
      s.className = 'cm-lp-row-menu-sep';
      menu.append(s);
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-lp-row-menu-item';
    b.setAttribute('role', 'menuitem');
    b.textContent = it.label;
    b.addEventListener('click', () => {
      close();
      it.action();
    });
    menu.append(b);
  }
  document.body.appendChild(menu);
  const left = Math.min(x, window.innerWidth - menu.offsetWidth - 8);
  const top = y + menu.offsetHeight + 4 > window.innerHeight ? y - menu.offsetHeight : y + 4;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;

  const onPointer = (e: PointerEvent) => {
    if (!menu.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    close();
    anchor.focus();
  };
  const close = () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    menu.remove();
    closePanel = null;
    panelAnchor = null;
  };
  closePanel = close;
  panelAnchor = anchor;
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
}

function openRowMenu(wrap: TableDom, i: number, anchor: HTMLElement, x: number, y: number) {
  openMenu(anchor, x, y, [
    { label: t('table.menu.cut'), action: () => cutRow(wrap, i) },
    { label: t('table.menu.copy'), action: () => copyRow(wrap, i) },
    { label: t('table.menu.paste'), action: () => void pasteRows(wrap, i) },
    'sep',
    { label: t('table.menu.insertAbove'), action: () => insertRows(wrap, i, [[]]) },
    { label: t('table.menu.insertBelow'), action: () => insertRows(wrap, i + 1, [[]]) },
    'sep',
    { label: t('table.menu.deleteRow'), action: () => deleteRow(wrap, i) },
    { label: t('table.menu.clearRow'), action: () => clearRow(wrap, i) },
  ]);
}

// Portapapeles interno de columnas: cabecera, alineación y celdas
interface ColumnClip {
  head: string;
  align: Align;
  cells: string[];
}
let colClipboard: ColumnClip[] | null = null;

// Inserta columnas en `at`, con sus criterios de orden y filtro desplazados
function insertColumns(wrap: TableDom, at: number, cols: ColumnClip[]) {
  const st = wrap.cmTable;
  const m = st.model;
  const n = cols.length;
  m.head.splice(at, 0, ...cols.map((c) => c.head));
  m.aligns.splice(at, 0, ...cols.map((c) => c.align));
  const rows = Math.max(m.body.length, ...cols.map((c) => c.cells.length));
  while (m.body.length < rows) m.body.push(m.aligns.map(() => ''));
  m.body.forEach((r, ri) => {
    const fill = cols.map((c) => c.cells[ri] ?? '');
    r.splice(at, 0, ...fill);
  });
  const v = st.view;
  const shift = (c: number) => (c >= at ? c + n : c);
  v.sorts = v.sorts.map((s) => ({ ...s, col: shift(s.col) }));
  v.filters = v.filters.map((f) => (f.col < 0 ? f : { ...f, col: shift(f.col) }));
  commit(wrap, 'input.table');
  render(wrap);
  focusCell(wrap, -1, at);
}

function copyColumn(wrap: TableDom, col: number) {
  const m = wrap.cmTable.model;
  const clip: ColumnClip = { head: m.head[col], align: m.aligns[col], cells: m.body.map((r) => r[col]) };
  colClipboard = [clip];
  const text = [clip.head, ...clip.cells].join('\n');
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function cutColumn(wrap: TableDom, col: number) {
  copyColumn(wrap, col);
  deleteColumn(wrap, col);
}

// Pegado desde el portapapeles del sistema: cada columna del texto pasa a una columna nueva sin cabecera
async function pasteColumns(wrap: TableDom, col: number) {
  let cols = colClipboard;
  if (!cols) {
    try {
      const grid = parseClipboard(await navigator.clipboard.readText());
      const width = Math.max(0, ...grid.map((r) => r.length));
      cols = Array.from({ length: width }, (_, c) => ({
        head: '',
        align: null,
        cells: grid.map((r) => r[c] ?? ''),
      }));
    } catch {
      return;
    }
  }
  if (cols.length) insertColumns(wrap, col + 1, cols);
}

function clearColumn(wrap: TableDom, col: number) {
  wrap.cmTable.model.body.forEach((r) => (r[col] = ''));
  commit(wrap, 'delete.table');
  renderBody(wrap);
}

function openColMenu(wrap: TableDom, col: number, anchor: HTMLElement, x: number, y: number) {
  openMenu(anchor, x, y, [
    { label: t('table.menu.cut'), action: () => cutColumn(wrap, col) },
    { label: t('table.menu.copy'), action: () => copyColumn(wrap, col) },
    { label: t('table.menu.paste'), action: () => void pasteColumns(wrap, col) },
    'sep',
    { label: t('table.menu.insertLeft'), action: () => insertColumns(wrap, col, [{ head: '', align: null, cells: [] }]) },
    { label: t('table.menu.insertRight'), action: () => insertColumns(wrap, col + 1, [{ head: '', align: null, cells: [] }]) },
    'sep',
    { label: t('table.deleteColumn'), action: () => deleteColumn(wrap, col) },
    { label: t('table.menu.clearColumn'), action: () => clearColumn(wrap, col) },
  ]);
}

function deleteColumn(wrap: TableDom, col: number) {
  const st = wrap.cmTable;
  const m = st.model;
  if (m.head.length <= 1) return; // una tabla sin columnas no es una tabla
  m.head.splice(col, 1);
  m.body.forEach((r) => r.splice(col, 1));
  m.aligns.splice(col, 1);
  const v = st.view;
  const shift = (c: number) => (c > col ? c - 1 : c);
  v.sorts = v.sorts.filter((s) => s.col !== col).map((s) => ({ ...s, col: shift(s.col) }));
  v.filters = v.filters.filter((f) => f.col !== col).map((f) => ({ ...f, col: f.col < 0 ? f.col : shift(f.col) }));
  commit(wrap, 'delete.table');
  render(wrap);
}

const sortOnFile = () => useStore.getState().tableSortToFile;

// Con el ajuste activo, las filas del archivo siguen los criterios de orden. Devuelve si cambió.
// Las vacías quedan al final (compareCells), así que una fila nueva vacía no se mueve
function sortBodyInFile(wrap: TableDom): boolean {
  const st = wrap.cmTable;
  if (!st.view.sorts.length) return false;
  const sorted = [...st.model.body].sort((a, b) => compareByRules(a, b, st.view.sorts));
  if (sorted.every((row, i) => row === st.model.body[i])) return false;
  st.model.body = sorted;
  return true;
}

// Cambia los criterios de orden. Con el ajuste activo, también reordena el archivo
function setSorts(wrap: TableDom, sorts: SortRule[]) {
  wrap.cmTable.view.sorts = sorts;
  const reordered = sortOnFile() && sortBodyInFile(wrap);
  // Si reordena, entra en el historial: Ctrl+Z deshace también el orden (y la vista guardada)
  commit(wrap, 'view.table', !reordered);
  renderHead(wrap);
  renderBody(wrap);
}

// Guardia: al reescribir la tabla puede dispararse un focusout y reordenar otra vez
let resorting = false;

// Clic en la flecha: si la columna ya es el orden principal, invierte el sentido; si no, ordena
// ascendente por ella (sustituye a los criterios anteriores)
function quickSort(wrap: TableDom, col: number) {
  const sorts = wrap.cmTable.view.sorts;
  if (sorts.length === 1 && sorts[0].col === col) {
    setSorts(wrap, [{ col, dir: sorts[0].dir === 'asc' ? 'desc' : 'asc' }]);
  } else setSorts(wrap, [{ col, dir: 'asc' }]);
}

// Aplica el orden al archivo y limpia los criterios (con el ajuste de orden desactivado)
function applySortToFile(wrap: TableDom) {
  const st = wrap.cmTable;
  if (!st.view.sorts.length) return;
  st.model.body.sort((a, b) => compareByRules(a, b, st.view.sorts));
  st.view.sorts = [];
  commit(wrap, 'input.table');
  render(wrap);
}

// Paneles flotantes de «Ordenar» y «Filtrar». Solo hay uno abierto a la vez
let closePanel: (() => void) | null = null;
let panelAnchor: HTMLElement | null = null;

function headName(st: TableState, c: number) {
  return st.model.head[c]?.trim() || t('table.columnN', { n: c + 1 });
}

function makeSelect(options: [string, string][], value: string, onChange: (value: string) => void) {
  const sel = document.createElement('select');
  sel.className = 'cm-lp-panel-select';
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    sel.appendChild(o);
  }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function panelRow() {
  const row = document.createElement('div');
  row.className = 'cm-lp-panel-row';
  return row;
}

function panelDel(title: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cm-lp-panel-del';
  b.textContent = '×';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}

function panelButton(cls: string, label: string, onClick: () => void, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

function panelHint(text: string) {
  const p = document.createElement('div');
  p.className = 'cm-lp-panel-hint';
  p.textContent = text;
  return p;
}

// Primera columna que aún no es criterio de orden
function firstFreeCol(st: TableState, sorts: SortRule[]) {
  const used = new Set(sorts.map((s) => s.col));
  let c = 0;
  while (used.has(c) && c < st.model.head.length - 1) c++;
  return c;
}

function drawSortPanel(wrap: TableDom, panel: HTMLElement, redraw: () => void) {
  const st = wrap.cmTable;
  const v = st.view;
  const heads: [string, string][] = st.model.head.map((_, c) => [String(c), headName(st, c)]);
  panel.replaceChildren();
  if (!v.sorts.length) panel.appendChild(panelHint(t('table.noSorts')));
  v.sorts.forEach((rule, i) => {
    const row = panelRow();
    row.append(
      makeSelect(heads, String(rule.col), (val) => {
        rule.col = Number(val);
        setSorts(wrap, v.sorts);
        redraw();
      }),
      makeSelect(
        [
          ['asc', t('table.sortAsc')],
          ['desc', t('table.sortDesc')],
        ],
        rule.dir,
        (val) => {
          rule.dir = val === 'desc' ? 'desc' : 'asc';
          setSorts(wrap, v.sorts);
          redraw();
        },
      ),
      panelDel(t('table.removeRule'), () => {
        v.sorts.splice(i, 1);
        setSorts(wrap, v.sorts);
        redraw();
      }),
    );
    panel.appendChild(row);
  });
  panel.appendChild(
    panelButton('cm-lp-panel-add', t('table.addSort'), () => {
      v.sorts.push({ col: firstFreeCol(st, v.sorts), dir: 'asc' });
      setSorts(wrap, v.sorts);
      redraw();
    }),
  );
  // Con el ajuste activo el orden ya se escribe en el archivo: no hace falta aplicarlo a mano
  if (!sortOnFile()) {
    const sep = document.createElement('div');
    sep.className = 'cm-lp-panel-sep';
    panel.appendChild(sep);
    panel.appendChild(panelHint(t('table.sortApplyHint')));
    panel.appendChild(
      panelButton('cm-lp-panel-add', t('table.sortApply'), () => applySortToFile(wrap), !v.sorts.length),
    );
  }
}

function drawFilterPanel(wrap: TableDom, panel: HTMLElement, redraw: () => void) {
  const st = wrap.cmTable;
  const v = st.view;
  const heads: [string, string][] = [
    ['-1', t('table.anyColumn')],
    ...st.model.head.map((_, c): [string, string] => [String(c), headName(st, c)]),
  ];
  panel.replaceChildren();
  if (!v.filters.length) panel.appendChild(panelHint(t('table.noFilters')));
  v.filters.forEach((rule, i) => {
    const row = panelRow();
    row.append(
      makeSelect(heads, String(rule.col), (val) => {
        rule.col = Number(val);
        renderBody(wrap);
        persistViewLater(wrap);
        redraw();
      }),
      makeSelect(
        FILTER_OPS.map((op): [string, string] => [op, t(OP_KEY[op])]),
        rule.op,
        (val) => {
          rule.op = val as FilterOp;
          renderBody(wrap);
          persistViewLater(wrap);
          redraw();
        },
      ),
    );
    // Las condiciones «está vacía» / «no está vacía» no necesitan valor
    if (rule.op !== 'empty' && rule.op !== 'notEmpty') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cm-lp-panel-input';
      input.value = rule.value;
      input.placeholder = t('table.filterValue');
      input.spellcheck = false;
      // Sin volver a pintar el panel: así no se pierde el foco al escribir
      input.addEventListener('input', () => {
        rule.value = input.value;
        renderBody(wrap);
        persistViewLater(wrap);
      });
      row.appendChild(input);
    }
    row.appendChild(
      panelDel(t('table.removeRule'), () => {
        v.filters.splice(i, 1);
        renderBody(wrap);
        persistViewLater(wrap);
        redraw();
      }),
    );
    panel.appendChild(row);
  });
  panel.appendChild(
    panelButton('cm-lp-panel-add', t('table.addFilter'), () => {
      v.filters.push({ col: -1, op: 'contains', value: '' });
      renderBody(wrap);
      persistViewLater(wrap);
      redraw();
    }),
  );
}

// Abre el panel junto a `anchor`. Pulsar el mismo botón otra vez lo cierra
function openPanel(wrap: TableDom, kind: 'sort' | 'filter', anchor: HTMLElement) {
  const wasOpenHere = panelAnchor === anchor;
  closePanel?.();
  if (wasOpenHere) return;

  const panel = document.createElement('div');
  panel.className = 'cm-lp-table-panel';
  panel.setAttribute('role', 'dialog');
  const redraw = () => (kind === 'sort' ? drawSortPanel(wrap, panel, redraw) : drawFilterPanel(wrap, panel, redraw));
  redraw();
  document.body.appendChild(panel);
  // Debajo del botón, sin salirse de la ventana
  const r = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8));
  const top = r.bottom + 4 + panel.offsetHeight > window.innerHeight ? r.top - panel.offsetHeight - 4 : r.bottom + 4;
  panel.style.left = `${left}px`;
  panel.style.top = `${Math.max(8, top)}px`;

  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node;
    if (!panel.contains(target) && !anchor.contains(target)) closePanel?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closePanel?.();
    anchor.focus();
  };
  const close = () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    panel.remove();
    closePanel = null;
    panelAnchor = null;
  };
  closePanel = close;
  panelAnchor = anchor;
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', close);
}

// Pegado desde hojas de cálculo: TSV (tabuladores y saltos de línea) con comillas al estilo CSV
function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.replace(/\r?\n/g, ' ')));
}

// Rellena desde la celda activa; crea filas y columnas si hacen falta
function pasteGrid(wrap: TableDom, input: HTMLInputElement, grid: string[][]) {
  const td = input.closest('td, th') as HTMLTableCellElement;
  const start = Number((td.parentElement as HTMLElement).dataset.idx); // -1 = cabecera
  const startCol = td.cellIndex;
  const m = wrap.cmTable.model;
  const width = Math.max(...grid.map((r) => r.length));
  while (m.head.length < startCol + width) {
    m.head.push('');
    m.body.forEach((r) => r.push(''));
    m.aligns.push(null);
  }
  let appended = false;
  grid.forEach((cells, dr) => {
    const p = start + dr;
    let row: string[];
    if (p < 0) row = m.head;
    else {
      while (m.body.length <= p) {
        m.body.push(m.aligns.map(() => ''));
        appended = true;
      }
      row = m.body[p];
    }
    cells.forEach((v, c) => {
      row[startCol + c] = v;
    });
  });
  // Las filas nuevas podrían quedar ocultas por la búsqueda o los filtros: se quitan
  if (appended) clearView(wrap);
  commit(wrap, 'input.table');
  render(wrap);
  focusCell(wrap, start, startCol);
}

// Arrastrar filas y columnas. Los dos usan `moveOrder` para calcular el nuevo orden
interface DragState {
  kind: 'row' | 'col';
  wrap: TableDom;
  from: number;
  to?: number;
  after?: boolean;
}
let drag: DragState | null = null;

function startDrag(wrap: TableDom, e: DragEvent, kind: 'row' | 'col', from: number, el: HTMLElement) {
  drag = { kind, wrap, from };
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Firefox no arranca el arrastre sin datos
    e.dataTransfer.setDragImage(el, 0, 0);
  }
  el.classList.add('is-dragging');
}

function clearDrag(wrap: TableDom) {
  drag = null;
  wrap
    .querySelectorAll('.is-dragging, .is-drop-before, .is-drop-after')
    .forEach((el) => el.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
}

function dropSpot(wrap: TableDom, e: DragEvent) {
  if (!drag || drag.wrap !== wrap || !(e.target instanceof Element)) return null;
  const el = e.target.closest<HTMLElement>(drag.kind === 'row' ? 'tbody tr[data-idx]' : 'thead th:not(.cm-lp-table-act)');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const after = drag.kind === 'row' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
  const to = drag.kind === 'row' ? Number(el.dataset.idx) : (el as HTMLTableCellElement).cellIndex;
  return { el, to, after };
}

function onDragOver(wrap: TableDom, e: DragEvent) {
  if (!drag || drag.wrap !== wrap) return;
  const blocked = drag.kind === 'row' && viewActive(wrap.cmTable);
  const spot = blocked ? null : dropSpot(wrap, e);
  wrap.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
  if (!spot) {
    drag.to = undefined;
    return;
  }
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  spot.el.classList.add(spot.after ? 'is-drop-after' : 'is-drop-before');
  drag.to = spot.to;
  drag.after = spot.after;
}

function onDrop(wrap: TableDom, e: DragEvent) {
  if (!drag || drag.wrap !== wrap || drag.to === undefined) return;
  e.preventDefault();
  const { kind, from } = drag;
  const to = drag.to;
  const after = !!drag.after;
  clearDrag(wrap);
  if (kind === 'row') moveRow(wrap, from, to, after);
  else moveCol(wrap, from, to, after);
}

// Nuevo orden de `n` elementos al mover `from` antes o después de `to`
function moveOrder(n: number, from: number, to: number, after: boolean): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let ins = after ? to + 1 : to;
  if (from < ins) ins--;
  const [moved] = order.splice(from, 1);
  order.splice(ins, 0, moved);
  return order;
}

const isIdentity = (order: number[]) => order.every((v, i) => v === i);

function moveRow(wrap: TableDom, from: number, to: number, after: boolean) {
  const st = wrap.cmTable;
  const body = st.model.body;
  const order = moveOrder(body.length, from, to, after);
  if (isIdentity(order)) return;
  st.model.body = order.map((i) => body[i]);
  commit(wrap, 'input.table');
  renderBody(wrap);
}

function moveCol(wrap: TableDom, from: number, to: number, after: boolean) {
  const st = wrap.cmTable;
  const m = st.model;
  const order = moveOrder(m.head.length, from, to, after);
  if (isIdentity(order)) return;
  m.head = order.map((i) => m.head[i]);
  m.aligns = order.map((i) => m.aligns[i]);
  m.body = m.body.map((r) => order.map((i) => r[i]));
  const v = st.view;
  v.sorts = v.sorts.map((s) => ({ ...s, col: order.indexOf(s.col) }));
  v.filters = v.filters.map((f) => (f.col < 0 ? f : { ...f, col: order.indexOf(f.col) }));
  commit(wrap, 'input.table');
  render(wrap);
}

// El cursor de CodeMirror no entra en las celdas: se lleva justo después de la tabla
function exitToText(wrap: TableDom) {
  const view = wrap.cmView;
  const end = view.posAtDOM(wrap) + wrap.cmTable.source.length;
  view.focus();
  view.dispatch({ selection: { anchor: Math.min(end + 1, view.state.doc.length) } });
}

function onKeyDown(wrap: TableDom, e: KeyboardEvent) {
  const target = e.target as HTMLInputElement;
  if (target.classList.contains('cm-lp-table-search')) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (target.value) {
      // Primer Escape: limpia el buscador. Con el buscador vacío, vuelve al texto
      target.value = '';
      wrap.cmTable.view.query = '';
      renderBody(wrap);
      persistViewLater(wrap);
    } else exitToText(wrap);
    return;
  }
  if (!target.classList.contains('cm-lp-cell-input')) return;

  const td = target.closest('td, th') as HTMLTableCellElement;
  const tr = td.parentElement as HTMLTableRowElement;
  const rows = tableOf(wrap).rows;
  const col = td.cellIndex;
  const row = tr.rowIndex;
  const focusAt = (r: number, c: number) => tableOf(wrap).rows[r]?.cells[c]?.querySelector('input')?.focus();

  switch (e.key) {
    case 'Tab': {
      e.preventDefault();
      const inputs = inputsOf(wrap);
      const next = inputs[inputs.indexOf(target) + (e.shiftKey ? -1 : 1)];
      if (next) next.focus();
      else if (!e.shiftKey) addRow(wrap);
      break;
    }
    case 'Enter':
      e.preventDefault();
      if (row + 1 < rows.length) focusAt(row + 1, col);
      else addRow(wrap, col);
      break;
    case 'ArrowUp':
      e.preventDefault();
      focusAt(row - 1, col);
      break;
    case 'ArrowDown':
      e.preventDefault();
      focusAt(row + 1, col);
      break;
    case 'Backspace': {
      // Borrar una fila vacía (no la cabecera) con Retroceso en su primera celda
      const idx = Number(tr.dataset.idx);
      const empty = wrap.cmTable.model.body[idx]?.every((c) => c === '');
      if (idx < 0 || col !== 0 || !empty) return;
      e.preventDefault();
      deleteRow(wrap, idx);
      focusAt(row - 1, 0);
      break;
    }
    case 'Escape':
      e.preventDefault();
      exitToText(wrap);
      break;
  }
}

// Iconos de la barra (SVG en trazo, como en Notion)
const ICON = {
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  sort: ['M7 4v16', 'M3.5 8 7 4.5 10.5 8', 'M17 20V4', 'M13.5 16 17 19.5 20.5 16'],
  search: ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13z', 'M20 20l-4.2-4.2'],
};

function svgIcon(paths: string[]) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// Botón solo con icono; `badgeCls` añade el contador de criterios activos
function iconBtn(cls: string, paths: string[], title: string, badgeCls: string, onClick: (b: HTMLButtonElement) => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `cm-lp-table-tool-btn ${cls}`;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.append(svgIcon(paths));
  if (badgeCls) {
    const badge = document.createElement('span');
    badge.className = `cm-lp-table-badge ${badgeCls}`;
    b.append(badge);
  }
  b.addEventListener('click', () => onClick(b));
  return b;
}

class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly names: string[],
    readonly searchFilters: boolean,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      other.source === this.source &&
      other.names.join('|') === this.names.join('|') &&
      other.searchFilters === this.searchFilters
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('div') as unknown as TableDom;
    wrap.className = 'cm-lp-table-wrap';
    wrap.cmView = view;
    wrap.cmNames = this.names;
    wrap.cmTable = loadState(this.source, this.searchFilters);
    if (applyNumbering(wrap.cmTable.model, this.names)) commitLater(wrap);

    const tools = document.createElement('div');
    tools.className = 'cm-lp-table-tools';
    const count = document.createElement('span');
    count.className = 'cm-lp-table-count';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'cm-lp-table-search';
    search.placeholder = t('table.search');
    search.setAttribute('aria-label', t('table.search'));
    search.spellcheck = false;
    search.value = wrap.cmTable.view.query;
    // La búsqueda se ve si hay texto o si se abre con su icono
    search.hidden = !search.value;
    const searchBtn = iconBtn('cm-lp-tool-search', ICON.search, t('table.search'), '', () => {
      search.hidden = !search.hidden;
      if (!search.hidden) search.focus();
    });
    const filterBtn = iconBtn('cm-lp-tool-filter', ICON.filter, t('table.filterBtn'), 'cm-lp-tool-filter-count', (b) =>
      openPanel(wrap, 'filter', b),
    );
    const sortBtn = iconBtn('cm-lp-tool-sort', ICON.sort, t('table.sortBtn'), 'cm-lp-tool-sort-count', (b) =>
      openPanel(wrap, 'sort', b),
    );
    const iconGroup = document.createElement('div');
    iconGroup.className = 'cm-lp-table-icons';
    iconGroup.append(filterBtn, sortBtn, searchBtn);
    tools.append(search, iconGroup);

    const table = document.createElement('table');
    table.className = 'cm-lp-table';
    table.append(document.createElement('thead'), document.createElement('tbody'));

    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'cm-lp-table-add cm-lp-table-add-row';
    addRowBtn.title = t('table.addRow');
    addRowBtn.textContent = '+';
    addRowBtn.addEventListener('click', () => addRow(wrap));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'cm-lp-table-add cm-lp-table-add-col';
    addColBtn.title = t('table.addColumn');
    addColBtn.textContent = '+';
    addColBtn.addEventListener('click', () => addColumn(wrap));

    const grid = document.createElement('div');
    grid.className = 'cm-lp-table-grid';
    grid.append(table, addColBtn, addRowBtn);
    // El contador va debajo de la tabla; su visibilidad la controla un ajuste (ver CSS)
    wrap.append(tools, grid, count);
    render(wrap);

    wrap.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.classList.contains('cm-lp-table-search')) {
        wrap.cmTable.view.query = target.value;
        renderBody(wrap);
        persistViewLater(wrap);
        return;
      }
      if (!target.classList.contains('cm-lp-cell-input')) return;
      const td = target.closest('td, th') as HTMLTableCellElement;
      const idx = Number((td.parentElement as HTMLElement).dataset.idx);
      const m = wrap.cmTable.model;
      (idx < 0 ? m.head : m.body[idx])[td.cellIndex] = target.value;
      (target.parentElement as HTMLElement).dataset.value = target.value;
      commit(wrap, 'input.table');
      markMatches(wrap);
    });
    // Al editar una celda, el buscador desaparece (la búsqueda sigue activa; la lupa lo muestra)
    wrap.addEventListener('focusin', (e) => {
      if ((e.target as HTMLElement).classList.contains('cm-lp-cell-input')) search.hidden = true;
    });
    wrap.addEventListener('keydown', (e) => onKeyDown(wrap, e));
    wrap.addEventListener('paste', (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('cm-lp-cell-input')) return;
      // Un texto sin tabuladores ni saltos de línea se pega normal, dentro de la celda
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r?\n$/, '');
      if (!/[\t\n]/.test(text)) return;
      e.preventDefault();
      pasteGrid(wrap, target as HTMLInputElement, parseClipboard(text));
    });
    wrap.addEventListener('dragover', (e) => onDragOver(wrap, e));
    wrap.addEventListener('drop', (e) => onDrop(wrap, e));
    wrap.addEventListener('dragend', () => clearDrag(wrap));
    // Al salir de la tabla tras editar una celda, las filas se colocan según el orden activo.
    // Mientras se navega entre celdas no se mueven (no cambiaría la fila bajo el cursor)
    wrap.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && wrap.contains(to)) return;
      if (!(e.target instanceof HTMLElement) || !e.target.classList.contains('cm-lp-cell-input')) return;
      if (!sortOnFile() || !wrap.isConnected || resorting) return;
      resorting = true;
      try {
        if (sortBodyInFile(wrap)) {
          commit(wrap, 'input.table');
          renderBody(wrap);
        }
      } finally {
        resorting = false;
      }
    });
    // El cursor de CodeMirror no entra en las celdas: se lleva al inicio de la tabla para que
    // lo que muestre el cursor (p. ej. al abrirse el teclado del móvil) no salte a otra parte
    wrap.addEventListener('focusin', () => {
      const pos = view.posAtDOM(wrap);
      if (view.state.selection.main.head !== pos) view.dispatch({ selection: { anchor: pos } });
    });
    return wrap;
  }

  // Tras un cambio hecho desde la propia tabla `source` ya coincide y no se toca nada (así se
  // conservan el DOM, el foco y la vista). Si el cambio viene de fuera (deshacer, etc.), se
  // recarga el modelo y la vista que trae el archivo
  updateDOM(dom: HTMLElement) {
    const wrap = dom as TableDom;
    if (
      this.source === wrap.cmTable.source &&
      this.names.join('|') === wrap.cmNames.join('|') &&
      this.searchFilters === wrap.cmTable.searchFilters
    )
      return true;
    wrap.cmNames = this.names;
    wrap.cmTable = loadState(this.source, this.searchFilters);
    searchOf(wrap).value = wrap.cmTable.view.query;
    if (applyNumbering(wrap.cmTable.model, this.names)) commitLater(wrap);
    render(wrap);
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

function buildTables(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  const names = numberNames(useStore.getState().tableNumberColumns);
  const searchFilters = useStore.getState().tableSearchFilters;
  // Solo tablas de primer nivel (no dentro de listas o citas)
  const cursor = syntaxTree(state).topNode.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name !== 'Table') continue;
      const tableFrom = state.doc.lineAt(cursor.from).from;
      // La línea `<!-- table-view: … -->` justo encima guarda la vista: va dentro del widget
      const prev = tableFrom > 0 ? state.doc.lineAt(tableFrom - 1) : null;
      const from = prev && VIEW_LINE_RE.test(prev.text) ? prev.from : tableFrom;
      const to = state.doc.lineAt(Math.max(cursor.from, cursor.to - 1)).to;
      // Con la selección dentro de la tabla (p. ej. al buscar) se muestra el Markdown. Límites
      // estrictos a propósito: al editar una celda el widget deja el cursor justo en `from`, y
      // con el cursor en un borde la tabla tiene que seguir siendo visual
      const inside = sel.some((r) => r.from < to && r.to > from);
      if (inside) continue;
      const widget = new TableWidget(state.doc.sliceString(from, to), names, searchFilters);
      decos.push(Decoration.replace({ widget, block: true }).range(from, to));
    } while (cursor.nextSibling());
  }
  return Decoration.set(decos);
}

export const liveTables = StateField.define<DecorationSet>({
  create: buildTables,
  update(decos, tr) {
    if (
      tr.docChanged ||
      tr.selection ||
      tr.effects.some((e) => e.is(refreshTables)) ||
      syntaxTree(tr.startState) !== syntaxTree(tr.state)
    )
      return buildTables(tr.state);
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});
