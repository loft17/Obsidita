import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, isUnder } from '../store';
import { filesApi, ConflictError } from '../api';
import { parseNote, composeNote, type FrontmatterData } from '../frontmatter';
import Properties from './Properties';
import EditorToolbar from './EditorToolbar';
import InlineTitle from './InlineTitle';
import { Annotation, Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { indentUnit } from '@codemirror/language';
import { languages } from '../editorLanguages';
import { livePreview, HighlightSyntax, notePath } from '../livePreview';
import { imageUpload } from '../imageUpload';
import { wikilinkCompletion } from '../wikilinkComplete';
import { setEmbedContent } from '../noteEmbeds';
import { subscribePendingScroll, takePendingLine } from '../wikilinks';
import { notify } from '../toast';
import { t, useT } from '../i18n';

interface Props {
  filePath: string;
  content: string;
  onContentChange: (content: string) => void;
}

const AUTOSAVE_DELAY = 2000;

// Versión de cada nota tal como se leyó o guardó por última vez. Al guardar se envía
// al servidor, que rechaza el guardado si la nota ha cambiado en otro sitio desde entonces
export const noteVersions = new Map<string, string>();

// Autoguardados pendientes por ruta, para poder forzarlos o cancelarlos
// antes de renombrar, mover o borrar un archivo (o una carpeta entera)
const pendingSaves = new Map<string, { timer: number; run: () => Promise<void> }>();
// Guardados ya enviados al servidor que aún no han terminado. Puede haber más de uno por ruta
// (p. ej. un guardado lento al que le sigue otro): se guardan todos, porque esperar solo al
// último dejaría escribir al anterior después de un renombrado o borrado y resucitaría el archivo
const inFlightSaves = new Map<string, Set<Promise<void>>>();

// `path` null: todas las notas
const under = <T,>(map: Map<string, T>, path: string | null) =>
  [...map.entries()].filter(([p]) => path === null || isUnder(p, path));

export const hasPendingSave = (path: string) => pendingSaves.has(path) || inFlightSaves.has(path);

// Guarda ya los autoguardados pendientes y espera a los que están en curso
export async function flushPendingSave(path: string | null) {
  await Promise.all([
    ...under(pendingSaves, path).map(([, pending]) => {
      clearTimeout(pending.timer);
      return pending.run();
    }),
    ...under(inFlightSaves, path).flatMap(([, saving]) => [...saving]),
  ]);
}

export function cancelPendingSave(path: string) {
  for (const [p, pending] of under(pendingSaves, path)) {
    clearTimeout(pending.timer);
    pendingSaves.delete(p);
  }
}

// Guarda la nota partiendo de la versión conocida; si ha cambiado en el servidor, no la
// sobrescribe: abre el conflicto para que el usuario elija qué versión conservar
export function saveNote(path: string, content: string): Promise<void> {
  const { setTabDirty, setConflict, clearConflict } = useStore.getState();
  const save = (async () => {
    try {
      const { version } = await filesApi.writeFile(path, content, noteVersions.get(path));
      noteVersions.set(path, version);
      setEmbedContent(path, content);
      // Si se ha seguido escribiendo mientras tanto, queda otro guardado pendiente
      if (!pendingSaves.has(path)) setTabDirty(path, false);
      clearConflict(path);
      notify('save', t('toast.saved'));
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict({ path, mine: content, theirs: err.content, version: err.version });
      } else {
        console.error('Autosave failed:', err);
        const name = path.split('/').pop()!.replace(/\.md$/i, '');
        notify('save', t('toast.saveError', { name, error: (err as Error).message }), 'error');
      }
    }
  })();
  const set = inFlightSaves.get(path) ?? new Set<Promise<void>>();
  set.add(save);
  inFlightSaves.set(path, set);
  return save.finally(() => {
    set.delete(save);
    if (!set.size && inFlightSaves.get(path) === set) inFlightSaves.delete(path);
  });
}

// Evento para que la nota abierta compruebe si ha cambiado en el servidor
export const NOTES_CHANGED = 'notes-changed';

