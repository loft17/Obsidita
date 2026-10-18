import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import markdownIt from 'markdown-it';
import { parseNote } from '../frontmatter';
import Properties from './Properties';
import InlineTitle from './InlineTitle';
import { useStore } from '../store';
import { attachmentUrl, isImage, parseSize } from '../attachments';
import {
  followWikilink, isResolved, parseWikilink, resolveWikilink, scrollToHeading, scrollToLine, subscribePendingScroll, takePendingHeading, takePendingLine, wikilinkLabel,
} from '../wikilinks';
import { embedSection, getEmbedContent, getEmbedsVersion, refreshEmbeds, subscribeEmbeds } from '../noteEmbeds';
import { cancelPendingSave, NOTES_CHANGED, saveNote } from './Editor';
import { highlightCodeBlocks } from '../codeHighlight';
import { cachedDiagram, currentDiagramTheme, renderMermaidDiagrams } from '../mermaidDiagrams';
import { t, useI18n } from '../i18n';

const md = markdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Línea de origen (0-indexed sobre el cuerpo) en cada bloque, para saltar a resultados de búsqueda.
// Las notas incrustadas no la llevan: sus líneas son de otra nota
md.core.ruler.push('source_line', (state) => {
  if (Array.isArray(state.env?.embedStack)) return;
  for (const token of state.tokens) {
    if (token.map && token.nesting !== -1 && token.type !== 'inline') token.attrSet('data-line', String(token.map[0]));
  }
});

// Resaltado al estilo Obsidian: ==texto== → <mark>
md.inline.ruler.before('emphasis', 'mark', (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== '==') return false;
  const end = state.src.indexOf('==', start + 2);
  if (end < 0 || end === start + 2 || end + 2 > state.posMax) return false;
  if (!silent) {
    state.push('mark_open', 'mark', 1);
    const max = state.posMax;
    state.pos = start + 2;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.posMax = max;
    state.push('mark_close', 'mark', -1);
  }
  state.pos = end + 2;
  return true;
});

// Etiquetas en línea al estilo Obsidian: #etiqueta (no solo números; admite anidadas con /)
const INLINE_TAG = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u;

md.inline.ruler.before('emphasis', 'tag', (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x23 /* # */) return false;
  if (start > 0 && !/\s/.test(state.src[start - 1])) return false;
  const m = INLINE_TAG.exec(state.src.slice(start, state.posMax));
  if (!m) return false;
  if (!silent) {
    const open = state.push('tag_open', 'a', 1);
    open.attrSet('href', '#');
    open.attrSet('class', 'tag');
    open.attrSet('data-tag', m[1]);
    state.push('text', '', 0).content = m[0];
    state.push('tag_close', 'a', -1);
  }
  state.pos = start + m[0].length;
  return true;
});

// Enlace interno: muestra el alias y marca las notas que aún no existen
function pushWikilink(state: typeof md.inline.State.prototype, inner: string) {
  const notePath = String(state.env.notePath ?? '');
  const open = state.push('wikilink_open', 'a', 1);
  open.attrSet('href', '#');
  open.attrSet('class', isResolved(inner, notePath) ? 'wikilink' : 'wikilink is-unresolved');
  open.attrSet('data-href', inner);
  state.push('text', '', 0).content = wikilinkLabel(inner);
  state.push('wikilink_close', 'a', -1);
}

// Enlaces internos al estilo Obsidian: [[nota]], [[nota|alias]], [[nota#encabezado]]
md.inline.ruler.before('link', 'wikilink', (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== '[[') return false;
  const end = state.src.indexOf(']]', start + 2);
  if (end < 0 || end + 2 > state.posMax) return false;
  const inner = state.src.slice(start + 2, end);
  if (!inner.trim() || inner.includes('\n') || inner.includes('[')) return false;
  if (!silent) pushWikilink(state, inner);
  state.pos = end + 2;
  return true;
});

