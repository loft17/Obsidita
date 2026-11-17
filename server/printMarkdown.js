// Render de una nota para exportarla a PDF (server/routes/files.js). Es markdown-it con lo que la
// vista de lectura resuelve en el cliente (web/src/components/ReadingView.tsx) y el markdown plano
// no entiende: ![[imagen]] con tamaño, imágenes relativas ![](imagen), [[enlaces]] y callouts.
// Las imágenes apuntan a /api/files/raw/, así que la página de exportación las carga del mismo origen
import { resolveWikilink } from './wikilinks.js';

// Carga perezosa, como el resto de módulos pesados (ver lazy.js)
let mdPromise;
export const renderPrintMarkdown = async (body, notePath, files) => {
  const md = await (mdPromise ??= import('markdown-it').then(({ default: MarkdownIt }) =>
    install(new MarkdownIt({ html: false, linkify: true, breaks: true }))
  ));
  return md.render(body, { notePath, files });
};

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/)/i;
const SIZE = /\|\s*(\d+)(?:\s*x\s*(\d+))?\s*$/;
const CALLOUT_ALIASES = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeDecode = (s) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

// URL de la página de exportación para un adjunto del vault, o null si no existe
const assetUrl = (target, notePath, files) => {
  const clean = safeDecode(target.split('#')[0].trim());
  if (!clean) return null;
  const found = resolveWikilink(clean, notePath, files);
  return found ? `/api/files/raw/${encodeURIComponent(found)}` : null;
};

// Imagen con su tamaño opcional ("300" o "300x200")
const imageHtml = (target, alt, size, env) => {
  const url = assetUrl(target, env.notePath, env.files);
  if (!url) return `<span class="missing-image">[${escapeHtml(target.split('/').pop())}]</span>`;
  const m = SIZE.exec(size ?? '');
  const width = m ? ` width="${m[1]}"` : '';
  const height = m && m[2] ? ` height="${m[2]}"` : '';
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${width}${height}>`;
};

// Texto visible de un [[enlace]]: el alias o, si no hay, el destino tal cual (como la web)
const linkLabel = (inner) => {
  const bar = inner.indexOf('|');
  if (bar < 0) return inner.trim();
  return inner.slice(bar + 1).trim() || inner.slice(0, bar).trim();
};

function install(md) {
  // ![[imagen.png]] o ![[imagen.png|300]]; las notas incrustadas se quedan en su nombre
  md.inline.ruler.before('image', 'print_embed', (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 3) !== '![[') return false;
    const end = state.src.indexOf(']]', start + 3);
    if (end < 0 || end + 2 > state.posMax) return false;
    const inner = state.src.slice(start + 3, end);
    if (!inner.trim() || inner.includes('\n')) return false;
    if (!silent) state.push('print_embed', '', 0).meta = { inner };
    state.pos = end + 2;
    return true;
  });

  // [[nota]], [[nota|alias]], [[nota#encabezado]]: solo el texto, sin corchetes
  md.inline.ruler.before('link', 'print_wikilink', (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== '[[') return false;
    const end = state.src.indexOf(']]', start + 2);
    if (end < 0 || end + 2 > state.posMax) return false;
    const inner = state.src.slice(start + 2, end);
    if (!inner.trim() || inner.includes('\n') || inner.includes('[')) return false;
    if (!silent) state.push('print_wikilink', '', 0).meta = { inner };
    state.pos = end + 2;
    return true;
  });

  md.renderer.rules.print_embed = (tokens, idx, _options, env) => {
    const inner = String(tokens[idx].meta.inner);
    const [target, ...rest] = inner.split('|');
    const bare = target.split('#')[0].trim();
    if (IMAGE_EXT.test(bare)) return imageHtml(bare, '', rest.join('|'), env);
    return `<span class="wikilink">${escapeHtml(linkLabel(inner))}</span>`;
  };

  md.renderer.rules.print_wikilink = (tokens, idx) =>
    `<span class="wikilink">${escapeHtml(linkLabel(String(tokens[idx].meta.inner)))}</span>`;

  // ![alt|300](imagen.png): la ruta relativa se resuelve dentro del vault; las URL externas se dejan
  md.renderer.rules.image = (tokens, idx, _options, env) => {
    const token = tokens[idx];
    const src = String(token.attrGet('src') ?? '');
    const alt = String(token.content ?? '');
    const sizeMatch = SIZE.exec(alt);
    const text = sizeMatch ? alt.slice(0, sizeMatch.index) : alt;
    if (EXTERNAL.test(src)) {
      const width = sizeMatch ? ` width="${sizeMatch[1]}"` : '';
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text)}"${width} loading="lazy">`;
    }
    return imageHtml(src, text, sizeMatch ? sizeMatch[0] : '', env);
  };

  // Callouts al estilo Obsidian: > [!tipo] Título (los plegables se imprimen desplegados)
  md.core.ruler.before('inline', 'print_callout', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const m = /^\[!([\w-]+)\][+-]?[ \t]*(.*)/.exec(inline.content);
      if (!m) continue;

      const raw = m[1].toLowerCase();
      const type = CALLOUT_ALIASES[raw] ?? raw;
      const title = m[2].trim() || raw.charAt(0).toUpperCase() + raw.slice(1);
      tokens[i].meta = { callout: { type, title } };

      let depth = 0;
      for (let j = i; j < tokens.length; j++) {
        if (tokens[j].type === 'blockquote_open') depth++;
        else if (tokens[j].type === 'blockquote_close' && --depth === 0) {
          tokens[j].meta = { callout: true };
          break;
        }
      }

      // Quitar la línea del título del primer párrafo
      const nl = inline.content.indexOf('\n');
      if (nl < 0) tokens.splice(i + 1, 3);
      else inline.content = inline.content.slice(nl + 1);
    }
  });

  md.renderer.rules.blockquote_open = (tokens, idx, options, env, self) => {
    const callout = tokens[idx].meta?.callout;
    if (!callout) return self.renderToken(tokens, idx, options);
    return (
      `<div class="callout" data-callout="${escapeHtml(callout.type)}">` +
      `<div class="callout-title">${md.renderInline(callout.title, env)}</div>` +
      '<div class="callout-content">'
    );
  };

  md.renderer.rules.blockquote_close = (tokens, idx, options, _env, self) =>
    tokens[idx].meta?.callout ? '</div></div>\n' : self.renderToken(tokens, idx, options);

  return md;
}
