// Tablas Markdown editables como tabla dentro de CodeMirror. Cada celda es un
// <input>; al escribir se reconstruye el Markdown de la tabla (alineado) y se
// sustituye en el documento.
import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { t } from './i18n';

type Align = 'left' | 'center' | 'right' | null;

interface TableData {
  rows: string[][]; // la primera fila es la cabecera
  aligns: Align[];
}

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

function parseTable(source: string): TableData {
  const lines = source.split('\n');
  const aligns: Align[] = splitRow(lines[1] ?? '').map((d) =>
    d.startsWith(':') && d.endsWith(':') ? 'center' : d.endsWith(':') ? 'right' : d.startsWith(':') ? 'left' : null
  );
  const rows = [lines[0], ...lines.slice(2)].map(splitRow);
  const cols = Math.max(aligns.length, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < cols) r.push('');
  while (aligns.length < cols) aligns.push(null);
  return { rows, aligns };
}

function serializeTable({ rows, aligns }: TableData) {
  const cells = rows.map((r) => r.map((c) => c.replace(/\n/g, ' ').replace(/\|/g, '\\|')));
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

// Estado vivo del widget, guardado en su DOM (CodeMirror reutiliza el DOM entre versiones)
interface TableDom extends HTMLElement {
  cmTable: { source: string; aligns: Align[] };
}

const inputsOf = (wrap: HTMLElement) => [...wrap.querySelectorAll<HTMLInputElement>('input.cm-lp-cell-input')];
const tableOf = (wrap: HTMLElement) => wrap.querySelector('table')!;

function makeCell(value: string, header: boolean, align: Align) {
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
  sizer.appendChild(input);
  cell.appendChild(sizer);
  return cell;
}

function makeRow(values: string[], header: boolean, aligns: Align[]) {
  const tr = document.createElement('tr');
  values.forEach((v, i) => tr.appendChild(makeCell(v, header, aligns[i])));
  return tr;
}

function commit(view: EditorView, wrap: TableDom) {
  const state = wrap.cmTable;
  const rows = [...tableOf(wrap).rows].map((tr) => [...tr.cells].map((td) => td.querySelector('input')!.value));
  const text = serializeTable({ rows, aligns: state.aligns });
  if (text === state.source) return;
  const from = view.posAtDOM(wrap);
  view.dispatch({ changes: { from, to: from + state.source.length, insert: text }, userEvent: 'input.table' });
  state.source = text;
}

function addRow(view: EditorView, wrap: TableDom, focusCol = 0) {
  const tbody = tableOf(wrap).tBodies[0];
  const tr = makeRow(wrap.cmTable.aligns.map(() => ''), false, wrap.cmTable.aligns);
  tbody.appendChild(tr);
  commit(view, wrap);
  tr.querySelectorAll('input')[focusCol]?.focus();
}

function addColumn(view: EditorView, wrap: TableDom) {
  wrap.cmTable.aligns.push(null);
  for (const tr of tableOf(wrap).rows) tr.appendChild(makeCell('', tr.parentElement!.tagName === 'THEAD', null));
  commit(view, wrap);
  tableOf(wrap).rows[0].lastElementChild!.querySelector('input')!.focus();
}

function onKeyDown(view: EditorView, wrap: TableDom, e: KeyboardEvent) {
  const input = e.target as HTMLInputElement;
  if (!input.classList.contains('cm-lp-cell-input')) return;
  const td = input.closest('td, th') as HTMLTableCellElement;
  const tr = td.parentElement as HTMLTableRowElement;
  const rows = tableOf(wrap).rows;
  const col = td.cellIndex;
  const row = tr.rowIndex;
  const focusAt = (r: number, c: number) => rows[r]?.cells[c]?.querySelector('input')?.focus();

  switch (e.key) {
    case 'Tab': {
      e.preventDefault();
      const inputs = inputsOf(wrap);
      const next = inputs[inputs.indexOf(input) + (e.shiftKey ? -1 : 1)];
      if (next) next.focus();
      else if (!e.shiftKey) addRow(view, wrap);
      break;
    }
    case 'Enter':
      e.preventDefault();
      if (row + 1 < rows.length) focusAt(row + 1, col);
      else addRow(view, wrap, col);
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
      const empty = [...tr.cells].every((c) => !c.querySelector('input')!.value);
      if (row === 0 || col !== 0 || !empty) return;
      e.preventDefault();
      tr.remove();
      commit(view, wrap);
      focusAt(row - 1, 0);
      break;
    }
    case 'Escape': {
      // Volver al texto, justo después de la tabla
      e.preventDefault();
      const end = view.posAtDOM(wrap) + wrap.cmTable.source.length;
      view.focus();
      view.dispatch({ selection: { anchor: Math.min(end + 1, view.state.doc.length) } });
      break;
    }
  }
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: TableWidget) {
    return other.source === this.source;
  }

  toDOM(view: EditorView) {
    const { rows, aligns } = parseTable(this.source);
    const wrap = document.createElement('div') as unknown as TableDom;
    wrap.className = 'cm-lp-table-wrap';
    wrap.cmTable = { source: this.source, aligns };

    const table = document.createElement('table');
    table.className = 'cm-lp-table';
    const thead = document.createElement('thead');
    thead.appendChild(makeRow(rows[0], true, aligns));
    const tbody = document.createElement('tbody');
    rows.slice(1).forEach((r) => tbody.appendChild(makeRow(r, false, aligns)));
    table.append(thead, tbody);

    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'cm-lp-table-add cm-lp-table-add-row';
    addRowBtn.title = t('table.addRow');
    addRowBtn.textContent = '+';
    addRowBtn.addEventListener('click', () => addRow(view, wrap));

    const addColBtn = document.createElement('button');
    addColBtn.className = 'cm-lp-table-add cm-lp-table-add-col';
    addColBtn.title = t('table.addColumn');
    addColBtn.textContent = '+';
    addColBtn.addEventListener('click', () => addColumn(view, wrap));

    const grid = document.createElement('div');
    grid.className = 'cm-lp-table-grid';
    grid.append(table, addColBtn, addRowBtn);
    wrap.appendChild(grid);

    wrap.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      (input.parentElement as HTMLElement).dataset.value = input.value;
      commit(view, wrap);
    });
    wrap.addEventListener('keydown', (e) => onKeyDown(view, wrap, e));
    // El cursor de CodeMirror no entra en las celdas: se lleva al inicio de la tabla para que
    // lo que muestre el cursor (p. ej. al abrirse el teclado del móvil) no salte a otra parte
    wrap.addEventListener('focusin', () => {
      const pos = view.posAtDOM(wrap);
      if (view.state.selection.main.head !== pos) view.dispatch({ selection: { anchor: pos } });
    });
    return wrap;
  }

  // Tras un cambio hecho desde la propia tabla se conserva el DOM (y el foco en la celda)
  updateDOM(dom: HTMLElement) {
    const wrap = dom as TableDom;
    const { rows, aligns } = parseTable(this.source);
    const domRows = tableOf(wrap).rows;
    if (domRows.length !== rows.length || rows.some((r, i) => r.length !== domRows[i].cells.length)) return false;
    wrap.cmTable = { source: this.source, aligns };
    rows.forEach((r, i) =>
      r.forEach((value, j) => {
        const input = domRows[i].cells[j].querySelector('input')!;
        if (input.value !== value && document.activeElement !== input) {
          input.value = value;
          (input.parentElement as HTMLElement).dataset.value = value;
        }
      })
    );
    return true;
  }

  ignoreEvent() {
    return true;
  }
}

function buildTables(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  // Solo tablas de primer nivel (no dentro de listas o citas)
  const cursor = syntaxTree(state).topNode.cursor();
  if (cursor.firstChild()) {
    do {
      if (cursor.name !== 'Table') continue;
      const from = state.doc.lineAt(cursor.from).from;
      const to = state.doc.lineAt(Math.max(cursor.from, cursor.to - 1)).to;
      // Con la selección dentro de la tabla (p. ej. al buscar) se muestra el Markdown
      const inside = sel.some((r) => (r.from > from && r.from < to) || (r.to > from && r.to < to));
      if (inside) continue;
      const widget = new TableWidget(state.doc.sliceString(from, to));
      decos.push(Decoration.replace({ widget, block: true }).range(from, to));
    } while (cursor.nextSibling());
  }
  return Decoration.set(decos);
}

export const liveTables = StateField.define<DecorationSet>({
  create: buildTables,
  update(decos, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return buildTables(tr.state);
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});