// Incrustaciones al estilo Obsidian: ![[imagen.png]] o ![[imagen.png|300]]
md.inline.ruler.before('image', 'embed', (state, silent) => {
  const start = state.pos;
  if (state.src.slice(start, start + 3) !== '![[') return false;
  const end = state.src.indexOf(']]', start + 3);
  if (end < 0 || end + 2 > state.posMax) return false;
  const inner = state.src.slice(start + 3, end);
  if (!inner || inner.includes('\n')) return false;
  if (!silent) {
    const [target] = inner.split('|');
    if (isImage(target.split('#')[0].trim())) {
      const token = state.push('image', 'img', 0);
      token.attrs = [['src', target.trim()]];
      token.content = inner.includes('|') ? inner : target.trim().split('/').pop()!;
      token.children = [];
    } else {
      // Nota incrustada: se pinta como bloque si ocupa su propio párrafo (ver note_embed_block)
      state.push('note_embed', '', 0).meta = { inner };
    }
  }
  state.pos = end + 2;
  return true;
});

const embedTarget = (meta: unknown) => String((meta as { inner?: string } | null)?.inner ?? '');

// Una nota incrustada dentro de una línea de texto se queda en enlace
md.renderer.rules.note_embed = (tokens, idx, _options, env) =>
  renderWikilink(embedTarget(tokens[idx].meta), String(env?.notePath ?? ''));

const renderWikilink = (inner: string, notePath: string) =>
  `<a href="#" class="${isResolved(inner, notePath) ? 'wikilink' : 'wikilink is-unresolved'}"` +
  ` data-href="${md.utils.escapeHtml(inner)}">${md.utils.escapeHtml(wikilinkLabel(inner))}</a>`;

// Párrafos formados solo por ![[nota]] (uno por línea): cada uno pasa a ser un bloque
md.core.ruler.after('inline', 'note_embed_block', (state) => {
  const tokens = state.tokens;
  for (let i = tokens.length - 3; i >= 0; i--) {
    if (tokens[i].type !== 'paragraph_open' || tokens[i + 2]?.type !== 'paragraph_close') continue;
    const children = tokens[i + 1].children ?? [];
    const embeds = children.filter((t) => t.type === 'note_embed');
    const onlyEmbeds = children.every(
      (t) => t.type === 'note_embed' || t.type === 'softbreak' || (t.type === 'text' && !t.content.trim())
    );
    if (!embeds.length || !onlyEmbeds) continue;
    tokens.splice(
      i,
      3,
      ...embeds.map((t) => {
        const block = new state.Token('note_embed_block', 'div', 0);
        block.block = true;
        block.meta = t.meta;
        return block;
      })
    );
  }
});

// Listas de tareas: - [ ] pendiente / - [x] hecha → casilla (data-line apunta a la línea del cuerpo)
const TASK = /^\[([ xX])\](?=\s|$)\s?/;

md.core.ruler.after('inline', 'task_list', (state) => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open') continue;
    const item = tokens[i - 2];
    if (item.type !== 'list_item_open') continue;
    const first = inline.children?.[0];
    const m = first?.type === 'text' ? TASK.exec(first.content) : null;
    if (!first || !m) continue;

    first.content = first.content.slice(m[0].length);
    const box = new state.Token('task_checkbox', 'input', 0);
    box.meta = { checked: m[1] !== ' ', line: inline.map?.[0] ?? item.map?.[0] };
    inline.children!.unshift(box);
    item.attrJoin('class', m[1] === ' ' ? 'task-list-item' : 'task-list-item is-checked');
    if (m[1] !== ' ') item.attrSet('data-task', m[1]);

    // Lista que la contiene
    for (let j = i - 3, depth = 0; j >= 0; j--) {
      const type = tokens[j].type;
      if (type === 'bullet_list_close' || type === 'ordered_list_close') depth++;
      else if (type === 'bullet_list_open' || type === 'ordered_list_open') {
        if (depth-- === 0) {
          if (!/contains-task-list/.test(String(tokens[j].attrGet('class') ?? ''))) tokens[j].attrJoin('class', 'contains-task-list');
          break;
        }
      }
    }
  }
});