// Renombra o mueve un archivo o carpeta. El servidor actualiza los enlaces de otras notas,
// así que antes se guarda todo lo pendiente y después se avisa para recargar la nota abierta
export async function changeNotePath(oldPath: string, newPath: string) {
  await flushPendingSave(null);
  const { updated } = await filesApi.renameFile(oldPath, newPath);
  // La versión conocida viaja con el archivo. Sin ella, el primer guardado en la ruta nueva
  // iría sin `baseVersion` y el servidor no detectaría cambios hechos en otro sitio
  for (const [path, version] of [...noteVersions]) {
    if (!isUnder(path, oldPath)) continue;
    noteVersions.delete(path);
    noteVersions.set(newPath + path.slice(oldPath.length), version);
  }
  useStore.getState().renameTab(oldPath, newPath);
  if (updated.length) window.dispatchEvent(new Event(NOTES_CHANGED));
}

// Insertar plantilla: el editor montado registra aquí su manejador. En modo lectura no hay
// editor, así que se pasa a edición y el texto queda pendiente hasta que se monte
let insertHandler: ((text: string) => void) | null = null;
let pendingInsert: string | null = null;

export function insertIntoNote(text: string) {
  if (insertHandler) return insertHandler(text);
  pendingInsert = text;
  useStore.getState().setEditMode(true);
}

// Cambios que llegan de fuera (la nota ha cambiado en el servidor): no son ediciones
// del usuario, así que no se autoguardan ni entran en el historial de deshacer
const externalChange = Annotation.define<boolean>();

const lineNumbersCompartment = new Compartment();
const lineNumbersExtension = (show: boolean) => (show ? [lineNumbers(), highlightActiveLineGutter()] : []);

function createState(doc: string, onChange: (doc: string) => void, getPath: () => string) {
  return EditorState.create({
    doc,
    extensions: [
      notePath.of(getPath),
      history(),
      drawSelection(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: 'true' }),
      // Los bloques ```lang se resaltan con su lenguaje; cada paquete se descarga
      // la primera vez que aparece un bloque que lo usa
      markdown({ base: markdownLanguage, codeLanguages: languages, extensions: [HighlightSyntax] }),
      livePreview,
      lineNumbersCompartment.of(lineNumbersExtension(useStore.getState().showLineNumbers)),
      imageUpload(getPath),
      wikilinkCompletion,
      // Tab sangra con un tabulador, como Obsidian (por defecto serían 2 espacios)
      indentUnit.of('\t'),
      EditorState.tabSize.of(4),
      keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((tr) => tr.annotation(externalChange))) {
          onChange(u.state.doc.toString());
        }
      }),
    ],
  });
}

