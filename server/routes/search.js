import { Router } from 'express';
import { snapshot, getContentLines } from '../searchIndex.js';
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

const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const INLINE_TAG = /(^|\s)#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

const cleanTag = (s) => s.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '').replace(/^#/, '');

// Apariciones de etiquetas en una nota: { line, idx, text } por cada una, tanto en
// la propiedad `tags` del frontmatter como en `#etiquetas` del cuerpo (fuera de bloques de código)
function findTags(lines) {
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
