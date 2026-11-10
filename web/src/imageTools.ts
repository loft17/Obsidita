// Controles de las imágenes del editor (en la nota y en las celdas de las tablas): botón para
// ampliar a pantalla completa, botón para ver su Markdown y tirador para cambiar el ancho
import { isImage } from './attachments';
import { fileName } from './paths';
import { t } from './i18n';

const EMBED = /!\[\[([^\]\n]+?)\]\]/g;
const MD_IMAGE = /!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^)\s]+))[^)\n]*\)/g;

export interface ImageRef {
  at: number;
  len: number;
  kind: 'embed' | 'md';
  label: string; // lo que va tras ![[ (embed) o entre ![ y ] (md); puede acabar en |ancho
  src: string;
  alt: string; // texto con el tamaño, para parseSize
}

// Imágenes de un texto: ![[imagen.png|200]] y ![alt|200](ruta), en orden
export function findImages(text: string): ImageRef[] {
  const out: ImageRef[] = [];
  for (const m of text.matchAll(EMBED)) {
    const target = m[1].split('|')[0].trim();
    if (!isImage(target.split('#')[0].trim())) continue;
    const alt = m[1].includes('|') ? m[1] : fileName(target);
    out.push({ at: m.index!, len: m[0].length, kind: 'embed', label: m[1], src: target, alt });
  }
  for (const m of text.matchAll(MD_IMAGE)) {
    out.push({ at: m.index!, len: m[0].length, kind: 'md', label: m[1], src: (m[2] ?? m[3]).trim(), alt: m[1] });
  }
  return out.sort((a, b) => a.at - b.at);
}

// Markdown de la imagen con otro ancho: ![[img.png|300]] / ![alt|300](ruta). La altura se quita
// para no deformarla
export function imageWithWidth(text: string, img: ImageRef, width: number) {
  const raw = text.slice(img.at, img.at + img.len);
  const base = img.label.replace(/\|\s*\d+(?:\s*x\s*\d+)?\s*$/, '');
  return img.kind === 'embed' ? `![[${base}|${width}]]` : `![${base}|${width}]` + raw.slice(2 + img.label.length + 1);
}

const ICON_ZOOM = ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-5-5', 'M11 8v6', 'M8 11h6'];
const ICON_CODE = ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'];

function icon(paths: string[]) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

function imageBtn(cls: string, paths: string[], title: string, onClick: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `cm-lp-image-btn ${cls}`;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.append(icon(paths));
  // Sin quitar el foco al editor ni activar el <label> de la celda
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

// Imagen a tamaño completo sobre la página. Clic en la imagen: ajustada a la ventana ↔ tamaño
// real. Clic fuera, × o Escape: se cierra
export function openImageZoom(src: string, alt: string) {
  const overlay = document.createElement('div');
  overlay.className = 'cm-lp-image-zoom';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', alt || t('image.zoom'));
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.title = t('image.actualSize');
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    const actual = overlay.classList.toggle('is-actual-size');
    img.title = actual ? t('image.fitWindow') : t('image.actualSize');
  });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cm-lp-image-zoom-close';
  close.textContent = '×';
  close.title = t('common.close');
  close.setAttribute('aria-label', t('common.close'));
  overlay.append(img, close);
  const done = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    done();
  };
  overlay.addEventListener('click', done);
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  close.focus();
}

export interface ResizeOptions {
  maxWidth: (startWidth: number) => number; // ancho máximo al empezar a arrastrar
  onMove?: () => void;
  onEnd: (width: number) => void; // solo si el ancho ha cambiado
}

// Tirador de la esquina: arrastrar cambia el ancho en directo; al soltar, `onEnd` lo guarda
function startResize(e: PointerEvent, figure: HTMLElement, img: HTMLImageElement, opts: ResizeOptions) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget as HTMLElement;
  handle.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startW = img.getBoundingClientRect().width;
  const maxW = Math.max(startW, opts.maxWidth(startW));
  img.removeAttribute('height');
  figure.classList.add('is-resizing');
  let width = Math.round(startW);
  const move = (ev: PointerEvent) => {
    width = Math.round(Math.max(24, Math.min(maxW, startW + ev.clientX - startX)));
    img.width = width;
    opts.onMove?.();
  };
  const up = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    figure.classList.remove('is-resizing');
    if (width !== Math.round(startW)) opts.onEnd(width);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

export interface FigureOptions {
  src: string; // URL ya resuelta
  alt: string;
  width?: number;
  height?: number;
  className: string; // clase del <img>
  onSource: () => void; // botón </>: mostrar el Markdown
  resize?: ResizeOptions; // sin esto no hay tirador (solo lectura)
}

// <span> con la imagen, los botones (arriba a la derecha) y el tirador (abajo a la derecha)
export function imageFigure(o: FigureOptions) {
  const figure = document.createElement('span');
  figure.className = 'cm-lp-figure';
  const img = document.createElement('img');
  img.className = o.className;
  img.src = o.src;
  img.alt = o.alt;
  img.draggable = false;
  img.loading = 'lazy';
  if (o.width) img.width = o.width;
  if (o.height) img.height = o.height;
  const tools = document.createElement('span');
  tools.className = 'cm-lp-image-tools';
  tools.append(
    imageBtn('is-zoom', ICON_ZOOM, t('image.zoom'), () => openImageZoom(o.src, o.alt)),
    imageBtn('is-source', ICON_CODE, t('image.source'), o.onSource),
  );
  figure.append(img, tools);
  const resize = o.resize;
  if (resize) {
    const handle = document.createElement('span');
    handle.className = 'cm-lp-image-resize';
    handle.title = t('image.resize');
    handle.addEventListener('pointerdown', (e) => startResize(e, figure, img, resize));
    // El clic al soltar no debe activar nada (p. ej. el <label> de la celda)
    handle.addEventListener('click', (e) => e.preventDefault());
    figure.append(handle);
  }
  return figure;
}
