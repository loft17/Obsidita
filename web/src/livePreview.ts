// Vista previa en vivo al estilo Obsidian para CodeMirror 6: el Markdown se ve
// con formato y los marcadores (#, **, >, [](url)...) solo aparecen en la línea
// donde está el cursor.
import { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { Facet, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Tag, tags } from '@lezer/highlight';
import type { MarkdownConfig } from '@lezer/markdown';
import { liveTables } from './liveTables';
import { attachmentUrl, isImage, parseSize } from './attachments';
import { followWikilink, isResolved } from './wikilinks';

// ==resaltado== no forma parte de GFM: se define igual que el tachado de @lezer/markdown
const highlightTag = Tag.define();
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };

export const HighlightSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: { 'Highlight/...': highlightTag } },
    { name: 'HighlightMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx, next, pos) {
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        return cx.addDelimiter(HighlightDelim, pos, pos + 2, !/\s|^$/.test(after), !/\s|^$/.test(before));
      },
      after: 'Emphasis',
    },
  ],
};

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--text-normal)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: highlightTag, backgroundColor: 'rgba(255, 208, 0, 0.35)', borderRadius: '2px' },
  { tag: [tags.link, tags.url], color: 'var(--interactive-accent)' },
  { tag: tags.monospace, fontFamily: 'var(--font-monospace)', fontSize: '0.92em' },
  { tag: tags.quote, color: 'var(--text-muted)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.labelName], color: 'var(--text-faint)' },
  { tag: tags.list, color: 'var(--text-faint)' },
  // Código dentro de los bloques ```lang (mismos colores que la vista de lectura)
  { tag: [tags.comment, tags.docComment], color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: [tags.keyword, tags.bool, tags.null, tags.atom, tags.self], color: 'var(--text-accent)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.inserted], color: 'var(--color-green)' },
  { tag: [tags.number, tags.standard(tags.variableName)], color: 'var(--color-orange)' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.definition(tags.function(tags.variableName)), tags.className],
    color: 'var(--color-blue)',
  },
  { tag: [tags.typeName, tags.propertyName, tags.attributeName, tags.tagName, tags.deleted], color: 'var(--color-red)' },
  { tag: [tags.meta, tags.punctuation, tags.angleBracket], color: 'var(--text-muted)' },
]);

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-lp-bullet';
    span.textContent = '•';
    return span;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-checkbox';
    box.checked = this.checked;
    box.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(box);
      view.dispatch({ changes: { from: pos, to: pos + 3, insert: this.checked ? '[ ]' : '[x]' } });
    });
    return box;
  }
  ignoreEvent() {
    return true;
  }
}

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-lp-hr';
    return hr;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly width?: number, readonly height?: number) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.width === this.width && other.height === this.height;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-image';
    img.src = this.src;
    img.alt = this.alt;
    if (this.width) img.width = this.width;
    if (this.height) img.height = this.height;
    return img;
  }
}

// Ruta de la nota abierta en el editor, para resolver las imágenes relativas
export const notePath = Facet.define<() => string, () => string>({
  combine: (values) => values[0] ?? (() => ''),
});

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const linkText = Decoration.mark({ class: 'cm-lp-link' });
const wikilinkMark = (inner: string, resolved: boolean) =>
  Decoration.mark({
    class: resolved ? 'cm-lp-wikilink' : 'cm-lp-wikilink is-unresolved',
    attributes: { 'data-href': inner },
  });
const line = (cls: string) => Decoration.line({ class: cls });