// En las notas incrustadas la casilla es de solo lectura
md.renderer.rules.task_checkbox = (tokens, idx, _options, env) => {
  const { checked, line } = tokens[idx].meta as { checked: boolean; line?: number };
  const editable = line !== undefined && !Array.isArray(env?.embedStack);
  return (
    '<input type="checkbox" class="task-list-item-checkbox"' +
    (editable ? ` data-line="${line}"` : ' disabled') +
    (checked ? ' checked' : '') +
    '>'
  );
};

// Marca o desmarca la tarea de la línea indicada del cuerpo de la nota
function toggleTask(body: string, line: number, checked: boolean): string | null {
  const lines = body.split('\n');
  const re = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)[ xX](\])/;
  if (line < 0 || line >= lines.length || !re.test(lines[line])) return null;
  lines[line] = lines[line].replace(re, `$1${checked ? 'x' : ' '}$2`);
  return lines.join('\n');
}

// Límite de incrustaciones anidadas (y protección contra notas que se incrustan entre sí)
const MAX_EMBED_DEPTH = 4;

md.renderer.rules.note_embed_block = (tokens, idx, _options, env) => {
  const inner = embedTarget(tokens[idx].meta);
  const notePath = String(env?.notePath ?? '');
  const stack: string[] = Array.isArray(env?.embedStack) ? env.embedStack : [notePath];
  const { target, heading } = parseWikilink(inner);
  const path = resolveWikilink(target, notePath);
  const link = renderWikilink(inner, notePath);
  // Otros adjuntos (PDF, audio...) y notas inexistentes: enlace
  if (!path || !/\.md$/i.test(path)) return `<p>${link}</p>\n`;
  if ((stack.includes(path) && !heading) || stack.length > MAX_EMBED_DEPTH) return `<p>${link}</p>\n`;

  const title = `<div class="internal-embed-title">${link}</div>`;
  const content = getEmbedContent(path);
  let html: string;
  if (content === undefined) {
    html = `<div class="internal-embed-status">${md.utils.escapeHtml(t('common.loading'))}</div>`;
  } else if (content === null) {
    html = `<div class="internal-embed-status">${md.utils.escapeHtml(t('embed.loadError'))}</div>`;
  } else {
    const section = embedSection(parseNote(content).body, heading);
    html =
      section === null
        ? `<div class="internal-embed-status">${md.utils.escapeHtml(t('embed.headingNotFound', { heading }))}</div>`
        : md.render(section, { notePath: path, embedStack: [...stack, path] });
  }
  return (
    `<div class="internal-embed">${title}` +
    `<div class="internal-embed-content" data-embed-path="${md.utils.escapeHtml(path)}">${html}</div></div>\n`
  );
};

// Imágenes: rutas del vault resueltas desde la nota y tamaño "alt|300"
md.renderer.rules.image = (tokens, idx, _options, env) => {
  const token = tokens[idx];
  const { text, width, height } = parseSize(token.content);
  const src = attachmentUrl(String(token.attrGet('src') ?? ''), String(env?.notePath ?? ''));
  const title = token.attrGet('title');
  return (
    `<img src="${md.utils.escapeHtml(src)}" alt="${md.utils.escapeHtml(text)}"` +
    (title ? ` title="${md.utils.escapeHtml(String(title))}"` : '') +
    (width ? ` width="${width}"` : '') +
    (height ? ` height="${height}"` : '') +
    ' loading="lazy">'
  );
};

