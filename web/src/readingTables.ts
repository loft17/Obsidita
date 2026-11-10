// Búsqueda, filtros y orden de las tablas en el visor (modo lectura). Solo cambian lo que se ve:
// nunca se escribe el archivo. La vista inicial es la guardada por el editor en el comentario
// `<!-- table-view: … -->` (ReadingView la pasa a la tabla como `data-table-view`).
import { t } from './i18n';
import { useStore } from './store';
import {
  ICON,
  compareByRules,
  drawFilterRules,
  drawSortRules,
  fold,
  iconBtn,
  makeBtn,
  matchesFilter,
  openFloatingPanel,
  parseViewJson,
  type TableView,
} from './liveTables';

interface ReadingTable {
  wrap: HTMLElement;
  table: HTMLTableElement;
  head: string[];
  rows: HTMLTableRowElement[]; // en el orden del archivo
  cells: string[][]; // texto de cada celda, para buscar, filtrar y ordenar
  view: TableView;
}

// Vista de cada tabla mientras dura la sesión, para no perderla al repintar la nota (p. ej. al
// cambiar el árbol o el tema). Si el comentario guardado cambia, manda el del archivo
// La tabla de cada barra, para volver a aplicar la vista si cambian los ajustes
const tables = new WeakMap<HTMLElement, ReadingTable>();

const sessionViews = new Map<string, { saved: string; view: TableView }>();

const emptyView = (): TableView => ({ sorts: [], filters: [], query: '' });

function setBadge(wrap: HTMLElement, selector: string, n: number) {
  const el = wrap.querySelector<HTMLElement>(selector);
  if (!el) return;
  el.textContent = n ? String(n) : '';
  el.classList.toggle('is-on', n > 0);
}

function apply(rt: ReadingTable) {
  const { view, cells, rows } = rt;
  const searchFilters = useStore.getState().tableSearchFilters;
  const q = fold(view.query.trim());
  const hideBySearch = searchFilters && !!q;
  const visible = cells
    .map((_, i) => i)
    .filter((i) => {
      if (hideBySearch && !cells[i].some((c) => fold(c).includes(q))) return false;
      return view.filters.every((f) => matchesFilter(cells[i], f));
    });
  if (view.sorts.length) visible.sort((a, b) => compareByRules(cells[a], cells[b], view.sorts));

  // Filas visibles en su orden; las ocultas detrás. Solo se mueve el DOM si cambia el orden
  const shown = new Set(visible);
  const order = [...visible, ...rows.map((_, i) => i).filter((i) => !shown.has(i))];
  const tbody = rt.table.tBodies[0];
  if (order.some((i, pos) => tbody.rows[pos] !== rows[i])) tbody.append(...order.map((i) => rows[i]));
  rows.forEach((tr, i) => (tr.hidden = !shown.has(i)));

  // Modo «resaltar»: se marcan las celdas que contienen la búsqueda
  const highlight = !!q && !searchFilters;
  let matches = 0;
  rt.table.querySelectorAll<HTMLTableCellElement>('thead th').forEach((th, c) => {
    const hit = highlight && fold(rt.head[c] ?? '').includes(q);
    if (hit) matches++;
    th.classList.toggle('is-match', hit);
  });
  rows.forEach((tr, r) =>
    [...tr.cells].forEach((td, c) => {
      const hit = highlight && fold(cells[r][c] ?? '').includes(q);
      if (hit) matches++;
      td.classList.toggle('is-match', hit);
    }),
  );

  // Flechas de orden de la cabecera
  rt.table.querySelectorAll<HTMLButtonElement>('thead .reading-table-sort').forEach((btn, col) => {
    const rule = view.sorts.find((s) => s.col === col);
    btn.textContent = rule ? (rule.dir === 'asc' ? '↑' : '↓') : '↕';
    btn.classList.toggle('is-active', !!rule);
  });

  const total = rows.length;
  const active = view.sorts.length > 0 || view.filters.length > 0 || hideBySearch;
  const count = rt.wrap.querySelector('.cm-lp-table-count')!;
  if (q && !searchFilters) count.textContent = t('table.matches', { n: matches });
  else if (active) count.textContent = t('table.rowsFiltered', { shown: visible.length, n: total });
  else count.textContent = t('table.rows', { n: total });

  setBadge(rt.wrap, '.cm-lp-tool-sort-count', view.sorts.length);
  setBadge(rt.wrap, '.cm-lp-tool-filter-count', view.filters.length);
}

