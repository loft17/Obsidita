import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import {
  IconUndo,
  IconRedo,
  IconEraser,
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconHighlight,
  IconQuote,
  IconCode,
  IconCodeBlock,
  IconListBullet,
  IconListOrdered,
  IconCheckSquare,
  IconLink,
  IconBrackets,
  IconTable,
  IconImage,
  IconChevronDown,
  IconSparkles,
} from './Icons';
import { t as translate, useT } from '../i18n';
import { pickImages } from '../imageUpload';
import { isMobile } from '../mobile';
import { openAiBar, useAiEnabled } from '../ai';

// Instantánea del editor sobre la que trabajan las acciones de formato
interface TA {
  view: EditorView;
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

function snapshot(view: EditorView): TA {
  const { from, to } = view.state.selection.main;
  return { view, value: view.state.doc.toString(), selectionStart: from, selectionEnd: to };
}

function replaceRange(ta: TA, start: number, end: number, text: string, selStart: number, selEnd: number) {
  ta.view.dispatch({
    changes: { from: start, to: end, insert: text },
    selection: { anchor: selStart, head: selEnd },
    scrollIntoView: true,
    userEvent: 'input',
  });
  ta.view.focus();
}

const runLength = (s: string, ch: string, from: number, step: 1 | -1) => {
  let n = 0;
  for (let i = from; i >= 0 && i < s.length && s[i] === ch; i += step) n++;
  return n;
};

// Añade o quita marcadores alrededor de la selección (**negrita**, *cursiva*, ==resaltado==...)
function toggleInline(ta: TA, marker: string, placeholder: string) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const ch = marker[0];
  const left = runLength(v, ch, s - 1, -1);
  const right = runLength(v, ch, e, 1);
  // Con '*' hay que distinguir cursiva de negrita: ***x*** tiene ambas
  const active =
    marker.length === 1 ? left % 2 === 1 && right % 2 === 1 : left >= marker.length && right >= marker.length;
  const n = marker.length;
  if (active) {
    replaceRange(ta, s - n, e + n, v.slice(s, e), s - n, e - n);
    return;
  }
  const text = v.slice(s, e) || placeholder;
  replaceRange(ta, s, e, marker + text + marker, s + n, s + n + text.length);
}

function lineBounds(v: string, s: number, e: number) {
  const start = v.lastIndexOf('\n', s - 1) + 1;
  // Si la selección acaba justo al inicio de una línea, esa línea no cuenta
  const last = e > s && v[e - 1] === '\n' ? e - 1 : e;
  const nl = v.indexOf('\n', last);
  return [start, nl < 0 ? v.length : nl] as const;
}

// Aplica una transformación a cada línea tocada por la selección
function transformLines(ta: TA, fn: (lines: string[]) => string[]) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const [start, end] = lineBounds(v, s, e);
  const text = fn(v.slice(start, end).split('\n')).join('\n');
  if (s === e) replaceRange(ta, start, end, text, start + text.length, start + text.length);
  else replaceRange(ta, start, end, text, start, start + text.length);
}

const HEADING = /^#{1,6}\s+/;
const QUOTE = /^>\s?/;
const LIST = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;

function setHeading(ta: TA, level: number) {
  const prefix = '#'.repeat(level) + ' ';
  transformLines(ta, (lines) => {
    const all = lines.every((l) => l.startsWith(prefix));
    return lines.map((l) => (all ? '' : prefix) + l.replace(HEADING, ''));
  });
}

function toggleQuote(ta: TA) {
  transformLines(ta, (lines) => {
    const all = lines.every((l) => QUOTE.test(l));
    return lines.map((l) => (all ? l.replace(QUOTE, '') : '> ' + l));
  });
}

type ListKind = 'bullet' | 'ordered' | 'task';
const LIST_TEST: Record<ListKind, RegExp> = {
  bullet: /^\s*[-*+] (?!\[[ xX]\] )/,
  ordered: /^\s*\d+[.)] /,
  task: /^\s*[-*+] \[[ xX]\] /,
};

function toggleList(ta: TA, kind: ListKind) {
  transformLines(ta, (lines) => {
    const all = lines.every((l) => LIST_TEST[kind].test(l));
    let n = 0;
    return lines.map((l) => {
      const m = l.match(LIST);
      const indent = m ? m[1] : '';
      const rest = m ? l.slice(m[0].length) : l;
      if (all) return indent + rest;
      if (!l.trim()) return l;
      const prefix = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${++n}. `;
      return indent + prefix + rest;
    });
  });
}

function toggleCode(ta: TA) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e);
  if (!sel.includes('\n')) {
    toggleInline(ta, '`', translate('toolbar.placeholder.code'));
    return;
  }
  const before = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
  const text = `${before}\`\`\`\n${sel.replace(/\n$/, '')}\n\`\`\`\n`;
  replaceRange(ta, s, e, text, s + before.length + 3, s + before.length + 3);
}

// Selecciona el nombre del lenguaje para poder sobrescribirlo (bash, java...)
function insertCodeBlock(ta: TA) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e).replace(/\n$/, '');
  const before = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
  const lang = translate('toolbar.placeholder.code');
  const text = `${before}\`\`\`${lang}\n${sel}\n\`\`\`\n`;
  const at = s + before.length + 3;
  replaceRange(ta, s, e, text, at, at + lang.length);
}

function insertLink(ta: TA) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e);
  if (/^https?:\/\/\S+$/.test(sel)) {
    replaceRange(ta, s, e, `[](${sel})`, s + 1, s + 1);
    return;
  }
  const label = sel || translate('toolbar.placeholder.text');
  const at = s + label.length + 3;
  replaceRange(ta, s, e, `[${label}](url)`, at, at + 3);
}