// Callouts al estilo Obsidian: > [!tipo] Título
const svg = (body: string) =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const CALLOUT_ICONS: Record<string, string> = {
  note: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  abstract: svg('<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  todo: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  tip: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  success: svg('<polyline points="20 6 9 17 4 12"/>'),
  question: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  warning: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  failure: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  danger: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  bug: svg('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>'),
  example: svg('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>'),
  quote: svg('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>'),
};

const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract', tldr: 'abstract',
  hint: 'tip', important: 'tip',
  check: 'success', done: 'success',
  help: 'question', faq: 'question',
  caution: 'warning', attention: 'warning',
  fail: 'failure', missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

md.core.ruler.before('inline', 'callout', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'blockquote_open') continue;
    const inline = tokens[i + 2];
    if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
    const m = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)/.exec(inline.content);
    if (!m) continue;

    const raw = m[1].toLowerCase();
    const type = CALLOUT_ALIASES[raw] ?? raw;
    const title = m[3].trim() || raw.charAt(0).toUpperCase() + raw.slice(1);
    tokens[i].meta = { callout: { type, title } };

    // Cierre correspondiente (respetando blockquotes anidados)
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
  const callout = (tokens[idx].meta as { callout?: { type: string; title: string } } | null)?.callout;
  if (!callout) return self.renderToken(tokens, idx, options);
  const icon = CALLOUT_ICONS[callout.type] ?? CALLOUT_ICONS.note;
  return (
    `<div class="callout" data-callout="${md.utils.escapeHtml(callout.type)}">` +
    `<div class="callout-title"><span class="callout-icon">${icon}</span>` +
    `<span class="callout-title-inner">${md.renderInline(callout.title, env)}</span></div>` +
    '<div class="callout-content">'
  );
};

md.renderer.rules.blockquote_close = (tokens, idx, options, _env, self) =>
  tokens[idx].meta?.callout ? '</div></div>\n' : self.renderToken(tokens, idx, options);

const COPY_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

// Diagramas ```mermaid: si ya se dibujaron se pintan desde la caché; si no, se muestra
// el código fuente hasta que renderMermaidDiagrams los sustituye
function renderMermaidFence(source: string) {
  const svg = cachedDiagram(source, currentDiagramTheme());
  const attr = `data-source="${md.utils.escapeHtml(source)}"`;
  if (svg) return `<div class="mermaid-diagram is-rendered" ${attr}>${svg}</div>\n`;
  return `<div class="mermaid-diagram" ${attr}><pre><code>${md.utils.escapeHtml(source)}</code></pre></div>\n`;
}

// Code blocks: language label + copy button
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const lang = tokens[idx].info.trim().split(/\s+/)[0];
  if (lang.toLowerCase() === 'mermaid') return renderMermaidFence(tokens[idx].content);
  const label = lang ? `<span class="code-block-lang">${md.utils.escapeHtml(lang)}</span>` : '<span></span>';
  const copy = md.utils.escapeHtml(t('common.copy'));
  return (
    '<div class="code-block">' +
    `<div class="code-block-header">${label}` +
    `<button type="button" class="code-block-copy" title="${copy}" aria-label="${copy}">${COPY_ICON}</button>` +
    '</div>' +
    defaultFence(tokens, idx, options, env, self) +
    '</div>'
  );
};

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-secure contexts (http)
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// Clic en [[enlace]]: abre la nota (Ctrl/Cmd o botón central → pestaña nueva);
// [[#encabezado]] o un enlace a la propia nota solo desplaza la vista
function openWikilink(e: MouseEvent<HTMLDivElement>, notePath: string) {
  const link = (e.target as HTMLElement).closest<HTMLElement>('a.wikilink');
  if (!link) return false;
  e.preventDefault();
  const inner = link.dataset.href ?? '';
  // Los enlaces de una nota incrustada se resuelven desde esa nota
  notePath = link.closest<HTMLElement>('[data-embed-path]')?.dataset.embedPath ?? notePath;
  const { target, heading } = parseWikilink(inner);
  if (resolveWikilink(target, notePath) === notePath) {
    if (heading) scrollToHeading(e.currentTarget, heading);
  } else {
    followWikilink(inner, notePath, e.ctrlKey || e.metaKey || e.button === 1);
  }
  return true;
}

function handleContentClick(
  e: MouseEvent<HTMLDivElement>,
  notePath: string,
  onToggleTask: (line: number, checked: boolean) => void
) {
  if (openWikilink(e, notePath)) return;
  const box = (e.target as HTMLElement).closest<HTMLInputElement>('input.task-list-item-checkbox');
  if (box) {
    if (box.dataset.line === undefined) e.preventDefault();
    else onToggleTask(Number(box.dataset.line), box.checked);
    return;
  }
  const tag = (e.target as HTMLElement).closest<HTMLElement>('a.tag');
  if (tag) {
    e.preventDefault();
    useStore.getState().searchTag(tag.dataset.tag ?? '');
    return;
  }
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-block-copy');
  if (!btn) return;
  const code = btn.closest('.code-block')?.querySelector('pre code');
  if (!code) return;
  copyText(code.textContent ?? '').then(() => {
    btn.innerHTML = CHECK_ICON;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = COPY_ICON;
      btn.classList.remove('copied');
    }, 1500);
  });
}

