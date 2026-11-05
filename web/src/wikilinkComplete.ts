// Autocompletado de enlaces internos: al escribir [[ (o ![[) se sugieren las notas del vault
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { useStore } from './store';
import { fileName, parentFolder } from './paths';
import { isImage } from './attachments';

// Texto escrito tras [[ hasta el cursor, sin cerrar ni pasar a #encabezado o |alias
const OPEN_LINK = /(!?)\[\[([^[\]|#\n]*)$/;

const isNote = (path: string) => /\.md$/i.test(path);
const stripMd = (path: string) => path.replace(/\.md$/i, '');

// Como Obsidian: el nombre si es único en el vault, la ruta completa si hay varios iguales
// (las notas, sin .md)
const linkTarget = (path: string, unique: boolean) => {
  const target = unique ? fileName(path) : path;
  return isNote(path) ? stripMd(target) : target;
};

const countNames = (paths: string[]) => {
  const nameCount = new Map<string, number>();
  for (const path of paths) {
    const name = fileName(path).toLowerCase();
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  return nameCount;
};

// Enlace a `path` listo para pegar en una nota: [[nota]], o ![[imagen.png]] para incrustar una imagen
export function wikilinkTo(path: string) {
  const files = useStore.getState().tree.filter((item) => item.type === 'file');
  const unique = countNames(files.map((f) => f.path)).get(fileName(path).toLowerCase()) === 1;
  return `${isImage(path) ? '!' : ''}[[${linkTarget(path, unique)}]]`;
}

// Las opciones se calculan una vez por árbol: el autocompletado se dispara en cada pulsación y el
// árbol solo se sustituye (setTree), nunca se modifica, así que la referencia basta para la caché
let optionsTree: unknown = null;
let optionsCache: { notes?: Completion[]; all?: Completion[] } = {};

function linkOptions(includeAttachments: boolean): Completion[] {
  const tree = useStore.getState().tree;
  if (tree !== optionsTree) {
    optionsTree = tree;
    optionsCache = {};
  }
  const key = includeAttachments ? 'all' : 'notes';
  return (optionsCache[key] ??= buildLinkOptions(tree, includeAttachments));
}

function buildLinkOptions(tree: ReturnType<typeof useStore.getState>['tree'], includeAttachments: boolean): Completion[] {
  const files = tree.filter((item) => item.type === 'file' && (includeAttachments || isNote(item.path)));
  const nameCount = countNames(files.map((f) => f.path));
  return files.map((f) => {
    const name = fileName(f.path);
    const link = linkTarget(f.path, nameCount.get(name.toLowerCase()) === 1);
    const folder = parentFolder(f.path);
    return {
      label: isNote(f.path) ? stripMd(name) : name,
      detail: folder,
      type: isNote(f.path) ? 'text' : 'variable',
      // Se escriben los ]] de cierre salvo que ya estén detrás del cursor
      apply: (view, _completion, from, to) => {
        const close = view.state.sliceDoc(to, to + 2) === ']]' ? '' : ']]';
        view.dispatch({
          changes: { from, to, insert: link + close },
          // El cursor queda detrás de los ]]
          selection: { anchor: from + link.length + 2 },
          userEvent: 'input.complete',
        });
      },
    };
  });
}

function wikilinkSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const match = OPEN_LINK.exec(line.text.slice(0, context.pos - line.from));
  if (!match) return null;
  return {
    from: context.pos - match[2].length,
    options: linkOptions(match[1] === '!'),
    validFor: /^[^[\]|#\n]*$/,
  };
}

export const wikilinkCompletion = autocompletion({
  override: [wikilinkSource],
  icons: false,
});