function insertWikilink(ta: TA) {
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const sel = v.slice(s, e);
  replaceRange(ta, s, e, `[[${sel}]]`, s + 2, s + 2 + sel.length);
}

// Inserta una tabla de 2 columnas en líneas propias, separada por líneas en blanco
function insertTable(ta: TA) {
  const { selectionEnd: e, value: v } = ta;
  const at = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e);
  const before = at === 0 ? '' : v[at - 1] === '\n' ? '\n' : '\n\n';
  const [c1, c2] = [1, 2].map((n) => translate('toolbar.column', { n }));
  const w = Math.max(c1.length, c2.length);
  const cell = (s: string) => ` ${s.padEnd(w)} `;
  const table = `|${cell(c1)}|${cell(c2)}|\n|${cell('-'.repeat(w))}|${cell('-'.repeat(w))}|\n|${cell('')}|${cell('')}|`;
  const text = before + table + '\n\n';
  replaceRange(ta, at, at, text, at + text.length, at + text.length);
}

// Quita marcadores de formato en línea y prefijos de bloque de las líneas seleccionadas
function clearFormat(ta: TA) {
  transformLines(ta, (lines) =>
    lines.map((l) => {
      const m = l.match(LIST);
      const indent = m ? m[1] : '';
      return (
        indent +
        (m ? l.slice(m[0].length) : l)
          .replace(HEADING, '')
          .replace(QUOTE, '')
          .replace(/<\/?u>/g, '')
          .replace(/(\*\*|~~|==|\*|`)/g, '')
      );
    }),
  );
}

function historyCommand(ta: TA, cmd: typeof undo) {
  cmd(ta.view);
  ta.view.focus();
}

// Evita que los botones roben el foco (y la selección) al editor
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="toolbar-btn"
      title={title}
      aria-label={title}
      onMouseDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface MenuItem {
  label: ReactNode;
  title: string;
  run: (ta: TA) => void;
}

// Desplegable con el patrón de menú de ARIA: con el teclado se abre con Intro/Espacio/↓/↑, se recorre
// con las flechas e Inicio/Fin, Escape lo cierra devolviendo el foco al botón y Tab lo cierra sin más.
// Con el ratón el foco se queda en el editor, como en el resto de botones
function ToolMenu({
  title,
  icon,
  items,
  onRun,
}: {
  title: string;
  icon: ReactNode;
  items: MenuItem[];
  // Aplica la acción del elemento elegido sobre el editor
  onRun: (fn: (ta: TA) => void) => void;
}) {
  const [open, setOpen] = useState(false);
  // Elemento que recibe el foco al abrir con el teclado (null: abierto con el ratón, el foco no se mueve)
  const [focusOnOpen, setFocusOnOpen] = useState<'first' | 'last' | null>(null);
  // En el móvil la barra se desliza en horizontal y recortaría el desplegable: se coloca fijo bajo el botón
  const [fixedAt, setFixedAt] = useState<CSSProperties>();
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape también cierra el menú abierto con el ratón, con el foco aún en el editor
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      const inMenu = menuRef.current?.contains(document.activeElement);
      setOpen(false);
      if (inMenu) buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusOnOpen) return;
    const list = menuItems();
    (focusOnOpen === 'first' ? list[0] : list[list.length - 1])?.focus();
  }, [open, focusOnOpen]);

  const show = (focus: 'first' | 'last' | null) => {
    if (isMobile() && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setFixedAt({
        position: 'fixed',
        top: r.bottom + 4,
        left: Math.max(4, Math.min(r.left, window.innerWidth - 200)),
      });
    } else setFixedAt(undefined);
    setFocusOnOpen(focus);
    setOpen(true);
  };

  const onButtonKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    show(e.key === 'ArrowDown' ? 'first' : 'last');
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const list = menuItems();
    const i = list.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
        next = (i + 1) % list.length;
        break;
      case 'ArrowUp':
        next = (i - 1 + list.length) % list.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = list.length - 1;
        break;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div className="toolbar-menu" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={'toolbar-btn' + (open ? ' active' : '')}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onMouseDown={keepFocus}
        onKeyDown={onButtonKeyDown}
        onClick={(e) => {
          // detail === 0: activado con Intro/Espacio, no con el ratón
          if (open) setOpen(false);
          else show(e.detail === 0 ? 'first' : null);
        }}
      >
        {icon}
        <IconChevronDown size={10} className="toolbar-caret" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="toolbar-dropdown"
          role="menu"
          aria-label={title}
          style={fixedAt}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.title}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="toolbar-dropdown-item"
              onMouseDown={keepFocus}
              onClick={() => {
                setOpen(false);
                onRun(item.run);
              }}
            >
              {item.label}
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EditorToolbar({
  viewRef,
  filePath,
}: {
  viewRef: RefObject<EditorView | null>;
  filePath: string;
}) {
  // Solo se lee la ref al pulsar: los manejadores se crean en el render pero no la tocan
  const apply = (fn: (ta: TA) => void) => {
    const view = viewRef.current;
    if (view) fn(snapshot(view));
  };
  const heading = (level: number) => <span className="toolbar-heading">H{level}</span>;
  const t = useT();
  const aiEnabled = useAiEnabled();

  return (
    <div className="editor-toolbar" role="toolbar" aria-label={t('toolbar.format')}>
      <ToolButton title={t('toolbar.undo')} onClick={() => apply((ta) => historyCommand(ta, undo))}>
        <IconUndo />
      </ToolButton>
      <ToolButton title={t('toolbar.redo')} onClick={() => apply((ta) => historyCommand(ta, redo))}>
        <IconRedo />
      </ToolButton>
      <ToolButton title={t('toolbar.clearFormat')} onClick={() => apply(clearFormat)}>
        <IconEraser />
      </ToolButton>
      <span className="toolbar-sep" />
      {[1, 2, 3].map((level) => (
        <ToolButton
          key={level}
          title={t('toolbar.heading', { n: level })}
          onClick={() => apply((ta) => setHeading(ta, level))}
        >
          {heading(level)}
        </ToolButton>
      ))}
      <ToolMenu
        title={t('toolbar.moreHeadings')}
        icon={<span className="toolbar-heading">Hn</span>}
        items={[4, 5, 6].map((level) => ({
          label: heading(level),
          title: t('toolbar.heading', { n: level }),
          run: (ta) => setHeading(ta, level),
        }))}
        onRun={apply}
      />
      <span className="toolbar-sep" />
      <ToolButton
        title={t('toolbar.bold')}
        onClick={() => apply((ta) => toggleInline(ta, '**', t('toolbar.placeholder.bold')))}
      >
        <IconBold />
      </ToolButton>
      <ToolButton
        title={t('toolbar.italic')}
        onClick={() => apply((ta) => toggleInline(ta, '*', t('toolbar.placeholder.italic')))}
      >
        <IconItalic />
      </ToolButton>
      <ToolButton
        title={t('toolbar.strike')}
        onClick={() => apply((ta) => toggleInline(ta, '~~', t('toolbar.placeholder.strike')))}
      >
        <IconStrikethrough />
      </ToolButton>
      <ToolButton
        title={t('toolbar.highlight')}
        onClick={() => apply((ta) => toggleInline(ta, '==', t('toolbar.placeholder.highlight')))}
      >
        <IconHighlight />
      </ToolButton>
      <ToolButton title={t('toolbar.code')} onClick={() => apply(toggleCode)}>
        <IconCode />
      </ToolButton>
      <ToolButton title={t('toolbar.codeblock')} onClick={() => apply(insertCodeBlock)}>
        <IconCodeBlock />
      </ToolButton>
      <span className="toolbar-sep" />
      <ToolButton title={t('toolbar.quote')} onClick={() => apply(toggleQuote)}>
        <IconQuote />
      </ToolButton>
      <ToolMenu
        title={t('toolbar.lists')}
        icon={<IconListBullet />}
        items={[
          {
            label: <IconListBullet size={16} />,
            title: t('toolbar.bulletList'),
            run: (ta) => toggleList(ta, 'bullet'),
          },
          {
            label: <IconListOrdered size={16} />,
            title: t('toolbar.orderedList'),
            run: (ta) => toggleList(ta, 'ordered'),
          },
          { label: <IconCheckSquare size={16} />, title: t('toolbar.taskList'), run: (ta) => toggleList(ta, 'task') },
        ]}
        onRun={apply}
      />
      <span className="toolbar-sep" />
      <ToolButton title={t('toolbar.link')} onClick={() => apply(insertLink)}>
        <IconLink />
      </ToolButton>
      <ToolButton title={`${t('toolbar.wikilink')} [[ ]]`} onClick={() => apply(insertWikilink)}>
        <IconBrackets />
      </ToolButton>
      <ToolButton title={t('toolbar.table')} onClick={() => apply(insertTable)}>
        <IconTable />
      </ToolButton>
      <ToolButton title={t('toolbar.image')} onClick={() => viewRef.current && pickImages(viewRef.current, filePath)}>
        <IconImage />
      </ToolButton>
      {aiEnabled && (
        <>
          <span className="toolbar-sep" />
          <ToolButton title={`${t('ai.edit')} (Ctrl+K)`} onClick={openAiBar}>
            <IconSparkles />
          </ToolButton>
        </>
      )}
    </div>
  );
}