interface Props {
  content: string;
  filePath?: string;
  onContentChange?: (content: string) => void;
}

export default function ReadingView({ content, filePath, onContentChange }: Props) {
  const { data: frontmatter, body: markdownContent, head } = useMemo(() => parseNote(content), [content]);
  const searchTag = useStore((s) => s.searchTag);
  const showInlineTitle = useStore((s) => s.showInlineTitle);
  // Las rutas de las imágenes se resuelven contra el árbol del vault
  // (y también los [[enlaces]], para marcar los que apuntan a notas inexistentes)
  const tree = useStore((s) => s.tree);
  // Los textos de la interfaz que van dentro del HTML (Copiar, Cargando…) siguen el idioma
  const lang = useI18n((s) => s.lang);
  // Los diagramas Mermaid se dibujan con los colores del tema
  const theme = useStore((s) => s.theme);
  const contentRef = useRef<HTMLDivElement>(null);
  const notePath = filePath ?? '';

  // Las notas incrustadas se cargan aparte: al llegar (o cambiar) se vuelve a pintar
  const embedsVersion = useSyncExternalStore(subscribeEmbeds, getEmbedsVersion);
  // Al abrir una nota se releen sus incrustaciones, por si han cambiado mientras tanto
  useEffect(refreshEmbeds, [notePath]);

  const html = useMemo(
    () => md.render(markdownContent, { notePath }),
    [markdownContent, notePath, tree, embedsVersion, lang, theme]
  );

  // También al volver a la pestaña y cuando el servidor reescribe enlaces
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && refreshEmbeds();
    window.addEventListener('focus', refresh);
    window.addEventListener(NOTES_CHANGED, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(NOTES_CHANGED, refresh);
    };
  }, []);

  // Un resultado de búsqueda de la nota ya abierta no cambia `html`: hay que reaccionar al aviso
  const [scrollRequest, setScrollRequest] = useState(0);
  useEffect(() => subscribePendingScroll(() => setScrollRequest((n) => n + 1)), []);

  // Llegada desde [[nota#encabezado]] o desde resultados de búsqueda
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const heading = takePendingHeading(notePath);
    if (heading) return scrollToHeading(el, heading);
    const line = takePendingLine(notePath);
    // La búsqueda cuenta líneas del fichero completo (1-indexed); data-line, del cuerpo (0-indexed)
    if (line) scrollToLine(el, line - 1 - (head?.match(/\n/g)?.length ?? 0));
  }, [html, notePath, head, scrollRequest]);

  useEffect(() => {
    if (!contentRef.current) return;
    highlightCodeBlocks(contentRef.current);
    renderMermaidDiagrams(contentRef.current, t('mermaid.error'));
  }, [html]);

  // Clic en una casilla: se cambia en el texto de la nota y se guarda
  const toggleTaskAt = (line: number, checked: boolean) => {
    const body = toggleTask(markdownContent, line, checked);
    if (body === null || !filePath) return;
    const next = head + body;
    // Un autoguardado programado llevaría el texto anterior: pisaría este cambio al dispararse
    cancelPendingSave(filePath);
    onContentChange?.(next);
    saveNote(filePath, next);
  };

  return (
    <div className="reading-view">
      <div className="reading-view-inner">
        {showInlineTitle && filePath && <InlineTitle filePath={filePath} />}

        <Properties data={frontmatter} onTagClick={searchTag} />

        <div
          ref={contentRef}
          className="reading-view-content"
          onClick={(e) => handleContentClick(e, notePath, toggleTaskAt)}
          onAuxClick={(e) => e.button === 1 && openWikilink(e, notePath)}
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
