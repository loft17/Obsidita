import { Router } from 'express';
import { statSync, readFileSync } from 'fs';
import * as vault from '../vault.js';
import { snapshot, getContentLines } from '../searchIndex.js';
import { findTags, findLinks, linkFileName, resolveLink } from '../noteContent.js';
import { publicError } from '../security.js';
import {
  SEARCH_MAX_RESULTS as MAX_RESULTS,
  SEARCH_MAX_MATCHES_PER_FILE as MAX_MATCHES_PER_FILE,
  SEARCH_MAX_QUERY_LENGTH as MAX_QUERY_LENGTH,
  SEARCH_RATE_MAX as RATE_MAX,
} from '../limits.js';

const SNIPPET_RADIUS = 60;

// Los límites (en limits.js) evitan que las búsquedas saturen el servidor: cada una recorre el árbol del vault
const RATE_WINDOW = 60 * 1000;

const recent = new Map(); // ip → marcas de tiempo de sus búsquedas en la última ventana
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of recent) {
    if (!times.some((t) => now - t < RATE_WINDOW)) recent.delete(ip);
  }
}, RATE_WINDOW).unref();

const rateLimited = (ip) => {
  const now = Date.now();
  const times = (recent.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW);
  const limited = times.length >= RATE_MAX;
  if (!limited) times.push(now);
  recent.set(ip, times);
  return limited;
};

// Fragmento de la línea centrado en la coincidencia
const snippet = (line, idx, len) => {
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(line.length, idx + len + SNIPPET_RADIUS);
  return {
    text: (start > 0 ? '…' : '') + line.slice(start, end) + (end < line.length ? '…' : ''),
    start: idx - start + (start > 0 ? 1 : 0),
    length: len,
  };
};

// Etiquetas de una nota del índice: se calculan una vez por cada versión de la nota
const noteTags = (note, vaultPath, filePath) => {
  if (note.tags !== null) return note.tags;
  const lines = getContentLines(vaultPath, filePath);
  note.tags = findTags(lines);
  return note.tags;
};

