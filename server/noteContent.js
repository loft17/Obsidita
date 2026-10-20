// Análisis del contenido de una nota compartido por el cliente (panel de información) y el
// servidor (búsqueda de etiquetas y enlaces entrantes): etiquetas y enlaces que contiene.
// Sin dependencias a propósito, como wikilinks.js
import { resolveWikilink } from './wikilinks.js';

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const INLINE_TAG = /(^|\s)#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const cleanTag = (s) => s.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').replace(/^#/, '');

// Apariciones de etiquetas en una nota: { line, idx, text } por cada una, tanto en
// la propiedad `tags` del frontmatter como en `#etiquetas` del cuerpo (fuera de bloques de código)
export function findTags(lines) {
  const found = [];
  let start = 0;
  const fm = FRONTMATTER.exec(lines.join('\n'));
  if (fm) {
    const fmLines = fm[1] === undefined ? [] : fm[1].split('\n');
    start = fmLines.length + 2;
    for (let i = 0; i < fmLines.length; i++) {
      const m = /^(tags?)[ \t]*:[ \t]*(.*)$/i.exec(fmLines[i]);
      if (!m) continue;
      const rest = m[2].trim();
      const lineNo = i + 1;
      const push = (ln, raw) => {
        const text = cleanTag(raw);
        if (text) found.push({ line: ln, idx: lines[ln].indexOf(text), text });
      };
      if (rest === '') {
        for (let j = i + 1; j < fmLines.length && /^\s*-(\s|$)/.test(fmLines[j]); j++) {
          push(j + 1, fmLines[j].replace(/^\s*-\s?/, ''));
        }
      } else {
        rest.replace(/^\[|\]$/g, '').split(/[,\s]+/).forEach((t) => push(lineNo, t));
      }
    }
  }
  let inCode = false;
  for (let i = start; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inCode = !inCode;
    if (inCode) continue;
    for (const m of lines[i].matchAll(INLINE_TAG)) {
      found.push({ line: i, idx: m.index + m[1].length, text: '#' + m[2] });
    }
  }
  return found;
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

// Código en línea, [[wikilink]] (con o sin !) o el destino de un [enlace](markdown), como en links.js
const TOKEN = /(`+)[^`\n]*?\1|(!?)\[\[([^[\]\n]+?)\]\]|(!?)\[[^\]\n]*\]\((<[^>\n]+>|[^)\s]+)/g;

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// Enlaces internos de una nota, fuera de bloques y fragmentos de código:
// { target, embed, markdown } con el destino sin #encabezado, alias ni ?query
export function findLinks(content) {
  const links = [];
  let inCode = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    for (const m of line.matchAll(TOKEN)) {
      if (m[3] !== undefined) {
        const inner = m[3];
        const bar = inner.indexOf('|');
        const link = bar < 0 ? inner : inner.slice(0, bar);
        const hash = link.indexOf('#');
        const target = (hash < 0 ? link : link.slice(0, hash)).trim();
        if (target) links.push({ target, embed: m[2] === '!', markdown: false });
      } else if (m[5] !== undefined) {
        const raw = m[5].startsWith('<') ? m[5].slice(1, -1) : m[5];
        if (EXTERNAL.test(raw)) continue;
        const target = safeDecode(raw.replace(/[#?].*$/, ''));
        if (target) links.push({ target, embed: m[4] === '!', markdown: true });
      }
    }
  }
  return links;
}

// Ruta normalizada sin `.` ni `..` (sin depender de `path`, que no existe en el navegador)
const normalize = (p) => {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
};

const lower = (s) => s.toLowerCase();
const parentDir = (p) => p.split('/').slice(0, -1).join('/');

// Nombre de archivo (en minúsculas) al que puede llegar el enlace: permite descartar sin resolverlo
// los que no apuntan a una nota concreta. Un wikilink sin extensión se refiere a una nota (.md)
export function linkFileName(link) {
  const name = lower(link.target.split('/').pop() ?? '');
  if (link.markdown || (/\.[^/]+$/.test(name) && !/\.md$/.test(name))) return name;
  return name.replace(/\.md$/, '') + '.md';
}

// Archivo de `paths` al que lleva el enlace desde `notePath`, o null. Los enlaces markdown son
// relativos a la nota o, si no llegan, desde la raíz del vault (igual que en links.js)
export function resolveLink(link, notePath, paths) {
  if (!link.markdown) return resolveWikilink(link.target, notePath, paths);
  const find = (p) => paths.find((f) => lower(f) === lower(p)) ?? null;
  const fromNote = link.target.startsWith('/') ? null : find(normalize(`${parentDir(notePath)}/${link.target}`));
  return fromNote ?? find(normalize(link.target));
}
