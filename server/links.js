// Actualiza los enlaces del vault después de renombrar o mover un archivo o carpeta,
// como hace Obsidian: [[wikilinks]], ![[incrustaciones]] y [enlaces](markdown).
// Cada enlace se resuelve como antes del cambio; si apuntaba a algo que se ha movido
// (o la nota que lo contiene se ha movido y el enlace ya no llega), se reescribe.
import { readFileSync, writeFileSync } from 'fs';
import { posix } from 'path';
import * as vault from './vault.js';
import { resolveWikilink as resolveInVault } from '../shared/wikilinks.js';

const lower = (s) => s.toLowerCase();
const parentDir = (p) => p.split('/').slice(0, -1).join('/');
const isMd = (p) => /\.md$/i.test(p);

// Archivos del vault: la lista en el orden del árbol (para los wikilinks, igual que el cliente)
// y un índice por ruta en minúsculas → ruta real (para los enlaces markdown)
const indexFiles = (paths) => ({ paths, byLower: new Map(paths.map((p) => [lower(p), p])) });

// La misma resolución que el cliente: ver shared/wikilinks.js
const resolveWikilink = (target, notePath, files) => resolveInVault(target, notePath, files.paths);

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

// Enlace markdown: relativo a la nota o desde la raíz del vault. Devuelve la ruta y cuál de los dos era
function resolveMdLink(url, notePath, files) {
  const path = safeDecode(url.replace(/[#?].*$/, ''));
  if (!path) return null;
  const relative = posix.normalize(posix.join(parentDir(notePath), path));
  const fromNote = files.byLower.get(lower(relative));
  if (fromNote && !path.startsWith('/')) return { path: fromNote, relative: true };
  const fromRoot = files.byLower.get(lower(path.replace(/^\/+/, '')));
  return fromRoot ? { path: fromRoot, relative: false } : null;
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

// Código en línea, [[wikilink]] (con o sin !) o el destino de un [enlace](markdown)
const TOKEN = /(`+)[^`\n]*?\1|(!?)\[\[([^[\]\n]+?)\]\]|(\[[^\]\n]*\]\()(<[^>\n]+>|[^)\s]+)/g;

// Reescribe los enlaces de una nota. `move` traduce una ruta antigua a la nueva (o null si no se movió)
function rewriteNote(content, oldNote, newNote, oldFiles, newFiles, move) {
  // Ruta a la que debe llegar el enlace después del cambio
  const newTarget = (oldTarget) => move(oldTarget) ?? oldTarget;

  const rewriteWikilink = (inner) => {
    const bar = inner.indexOf('|');
    const link = bar < 0 ? inner : inner.slice(0, bar);
    const hash = link.indexOf('#');
    const rawTarget = hash < 0 ? link : link.slice(0, hash);
    const target = rawTarget.trim();
    if (!target) return inner;
    const oldPath = resolveWikilink(target, oldNote, oldFiles);
    if (!oldPath) return inner;
    const wanted = newTarget(oldPath);
    if (resolveWikilink(target, newNote, newFiles) === wanted) return inner;
    // Se conserva el estilo: sin .md si no lo llevaba y solo el nombre si no tenía carpeta y basta
    const strip = (p) => (isMd(p) && !isMd(target) ? p.replace(/\.md$/i, '') : p);
    const options = target.includes('/') ? [wanted] : [wanted.split('/').pop(), wanted];
    const text = strip(options.find((o) => resolveWikilink(strip(o), newNote, newFiles) === wanted) ?? wanted);
    return text + inner.slice(rawTarget.length);
  };

  const rewriteMdLink = (url) => {
    const bracketed = url.startsWith('<');
    const raw = bracketed ? url.slice(1, -1) : url;
    if (EXTERNAL.test(raw)) return url;
    const old = resolveMdLink(raw, oldNote, oldFiles);
    if (!old) return url;
    const wanted = newTarget(old.path);
    if (resolveMdLink(raw, newNote, newFiles)?.path === wanted) return url;
    let path = old.relative ? posix.relative(parentDir(newNote) || '.', wanted) : wanted;
    if (old.relative && !path.startsWith('.') && raw.startsWith('./')) path = './' + path;
    const suffix = raw.match(/[#?].*$/)?.[0] ?? '';
    return bracketed ? `<${path}${suffix}>` : path.replace(/ /g, '%20') + suffix;
  };

  let inCode = false;
  return content
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inCode = !inCode;
        return line;
      }
      if (inCode) return line;
      return line.replace(TOKEN, (match, code, bang, inner, open, url) => {
        if (code) return match;
        if (inner !== undefined) return `${bang}[[${rewriteWikilink(inner)}]]`;
        return open + rewriteMdLink(url);
      });
    })
    .join('\n');
}

// Llamar ANTES de renombrar `oldPath` → `newPath` (archivo o carpeta). Devuelve una
// función que, llamada DESPUÉS del cambio, reescribe los enlaces y devuelve las notas modificadas
export function prepareLinkUpdate(vaultPath, oldPath, newPath) {
  const before = vault.listTree(vaultPath).filter((i) => i.type !== 'folder').map((i) => i.path);
  const move = (p) =>
    p === oldPath || lower(p).startsWith(lower(oldPath) + '/') ? newPath + p.slice(oldPath.length) : null;
  const moved = before.filter((p) => move(p) !== null);
  if (!moved.length) return () => [];

  const oldFiles = indexFiles(before);
  const newFiles = indexFiles(before.map((p) => move(p) ?? p));
  // Filtro rápido: solo se analizan las notas que mencionan algún nombre movido o que se han movido ellas
  const names = [...new Set(moved.map((p) => lower(p.split('/').pop().replace(/\.md$/i, ''))))];

  return () => {
    const updated = [];
    for (const oldNote of before.filter(isMd)) {
      const newNote = move(oldNote) ?? oldNote;
      try {
        const fullPath = vault.resolveFile(vaultPath, newNote);
        const content = readFileSync(fullPath, 'utf8');
        const haystack = lower(content).replace(/%20/g, ' ');
        if (newNote === oldNote && !names.some((n) => haystack.includes(n))) continue;
        const result = rewriteNote(content, oldNote, newNote, oldFiles, newFiles, move);
        if (result !== content) {
          writeFileSync(fullPath, result, 'utf8');
          updated.push(newNote);
        }
      } catch (err) {
        console.error(`No se pudieron actualizar los enlaces de ${newNote}:`, err.message);
      }
    }
    return updated;
  };
}