export default function Editor({ filePath, content, onContentChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const setTabDirty = useStore((s) => s.setTabDirty);
  const showLineNumbers = useStore((s) => s.showLineNumbers);
  const showInlineTitle = useStore((s) => s.showInlineTitle);
  const rawMode = useStore((s) => s.rawMode);
  const tr = useT();
  const note = useMemo(() => parseNote(content), [content]);
  // Con un frontmatter inválido se edita el texto completo, sin panel de propiedades
  const body = note.valid ? note.body : content;

  // El listener de CodeMirror se crea una vez: siempre llama al manejador del último render
  const onBodyChangeRef = useRef<(newBody: string) => void>(() => {});
  onBodyChangeRef.current = (newBody) => handleBodyChange(newBody);
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const getPath = () => filePathRef.current;

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: createState(body, (doc) => onBodyChangeRef.current(doc), getPath),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  const insertRef = useRef<(text: string) => void>(() => {});
  insertRef.current = (text) => handleInsert(text);
  useEffect(() => {
    insertHandler = (text) => insertRef.current(text);
    if (pendingInsert !== null) {
      const text = pendingInsert;
      pendingInsert = null;
      insertRef.current(text);
    }
    return () => {
      insertHandler = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: lineNumbersCompartment.reconfigure(lineNumbersExtension(showLineNumbers)) });
  }, [showLineNumbers]);

  // Contenido cambiado desde fuera. Otra nota: estado nuevo, historial limpio. La misma nota
  // (cambiada en otro dispositivo, por la sincronización...): solo se sustituye el tramo
  // distinto, para no perder el cursor, el scroll ni el historial
  const shownPathRef = useRef(filePath);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== body) {
      if (shownPathRef.current === filePath) {
        let from = 0;
        while (from < current.length && from < body.length && current[from] === body[from]) from++;
        let end = 0;
        while (
          end < current.length - from &&
          end < body.length - from &&
          current[current.length - 1 - end] === body[body.length - 1 - end]
        ) {
          end++;
        }
        view.dispatch({
          changes: { from, to: current.length - end, insert: body.slice(from, body.length - end) },
          annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
        });
      } else {
        view.setState(createState(body, (doc) => onBodyChangeRef.current(doc), getPath));
      }
    }
    shownPathRef.current = filePath;
  }, [body, filePath]);

  // Llegada desde un resultado de búsqueda (también con la nota ya abierta)
  const [scrollRequest, setScrollRequest] = useState(0);
  useEffect(() => subscribePendingScroll(() => setScrollRequest((n) => n + 1)), []);
  useEffect(() => {
    const view = viewRef.current;
    const line = takePendingLine(filePath);
    if (!view || !line) return;
    // La búsqueda cuenta líneas del fichero completo; el editor muestra solo el cuerpo
    const offset = note.valid ? (note.head?.match(/\n/g)?.length ?? 0) : 0;
    const target = view.state.doc.line(Math.min(Math.max(1, line - offset), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    });
  }, [body, filePath, note, scrollRequest]);

  const handleBodyChange = (newBody: string) => {
    if (!note.valid) commit(newBody);
    else commit(note.head !== null ? note.head + newBody : composeNote(note.data, newBody));
  };

  // Inserta el texto en el cursor. Si trae propiedades (frontmatter), se añaden a las de la nota
  // sin cambiar las que ya tiene, como hace Obsidian con las plantillas
  const handleInsert = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const template = parseNote(text);
    const newKeys = template.valid ? Object.keys(template.data).filter((k) => !(k in note.data)) : [];
    const insert = template.valid && note.valid ? template.body : text;
    const { from, to } = view.state.selection.main;
    if (!newKeys.length || !note.valid) {
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
    } else {
      // El cuerpo y las propiedades se guardan juntos, no como dos cambios por separado
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
        scrollIntoView: true,
        annotations: externalChange.of(true),
      });
      const data = { ...note.data };
      for (const key of newKeys) data[key] = template.data[key];
      commit(composeNote(data, view.state.doc.toString()));
    }
    view.focus();
  };

  const handlePropertiesChange = (data: FrontmatterData) => commit(composeNote(data, body));

  const commit = (newContent: string) => {
    onContentChange(newContent);
    // Solo si no lo está ya: commit() corre en cada pulsación y a partir de la primera la
    // pestaña ya está sucia (setTabDirty también lo comprueba, esto evita la llamada)
    if (!useStore.getState().tabs.find((t) => t.path === filePath)?.isDirty) {
      setTabDirty(filePath, true);
    }

    // Con un conflicto abierto no se guarda: se espera a que el usuario elija
    const { conflicts, setConflict } = useStore.getState();
    const conflict = conflicts.find((c) => c.path === filePath);
    if (conflict) {
      setConflict({ ...conflict, mine: newContent });
      return;
    }

    // Debounced autosave
    cancelPendingSave(filePath);

    const run = () => {
      pendingSaves.delete(filePath);
      return saveNote(filePath, newContent);
    };
    pendingSaves.set(filePath, { timer: window.setTimeout(run, AUTOSAVE_DELAY), run });
  };

  // En texto plano el editor CodeMirror sigue montado pero oculto: así conserva el cursor y
  // el historial, y se mantiene al día con lo que se escribe en el área de texto
  return (
    <>
      {rawMode && (
        <textarea
          className="editor-raw"
          aria-label={tr('name.noteText')}
          value={content}
          spellCheck={true}
          autoFocus
          onChange={(e) => commit(e.target.value)}
        />
      )}
      {!rawMode && <EditorToolbar viewRef={viewRef} filePath={filePath} />}
      <div className="editor-scroll" hidden={rawMode}>
        {showInlineTitle && <InlineTitle filePath={filePath} onEnter={() => viewRef.current?.focus()} />}
        {note.valid && (
          <div className="editor-properties">
            <Properties data={note.data} editable onChange={handlePropertiesChange} />
          </div>
        )}
        <div ref={hostRef} className="editor-cm" />
      </div>
    </>
  );
}