function activeLines(state: EditorState) {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const last = state.doc.lineAt(r.to).number;
    for (let n = state.doc.lineAt(r.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const { doc } = state;
  const active = activeLines(state);
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const decos: Range<Decoration>[] = [];
  const add = (deco: Decoration, from: number, to: number) => {
    if (to > from) decos.push(deco.range(from, to));
  };
  // Oculta el marcador y el espacio que lo sigue (#, >, -)
  const hideWithSpace = (from: number, to: number) => add(hide, from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
  const eachLine = (from: number, to: number, cls: string) => {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) decos.push(line(cls).range(doc.line(n).from));
  };
  // La imagen sustituye a su sintaxis; en la línea del cursor se ve debajo de ella
  const currentNote = state.facet(notePath)();
  const image = (from: number, to: number, src: string, altText: string) => {
    const { text, width, height } = parseSize(altText);
    const widget = new ImageWidget(attachmentUrl(src, currentNote), text, width, height);
    if (isActive(from)) decos.push(Decoration.widget({ widget, side: 1 }).range(to));
    else add(Decoration.replace({ widget }), from, to);
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const heading = /^ATXHeading(\d)$/.exec(node.name);
        if (heading) {
          decos.push(line(`cm-lp-h${heading[1]}`).range(doc.lineAt(node.from).from));
          return;
        }
        switch (node.name) {
          case 'Blockquote':
            eachLine(node.from, node.to, 'cm-lp-quote');
            return;
          case 'FencedCode':
          case 'CodeBlock':
            // El aspecto del bloque lo pone codeBlocks; su contenido se deja tal cual
            return false;
          case 'Image': {
            // ![alt](url "título")
            const marks = node.node.getChildren('LinkMark');
            const url = node.node.getChild('URL');
            if (marks.length < 2 || !url) return false;
            let src = doc.sliceString(url.from, url.to);
            if (src.startsWith('<') && src.endsWith('>')) src = src.slice(1, -1);
            image(node.from, node.to, src, doc.sliceString(marks[0].to, marks[1].from));
            return false;
          }
        }
        if (isActive(node.from)) return;
        switch (node.name) {
          case 'HeaderMark':
            if (node.node.parent?.name.startsWith('ATXHeading')) hideWithSpace(node.from, node.to);
            break;
          case 'QuoteMark':
            hideWithSpace(node.from, node.to);
            break;
          case 'EmphasisMark':
          case 'StrikethroughMark':
          case 'HighlightMark':
            add(hide, node.from, node.to);
            break;
          case 'CodeMark':
            if (node.node.parent?.name === 'InlineCode') add(hide, node.from, node.to);
            break;
          case 'ListMark': {
            const item = node.node.parent;
            if (item?.getChild('Task')) hideWithSpace(node.from, node.to);
            else if (item?.parent?.name === 'BulletList') add(bullet, node.from, node.to);
            break;
          }
          case 'TaskMarker': {
            const checked = /x/i.test(doc.sliceString(node.from, node.to));
            add(Decoration.replace({ widget: new CheckboxWidget(checked) }), node.from, node.to);
            break;
          }
          case 'HorizontalRule':
            add(rule, node.from, node.to);
            break;
          case 'Link': {
            // [texto](url): se muestra solo "texto"
            const marks = node.node.getChildren('LinkMark');
            if (marks.length < 2 || !node.node.getChild('URL')) break;
            add(hide, node.from, marks[0].to);
            add(linkText, marks[0].to, marks[1].from);
            add(hide, marks[1].from, node.to);
            return false;
          }
        }
      },
    });

    // [[enlaces internos]]
    const text = doc.sliceString(from, to);
    for (const m of text.matchAll(/!?\[\[([^\]\n]+)\]\]/g)) {
      const start = from + m.index!;
      const end = start + m[0].length;
      if (/Code/.test(syntaxTree(state).resolveInner(start, 1).name)) continue;
      // ![[imagen.png|300]]
      const [target] = m[1].split('|');
      if (m[0].startsWith('!') && isImage(target.split('#')[0].trim())) {
        image(start, end, target.trim(), m[1].includes('|') ? m[1] : target.trim().split('/').pop()!);
        continue;
      }
      const open = start + m[0].indexOf('[[') + 2;
      const mark = wikilinkMark(m[1], isResolved(m[1], currentNote));
      if (isActive(start)) {
        add(mark, open, end - 2);
      } else {
        // [[nota|alias]]: fuera de la línea del cursor solo se ve el alias
        const bar = m[1].indexOf('|');
        const labelFrom = bar < 0 ? open : open + bar + 1;
        add(hide, start, labelFrom);
        add(mark, labelFrom, end - 2);
        add(hide, end - 2, end);
      }
    }
  }
  return Decoration.set(decos, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

const indentGuide = Decoration.mark({ class: 'cm-lp-indent' });

// Fondo y fuente monoespaciada de los bloques ```, y guías verticales de sangría (como en
// Obsidian) en las líneas sangradas con Tab o 4 espacios, en los dos modos del editor
function buildCodeBlocks(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const decos: Range<Decoration>[] = [];
  const fenced = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode' && node.name !== 'CodeBlock') return;
        const first = doc.lineAt(node.from).number;
        const last = doc.lineAt(node.to).number;
        if (node.name === 'CodeBlock') {
          // Markdown trata el texto sangrado como código; aquí se ve como texto normal
          for (let n = first; n <= last; n++) decos.push(line('cm-lp-indented-text').range(doc.line(n).from));
          return false;
        }
        // Las vallas ```lang se ven con el color del texto, no atenuadas
        const fences = new Set(node.node.getChildren('CodeMark').map((m) => doc.lineAt(m.from).number));
        for (let n = first; n <= last; n++) {
          fenced.add(n);
          // La primera y la última línea redondean las esquinas del bloque, como en la vista de lectura
          let cls = 'cm-lp-codeblock';
          if (n === first) cls += ' cm-lp-codeblock-first';
          if (n === last && last !== first) cls += ' cm-lp-codeblock-last';
          if (fences.has(n)) cls += ' cm-lp-codefence';
          decos.push(line(cls).range(doc.line(n).from));
        }
        return false;
      },
    });

    for (let n = doc.lineAt(from).number; n <= doc.lineAt(to).number; n++) {
      if (fenced.has(n)) continue;
      const { from: start, text } = doc.line(n);
      const units = text.match(/^(?: {0,3}\t| {4})*/)![0].match(/ {0,3}\t| {4}/g);
      if (!units) continue;
      decos.push(line('cm-lp-indented').range(start));
      let pos = start;
      for (const unit of units) {
        decos.push(indentGuide.range(pos, pos + unit.length));
        pos += unit.length;
      }
    }
  }
  return Decoration.set(decos, true);
}

const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCodeBlocks(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = buildCodeBlocks(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

// Clic en un [[enlace]] ya renderizado (fuera de la línea del cursor) o Ctrl/Cmd+clic
// en cualquiera: abre la nota. Ctrl/Cmd o botón central → pestaña nueva.
const wikilinkClicks = EditorView.domEventHandlers({
  mousedown(e, view) {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.cm-lp-wikilink');
    if (!link || e.button > 1 || e.shiftKey || e.altKey) return false;
    const modifier = e.ctrlKey || e.metaKey;
    const pos = view.posAtDOM(link);
    if (!modifier && e.button === 0 && activeLines(view.state).has(view.state.doc.lineAt(pos).number)) return false;
    e.preventDefault();
    followWikilink(link.dataset.href ?? '', view.state.facet(notePath)(), modifier || e.button === 1);
    return true;
  },
});

export const livePreview = [syntaxHighlighting(markdownHighlight), codeBlocks, livePreviewPlugin, liveTables, wikilinkClicks];

// Modo fuente: el markdown se ve tal cual, solo con el coloreado de sintaxis y los bloques de código
