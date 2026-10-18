// Autocompletado de enlaces internos: al escribir [[ (o ![[) se sugieren las notas del vault
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { useStore } from './store';
import { fileName, parentFolder } from './paths';

// Texto escrito tras [[ hasta el cursor, sin cerrar ni pasar a #encabezado o |alias
const OPEN_LINK = /(!?)\[\[([^\[\]|#\n]*)$/;

const isNote = (path: string) => /\.md$/i.test(path);
const stripMd = (path: string) => path.replace(/\.md$/i, '');

// Como Obsidian: el nombre si es único en el vault, la ruta completa si hay varios iguales
function linkOptions(includeAttachments: boolean): Completion[] {
  const files = useStore.getState().tree.filter(
    (item) => item.type === 'file' && (includeAttachments || isNote(item.path))
  );
  const nameCount = new Map<string, number>();
  for (const f of files) {
    const name = fileName(f.path).toLowerCase();
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  return files.map((f) => {
    const name = fileName(f.path);
    const unique = nameCount.get(name.toLowerCase()) === 1;
    const link = isNote(f.path) ? stripMd(unique ? name : f.path) : unique ? name : f.path;
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
    validFor: /^[^\[\]|#\n]*$/,
  };
}

export const wikilinkCompletion = autocompletion({
  override: [wikilinkSource],
  icons: false,
});