// Clic en la flecha: invierte el sentido si la columna ya manda; si no, ordena ascendente por ella
function quickSort(rt: ReadingTable, col: number) {
  const sorts = rt.view.sorts;
  rt.view.sorts =
    sorts.length === 1 && sorts[0].col === col
      ? [{ col, dir: sorts[0].dir === 'asc' ? 'desc' : 'asc' }]
      : [{ col, dir: 'asc' }];
  apply(rt);
}

const openSortPanel = (rt: ReadingTable, anchor: HTMLElement) =>
  openFloatingPanel(anchor, (panel, redraw) => drawSortRules(panel, rt.head, rt.view, () => apply(rt), redraw));

const openFilterPanel = (rt: ReadingTable, anchor: HTMLElement) =>
  openFloatingPanel(anchor, (panel, redraw) => drawFilterRules(panel, rt.head, rt.view, () => apply(rt), redraw));

function enhance(table: HTMLTableElement, key: string) {
  const headRow = table.tHead?.rows[0];
  const tbody = table.tBodies[0];
  if (!headRow || !tbody) return; // tabla sin filas: no hay nada que buscar ni ordenar

  const head = [...headRow.cells].map((th) => (th.textContent ?? '').trim());
  const rows = [...tbody.rows];
  const cells = rows.map((tr) => head.map((_, c) => (tr.cells[c]?.textContent ?? '').trim()));

  const saved = table.dataset.tableView ?? '';
  let entry = sessionViews.get(key);
  if (!entry || entry.saved !== saved) {
    const view = saved ? parseViewJson(saved) : emptyView();
    // Criterios de columnas que ya no existen
    view.sorts = view.sorts.filter((s) => s.col < head.length);
    view.filters = view.filters.filter((f) => f.col < head.length);
    entry = { saved, view };
    sessionViews.set(key, entry);
  }

  const wrap = document.createElement('div');
  wrap.className = 'reading-table-wrap';
  const rt: ReadingTable = { wrap, table, head, rows, cells, view: entry.view };

  const tools = document.createElement('div');
  tools.className = 'cm-lp-table-tools';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'cm-lp-table-search';
  search.placeholder = t('table.search');
  search.setAttribute('aria-label', t('table.search'));
  search.spellcheck = false;
  search.value = rt.view.query;
  search.hidden = !search.value;
  search.addEventListener('input', () => {
    rt.view.query = search.value;
    apply(rt);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (search.value) {
      search.value = '';
      rt.view.query = '';
      apply(rt);
    } else search.hidden = true;
  });
  const searchBtn = iconBtn('cm-lp-tool-search', ICON.search, t('table.search'), '', () => {
    search.hidden = !search.hidden;
    if (!search.hidden) search.focus();
  });
  const filterBtn = iconBtn('cm-lp-tool-filter', ICON.filter, t('table.filterBtn'), 'cm-lp-tool-filter-count', (b) =>
    openFilterPanel(rt, b),
  );
  const sortBtn = iconBtn('cm-lp-tool-sort', ICON.sort, t('table.sortBtn'), 'cm-lp-tool-sort-count', (b) =>
    openSortPanel(rt, b),
  );
  const icons = document.createElement('div');
  icons.className = 'cm-lp-table-icons';
  icons.append(filterBtn, sortBtn, searchBtn);
  tools.append(search, icons);

  // Flecha de orden en cada cabecera (clic derecho: panel de orden)
  [...headRow.cells].forEach((th, col) => {
    const btn = makeBtn('cm-lp-table-sort reading-table-sort', '↕', t('table.sort'), () => quickSort(rt, col));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSortPanel(rt, btn);
    });
    th.append(btn);
  });

  const count = document.createElement('span');
  count.className = 'cm-lp-table-count';

  table.replaceWith(wrap);
  wrap.append(tools, table, count);
  tables.set(wrap, rt);
  apply(rt);
}

// Añade la barra a las tablas del HTML recién pintado. `notePath` distingue las vistas de cada nota
export function enhanceReadingTables(root: HTMLElement, notePath: string) {
  root.querySelectorAll<HTMLTableElement>('table').forEach((table, i) => {
    if (table.parentElement?.classList.contains('reading-table-wrap')) return;
    enhance(table, `${notePath}\u0000${i}`);
  });
}

// Vuelve a aplicar la vista (p. ej. al cambiar el ajuste «buscar ocultando filas»)
export function refreshReadingTables(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.reading-table-wrap').forEach((wrap) => {
    const rt = tables.get(wrap);
    if (rt) apply(rt);
  });
}