// Todas las etiquetas del vault con las notas en las que aparecen. Sin distinguir
// mayúsculas, como Obsidian: se muestra la forma de la primera aparición
function listTags(cfg) {
  const tags = new Map(); // minúsculas → { tag, paths }
  for (const { file, note } of snapshot(cfg.vaultPath)) {
    if (!note) continue;
    for (const { text } of noteTags(note, cfg.vaultPath, file.path)) {
      const tag = text.replace(/^#/, '').replace(/\/+$/, '');
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (!tags.has(key)) tags.set(key, { tag, paths: new Set() });
      tags.get(key).paths.add(file.path);
    }
  }
  return [...tags.values()].map(({ tag, paths }) => ({ tag, paths: [...paths] }));
}

function searchTag(cfg, tag) {
  const needle = tag.toLowerCase();
  const results = [];
  for (const { file, note } of snapshot(cfg.vaultPath)) {
    if (!note) continue;
    // Coincide la etiqueta exacta y sus subetiquetas (proyecto → proyecto/web)
    const hits = noteTags(note, cfg.vaultPath, file.path).filter(({ text }) => {
      const t = text.replace(/^#/, '').toLowerCase();
      return t === needle || t.startsWith(needle + '/');
    });
    if (hits.length === 0) continue;
    const lines = getContentLines(cfg.vaultPath, file.path);
    const matches = hits
      .slice(0, MAX_MATCHES_PER_FILE)
      .map((h) => ({ line: h.line + 1, ...snippet(lines[h.line], Math.max(h.idx, 0), h.text.length) }));
    results.push({ path: file.path, name: file.name, nameMatch: false, total: hits.length, matches });
  }
  results.sort((a, b) => b.total - a.total || a.path.localeCompare(b.path));
  return results.slice(0, MAX_RESULTS);
}

// Enlaces de una nota del índice: como las etiquetas, una vez por cada versión. Salen del
// contenido en minúsculas, que basta porque los enlaces se resuelven sin distinguir mayúsculas
const noteLinks = (note) => {
  if (note.links === null) note.links = findLinks(note.lower);
  return note.links;
};

// Notas que enlazan a `target` y cuántas veces. Solo se resuelven los enlaces cuyo nombre de
// archivo coincide con el suyo: el resto no pueden llegar a él
function findBacklinks(cfg, target) {
  const entries = snapshot(cfg.vaultPath);
  const paths = entries.filter(({ file }) => file.type !== 'folder').map(({ file }) => file.path);
  const name = target.split('/').pop().toLowerCase();
  const results = [];
  for (const { file, note } of entries) {
    if (!note || file.path === target) continue;
    let count = 0;
    for (const link of noteLinks(note)) {
      if (linkFileName(link) === name && resolveLink(link, file.path, paths) === target) count++;
    }
    if (count) results.push({ path: file.path, count });
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Codificación y saltos de línea del archivo tal cual está en el disco
function describeEncoding(buf) {
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let valid = true;
  try {
    utf8.decode(buf);
  } catch {
    valid = false;
  }
  const text = buf.toString('latin1');
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const lineEndings = crlf && lf ? 'mixed' : crlf ? 'CRLF' : lf ? 'LF' : null;
  return { encoding: valid ? 'UTF-8' : null, bom, lineEndings };
}

export default (dataDir, getConfig) => {
  const router = Router();

  router.get('/tags', (req, res) => {
    try {
      const cfg = getConfig();
      if (!cfg) return res.status(400).json({ error: 'Not configured' });
      // Recorre todo el vault, como una búsqueda: comparte su límite
      if (rateLimited(req.ip)) {
        res.set('Retry-After', String(RATE_WINDOW / 1000));
        return res.status(429).json({ error: 'Demasiadas búsquedas. Espera un momento' });
      }
      res.json(listTags(cfg));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'Error al leer las etiquetas') });
    }
  });

  // Información de un archivo para el panel de la nota: datos del disco y enlaces entrantes.
  // Recorre el vault como una búsqueda, así que comparte su límite
  router.get('/note-info', (req, res) => {
    try {
      const cfg = getConfig();
      if (!cfg) return res.status(400).json({ error: 'Not configured' });
      const path = String(req.query.path || '');
      if (!path) return res.status(400).json({ error: 'Falta la ruta' });
      if (rateLimited(req.ip)) {
        res.set('Retry-After', String(RATE_WINDOW / 1000));
        return res.status(429).json({ error: 'Demasiadas búsquedas. Espera un momento' });
      }
      const fullPath = vault.resolveFile(cfg.vaultPath, path);
      const stat = statSync(fullPath);
      if (!stat.isFile()) return res.status(404).json({ error: 'Not found' });
      const isMd = /\.md$/i.test(path);
      res.json({
        size: stat.size,
        // Algunos sistemas de archivos no guardan la fecha de creación (birthtime = 0)
        created: stat.birthtimeMs > 0 ? stat.birthtimeMs : null,
        modified: stat.mtimeMs,
        ...(isMd ? describeEncoding(readFileSync(fullPath)) : { encoding: null, bom: false, lineEndings: null }),
        backlinks: findBacklinks(cfg, path),
      });
    } catch (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
      res.status(400).json({ error: publicError(err, 'Error al leer la información de la nota') });
    }
  });

  router.get('/', (req, res) => {
    try {
      const cfg = getConfig();
      if (!cfg) return res.status(400).json({ error: 'Not configured' });

      const q = String(req.query.q || '').trim();
      if (!q) return res.json([]);
      if (q.length > MAX_QUERY_LENGTH) return res.status(400).json({ error: 'Búsqueda demasiado larga' });
      if (rateLimited(req.ip)) {
        res.set('Retry-After', String(RATE_WINDOW / 1000));
        return res.status(429).json({ error: 'Demasiadas búsquedas. Espera un momento' });
      }

      // Operador de etiqueta, como en Obsidian: tag:proyecto o tag:#proyecto
      const tagQuery = /^tag:\s*#?(\S+)$/i.exec(q);
      if (tagQuery) return res.json(searchTag(cfg, tagQuery[1]));

      const needle = q.toLowerCase();

      const results = [];

      for (const { file, note } of snapshot(cfg.vaultPath)) {
        if (file.type === 'folder') continue;
        const nameMatch = file.name.toLowerCase().includes(needle);
        const matches = [];
        let total = 0;

        // Solo se busca dentro de las notas markdown. Las que no contienen el texto
        // se descartan con una sola búsqueda sobre el contenido entero
        if (note?.lower.includes(needle)) getContentLines(cfg.vaultPath, file.path).forEach((line, i) => {
          const lower = line.toLowerCase();
          let idx = lower.indexOf(needle);
          while (idx >= 0) {
            total++;
            if (matches.length < MAX_MATCHES_PER_FILE) {
              matches.push({ line: i + 1, ...snippet(line, idx, needle.length) });
            }
            idx = lower.indexOf(needle, idx + needle.length);
          }
        });

        if (nameMatch || total > 0) {
          results.push({ path: file.path, name: file.name, nameMatch, total, matches });
        }
      }

      // Primero las coincidencias por nombre, luego por número de apariciones
      results.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || b.total - a.total || a.path.localeCompare(b.path));
      res.json(results.slice(0, MAX_RESULTS));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'Error en la búsqueda') });
    }
  });

  return router;
};
