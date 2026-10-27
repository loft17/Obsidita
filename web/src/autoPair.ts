// Autocierre como en un editor de código: paréntesis, corchetes, llaves y comillas (closeBrackets)
// y, opcionalmente, los símbolos de Markdown * _ ` (y = ~ solo al rodear una selección)
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

const PAIRED = new Set(['*', '_', '`']);
const WRAP_ONLY = new Set(['=', '~']);
const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock']);

const isWord = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
const isSpace = (ch: string) => ch === '' || /\s/.test(ch);

function inCodeAt(state: EditorState, pos: number, side: -1 | 1) {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  return false;
}
// Justo detrás de un `código` cerrado se está fuera: hace falta código a ambos lados
const inCode = (state: EditorState, pos: number) => inCodeAt(state, pos, -1) && inCodeAt(state, pos, 1);

function canPair(state: EditorState, pos: number, ch: string, before: string, after: string) {
  if (ch !== '`' && inCode(state, pos)) return false;
  // `snake_case`, `2*3`: dentro de una palabra no se cierra
  if (isWord(before)) return false;
  if (!isSpace(after) && after !== ch && !')]}.,;:!?'.includes(after)) return false;
  // `* ` al principio de línea es una lista, no cursiva
  const line = state.doc.lineAt(pos);
  if (ch === '*' && !line.text.slice(0, pos - line.from).trim()) return false;
  return true;
}

const markdownInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (view.composing || view.state.readOnly || view.state.selection.ranges.length > 1) return false;
  if (!PAIRED.has(text) && !WRAP_ONLY.has(text)) return false;
  const { state } = view;
  const before = state.sliceDoc(from - 1, from);
  const after = state.sliceDoc(to, to + 1);
  let spec: TransactionSpec;
  if (from < to) {
    if (text !== '`' && inCode(state, from)) return false;
    spec = {
      changes: [
        { from, insert: text },
        { from: to, insert: text },
      ],
      selection: EditorSelection.range(from + 1, to + 1),
    };
  } else if (!PAIRED.has(text)) {
    return false;
  } else if (after === text && before !== text && !isWord(state.sliceDoc(to + 1, to + 2))) {
    // Se escribe el cierre que ya está: se salta
    spec = { selection: { anchor: from + 1 } };
  } else if (canPair(state, from, text, before, after)) {
    // En `*|*` otro `*` da `**|**` (negrita); igual con `` y ```
    spec = { changes: { from, insert: text + text }, selection: { anchor: from + 1 } };
  } else {
    return false;
  }
  view.dispatch({ ...spec, scrollIntoView: true, userEvent: 'input.type' });
  return true;
});

// Retroceso entre un par vacío (`*|*`) borra los dos
const deleteMarkdownPair = (view: EditorView) => {
  const { state } = view;
  if (state.readOnly || state.selection.ranges.length > 1) return false;
  const { head, empty } = state.selection.main;
  if (!empty) return false;
  const before = state.sliceDoc(head - 1, head);
  if (!PAIRED.has(before) || state.sliceDoc(head, head + 1) !== before) return false;
  view.dispatch({ changes: { from: head - 1, to: head + 1 }, userEvent: 'delete.backward', scrollIntoView: true });
  return true;
};

export const autoPair = (brackets: boolean, markdownSymbols: boolean): Extension => [
  brackets ? [closeBrackets(), Prec.high(keymap.of(closeBracketsKeymap))] : [],
  markdownSymbols ? [markdownInput, Prec.high(keymap.of([{ key: 'Backspace', run: deleteMarkdownPair }]))] : [],
];
