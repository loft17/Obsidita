// Tablas a ancho completo: saca cada tabla de la columna del texto y la centra en el área de la nota.
// El texto conserva su ancho (--line-width), así que solo cambian las tablas. Se aplica en JS porque
// la tabla vive dentro de la columna del texto (y en el editor, junto a los números de línea), y
// desde CSS no hay forma fiable de medir ese hueco.

const GUTTER = 16; // margen con el borde del área de la nota
const TABLE_SELECTOR = '.cm-lp-table-wrap, .reading-view table';
const SCROLLER_SELECTOR = '.cm-scroller, .reading-view';

let started = false;
let frame = 0;
// Áreas de la nota ya vigiladas: si cambian de tamaño (sidebar, ventana), se vuelven a colocar las tablas
const watched = new WeakSet<Element>();
const sizeObserver = new ResizeObserver(() => {
  if (isEnabled()) refreshWideTables();
});

function isEnabled() {
  return document.documentElement.dataset.tableWide === 'on';
}

const fit = (table: HTMLElement) => {
  const scroller = table.closest<HTMLElement>(SCROLLER_SELECTOR);
  if (!scroller) return;
  // Se vuelve a la posición natural para medirla
  table.style.marginLeft = '';
  table.style.width = '';
  table.style.maxWidth = '';
  // En el visor la tabla es display:block; sus filas quedan en una tabla anónima de ancho natural
  // y no se estiran. Con display:table la tabla ocupa el ancho asignado.
  table.style.display = table.tagName === 'TABLE' ? 'table' : '';
  const box = scroller.getBoundingClientRect();
  const available = scroller.clientWidth - 2 * GUTTER;
  const current = table.getBoundingClientRect();
  const targetLeft = box.left + scroller.clientLeft + GUTTER;
  if (table.tagName === 'TABLE') {
    // Visor: la tabla toma su ancho natural (sin estirarse) hasta el ancho disponible, y se centra
    table.style.width = 'max-content';
    table.style.maxWidth = `${available}px`;
    const natural = table.getBoundingClientRect().width;
    const offset = Math.max(0, (available - natural) / 2);
    table.style.marginLeft = `${targetLeft - current.left + offset}px`;
    return;
  }
  table.style.width = `${available}px`;
  table.style.maxWidth = 'none';
  table.style.marginLeft = `${targetLeft - current.left}px`;
  centerGrid(table, available);
};

// En el editor la tabla va dentro de una rejilla de ancho natural: se centra dentro del área
const centerGrid = (wrap: HTMLElement, available: number) => {
  const grid = wrap.querySelector<HTMLElement>('.cm-lp-table-grid');
  if (!grid) return;
  const tools = wrap.querySelector<HTMLElement>('.cm-lp-table-tools');
  const count = wrap.querySelector<HTMLElement>('.cm-lp-table-count');
  grid.style.marginLeft = '';
  const shift = Math.max(0, (available - grid.offsetWidth) / 2);
  grid.style.marginLeft = `${shift}px`;
  // La barra de herramientas empieza donde la tabla (sin el hueco del tirador) y mide lo mismo
  if (tools) {
    const inset = parseFloat(getComputedStyle(grid).paddingLeft) || 0;
    tools.style.marginLeft = `${shift + inset}px`;
    tools.style.width = `${grid.offsetWidth - inset}px`;
  }
  // El contador va debajo de la tabla, alineado con su borde izquierdo
  if (count) count.style.marginLeft = `${shift + (parseFloat(getComputedStyle(grid).paddingLeft) || 0)}px`;
};

const reset = (table: HTMLElement) => {
  table.style.marginLeft = '';
  table.style.width = '';
  table.style.maxWidth = '';
  table.style.display = '';
  const grid = table.querySelector<HTMLElement>('.cm-lp-table-grid');
  if (grid) grid.style.marginLeft = '';
  const count = table.querySelector<HTMLElement>('.cm-lp-table-count');
  if (count) count.style.marginLeft = '';
  const tools = table.querySelector<HTMLElement>('.cm-lp-table-tools');
  if (tools) {
    tools.style.marginLeft = '';
    tools.style.width = '';
  }
};

// Vuelve a colocar todas las tablas (o quita el ajuste si está desactivado)
export const refreshWideTables = () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(TABLE_SELECTOR).forEach((table) => {
      if (isEnabled()) fit(table);
      else reset(table);
    });
    if (isEnabled()) {
      document.querySelectorAll<HTMLElement>(SCROLLER_SELECTOR).forEach((area) => {
        if (watched.has(area)) return;
        watched.add(area);
        sizeObserver.observe(area);
      });
    }
  });
};

// Se engancha una sola vez: sigue las tablas nuevas (al abrir notas o al desplazarse en el editor)
const start = () => {
  if (started) return;
  started = true;
  window.addEventListener('resize', refreshWideTables);
  new MutationObserver((records) => {
    // Los cambios de estilo de las propias tablas no cuentan: solo nodos añadidos o quitados
    if (isEnabled() && records.some((r) => r.type === 'childList')) refreshWideTables();
  }).observe(document.body, { childList: true, subtree: true });
};

export const setWideTables = (enabled: boolean) => {
  document.documentElement.dataset.tableWide = enabled ? 'on' : 'off';
  start();
  refreshWideTables();
};
