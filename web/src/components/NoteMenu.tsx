import { useState, useEffect, useId, useRef, useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { useStore } from '../store';
import { filesApi, syncApi, ConflictError } from '../api';
import { flushPendingSave, noteVersions, NOTES_CHANGED } from './Editor';
import { applyPathChange, deletePath } from './fileActions';
import { fileName, movedPath, noteTitle, parentFolder, renamedPath } from '../paths';
import { IconMenu } from './Icons';
import { RenameDialog, MoveDialog, DeleteFileDialog, HistoryDialog } from './FileDialogs';
import { isImage } from '../attachments';
import { t as translate, useT } from '../i18n';
import { notify } from '../toast';
import { MenuItem, focusMenuItem, onMenuKeyDown } from './menuNav';
import { useLatest } from '../latestRef';
import log from '../logger';

export default function NoteMenu() {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'move' | 'delete' | 'history' | null>(null);

  const activeTab = useStore((s) => s.activeTab);
  const tree = useStore((s) => s.tree);
  const editMode = useStore((s) => s.editMode);
  const rawMode = useStore((s) => s.rawMode);
  const setRawMode = useStore((s) => s.setRawMode);
  const gitSyncProvider = useStore((s) => s.gitSyncProvider);
  const setGitSyncProvider = useStore((s) => s.setGitSyncProvider);

  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Elemento que recibe el foco al abrir con el teclado (null: abierto con el ratón, el foco no se mueve)
  const [focusOnOpen, setFocusOnOpen] = useState<'first' | 'last' | null>(null);
  const t = useT();

  // Cargar estado de sincronización una sola vez y cachearlo
  useEffect(() => {
    if (gitSyncProvider !== null) return;
    syncApi.get().then(
      (cfg) => setGitSyncProvider(cfg.provider),
      () => setGitSyncProvider(''),
    );
  }, [gitSyncProvider, setGitSyncProvider]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape cierra el menú; si el foco estaba dentro, vuelve al botón
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      const inMenu = menuRef.current?.contains(document.activeElement);
      setOpen(false);
      if (inMenu) buttonRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && focusOnOpen) focusMenuItem(menuRef.current, focusOnOpen);
  }, [open, focusOnOpen]);

  // La búsqueda y los diálogos pertenecen al documento mostrado
  useEffect(() => {
    setSearchOpen(false);
    setDialog(null);
  }, [activeTab]);

  // Ctrl/Cmd+F abre la búsqueda en el documento en lugar de la del navegador
  useEffect(() => {
    if (!activeTab || isImage(activeTab)) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeTab]);

  // Antes del return: un hook después cambiaría el orden de los hooks entre renders
  const folders = useMemo(
    () =>
      tree
        .filter((i) => i.type === 'folder')
        .map((i) => i.path)
        .sort((a, b) => a.localeCompare(b)),
    [tree],
  );

  if (!activeTab) return null;
  const activeIsImage = isImage(activeTab);

  const show = (focus: 'first' | 'last' | null) => {
    setFocusOnOpen(focus);
    setOpen(true);
  };

  // Antes de cerrar, el foco vuelve al botón si estaba en el menú: así el diálogo que se abra lo
  // devuelve allí al cerrarse, en vez de perderse con el menú desmontado
  const closeMenu = () => {
    if (menuRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    setOpen(false);
  };

  const openDialog = (kind: NonNullable<typeof dialog>) => {
    closeMenu();
    setDialog(kind);
  };

  const changePath = async (newPath: string) => {
    await applyPathChange(activeTab, newPath);
    setDialog(null);
  };

  const handleRename = (newName: string) => changePath(renamedPath(activeTab, newName));

  const handleMove = (folder: string) => changePath(movedPath(activeTab, folder));

  const handleDelete = async (images: string[]) => {
    await deletePath(activeTab, images);
    setDialog(null);
  };

  // Restaurar una versión antigua es un guardado normal (queda como versión nueva en el
  // próximo commit). Se parte de la versión conocida para no pisar cambios hechos en otro sitio;
  // después se avisa para que la nota abierta se recargue con el contenido restaurado
  const handleRestore = async (content: string) => {
    await flushPendingSave(activeTab);
    if (useStore.getState().conflicts.some((c) => c.path === activeTab)) {
      throw new Error(translate('history.resolveConflictFirst'));
    }
    try {
      await filesApi.writeFile(activeTab, content, noteVersions.get(activeTab));
    } catch (err) {
      if (err instanceof ConflictError) throw new Error(translate('history.changedRetry'));
      throw err;
    }
    window.dispatchEvent(new Event(NOTES_CHANGED));
    setDialog(null);
  };

  const handleDownloadMd = async () => {
    closeMenu();
    try {
      await flushPendingSave(activeTab);
      const data = await filesApi.readFile(activeTab);

      const blob = new Blob([data.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName(activeTab);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      log.error('Error downloading markdown:', err);
    }
  };

  const handleExportPDF = async () => {
    closeMenu();
    // Abrir antes del await: tras él ya no cuenta como gesto del usuario y se bloquea el popup
    const win = window.open('', '_blank');
    await flushPendingSave(activeTab);
    const url = `/api/files/export-pdf/${encodeURIComponent(activeTab)}`;
    if (win) win.location.href = url;
    else notify('exportPdf', translate('note.popupBlocked'), 'error');
  };

  return (
    <div className="dropdown" ref={ref}>
      <button
        ref={buttonRef}
        className="icon-btn"
        title={t('note.moreOptions')}
        aria-label={t('note.moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // Con el teclado: Intro/Espacio/↓ abren en el primer elemento y ↑ en el último
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          show(e.key === 'ArrowDown' ? 'first' : 'last');
        }}
        onClick={(e) => {
          // detail === 0: activado con Intro/Espacio, no con el ratón
          if (open) setOpen(false);
          else show(e.detail === 0 ? 'first' : null);
        }}
      >
        <IconMenu />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="dropdown-menu"
          role="menu"
          aria-label={t('note.moreOptions')}
          // Tab cierra el menú y sigue con el foco desde el botón
          onKeyDown={(e) => onMenuKeyDown(e, () => setOpen(false))}
        >
          <MenuItem onClick={() => openDialog('rename')}>{t('file.rename')}</MenuItem>
          <MenuItem onClick={() => openDialog('move')}>{t('file.moveFile')}</MenuItem>
          {!activeIsImage && (
            <>
              {editMode && (
                <MenuItem
                  onClick={() => {
                    closeMenu();
                    setRawMode(!rawMode);
                  }}
                >
                  {rawMode ? t('note.exitRawMode') : t('note.rawMode')}
                </MenuItem>
              )}
              <MenuItem onClick={handleExportPDF}>{t('note.exportPdf')}</MenuItem>
              <MenuItem onClick={handleDownloadMd}>{t('note.downloadMd')}</MenuItem>
              <MenuItem
                onClick={() => {
                  closeMenu();
                  setSearchOpen(true);
                }}
              >
                {t('note.find')}
              </MenuItem>
              {gitSyncProvider === 'github' && (
                <MenuItem onClick={() => openDialog('history')}>{t('note.history')}</MenuItem>
              )}
            </>
          )}
          <hr className="dropdown-divider" />
          <MenuItem danger onClick={() => openDialog('delete')}>
            {t('file.deleteFile')}
          </MenuItem>
        </div>
      )}
      {searchOpen && <SearchBar onClose={() => setSearchOpen(false)} />}
      {dialog === 'rename' && (
        <RenameDialog initialName={noteTitle(activeTab)} onSubmit={handleRename} onClose={() => setDialog(null)} />
      )}
      {dialog === 'move' && (
        <MoveDialog
          folders={folders}
          currentFolder={parentFolder(activeTab)}
          onSubmit={handleMove}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'history' && (
        <HistoryDialog path={activeTab} onRestore={handleRestore} onClose={() => setDialog(null)} />
      )}
      {dialog === 'delete' && (
        <DeleteFileDialog
          path={activeTab}
          title={t('file.deleteFile')}
          confirmLabel={t('common.delete')}
          onDelete={handleDelete}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// Resaltado nativo (CSS Custom Highlight API) para la vista de lectura
const HL_ALL = 'note-search';
const HL_CURRENT = 'note-search-current';

// Navegadores sin la API: no hay registro de resaltados ni constructor `Highlight`
const highlightRegistry = (): HighlightRegistry | undefined =>
  typeof Highlight === 'undefined' ? undefined : CSS.highlights;

function clearHighlights() {
  const hl = highlightRegistry();
  hl?.delete(HL_ALL);
  hl?.delete(HL_CURRENT);
}

function findRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = [];
  const needle = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').toLowerCase();
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + needle.length);
      ranges.push(range);
    }
  }
  return ranges;
}

function SearchBar({ onClose }: { onClose: () => void }) {
  const editMode = useStore((s) => s.editMode);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const t = useT();

  const getEditor = () => {
    const dom = document.querySelector<HTMLElement>('.editor-cm .cm-editor');
    return dom ? EditorView.findFromDOM(dom) : null;
  };
  const getReading = () => document.querySelector<HTMLElement>('.reading-view-inner');

  const editorMatches = (view: EditorView) => {
    const hay = view.state.doc.toString().toLowerCase();
    const needle = query.toLowerCase();
    const found: number[] = [];
    for (let i = hay.indexOf(needle); needle && i >= 0; i = hay.indexOf(needle, i + needle.length)) found.push(i);
    return found;
  };

  // Mostrar el resultado `i`: seleccionar en el editor o resaltar en la lectura
  const show = (i: number, focusEditor: boolean) => {
    if (editMode) {
      const view = getEditor();
      if (!view) return;
      const found = editorMatches(view);
      setTotal(found.length);
      if (found.length === 0) return;
      const n = (i + found.length) % found.length;
      setIndex(n);
      const start = found[n];
      // Seleccionar el resultado y llevar su línea al centro del área visible
      view.dispatch({
        selection: { anchor: start, head: start + query.length },
        effects: EditorView.scrollIntoView(start, { y: 'center' }),
      });
      if (focusEditor) view.focus();
    } else {
      const ranges = rangesRef.current;
      if (ranges.length === 0) return;
      const n = (i + ranges.length) % ranges.length;
      setIndex(n);
      highlightRegistry()?.set(HL_CURRENT, new Highlight(ranges[n]));
      ranges[n].startContainer.parentElement?.scrollIntoView({ block: 'center' });
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    return clearHighlights;
  }, []);

  // Recalcular resultados al cambiar el texto buscado o el modo
  useEffect(() => {
    clearHighlights();
    rangesRef.current = [];
    setIndex(0);
    if (!query) return setTotal(0);
    if (editMode) {
      const view = getEditor();
      setTotal(view ? editorMatches(view).length : 0);
      return;
    }
    const root = getReading();
    if (!root) return setTotal(0);
    const ranges = findRanges(root, query);
    rangesRef.current = ranges;
    setTotal(ranges.length);
    const hl = highlightRegistry();
    if (hl && ranges.length) {
      // `new Highlight(...ranges)` revienta la pila con una nota grande y una búsqueda de una
      // sola letra (miles de coincidencias), así que se añaden una a una
      const all = new Highlight();
      for (const range of ranges) all.add(range);
      hl.set(HL_ALL, all);
      show(0, false);
    }
  }, [query, editMode]);

  // F3 / Shift+F3 siguen buscando aunque el foco esté en el editor. El listener se registra una
  // vez y llama al manejador del último render (con el `index` y la búsqueda actuales)
  const onKeyRef = useLatest((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'F3') {
      e.preventDefault();
      show(index + (e.shiftKey ? -1 : 1), true);
    }
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onKeyRef]);

  const step = (delta: number) => show(index + delta, editMode);

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        type="text"
        placeholder={t('note.findPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // En edición la primera pulsación va al primer resultado; las siguientes avanzan
            step(e.shiftKey ? -1 : editMode && getEditor()?.state.selection.main.empty ? 0 : 1);
          }
        }}
      />
      <span className="search-count">{query ? `${total ? index + 1 : 0}/${total}` : ''}</span>
      <button
        type="button"
        title={`${t('note.findPrev')} (Shift+F3)`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        title={`${t('note.findNext')} (F3)`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(1)}
      >
        ↓
      </button>
      <button type="button" title={t('common.close')} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
