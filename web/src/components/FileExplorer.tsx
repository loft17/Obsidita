import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore, isUnder, hiddenMatchers, isHiddenPath } from '../store';
import { filesApi } from '../api';
import { flushPendingSave } from './Editor';
import { applyPathChange, deletePath, filePathParent, fileName, movedPath, refreshTree, renamedPath } from './fileActions';

// Nombre local para el nivel del archivo: dentro del componente `fileName` es otra cosa
const parentOf = filePathParent;
import { RenameDialog, MoveDialog, DeleteFileDialog } from './FileDialogs';
import { useT } from '../i18n';
import { IconChevronRight, IconChevronDown, IconCollapseAll, IconFileNew, IconFolderNew } from './Icons';
import { isMobile, useIsMobile, useLongPress } from '../mobile';
import { hasExternalFiles, droppedEntries, uploadDropped } from '../folderUpload';
import { notify } from '../toast';

interface TreeItem {
  type: 'folder' | 'file' | 'other';
  path: string;
  name: string;
}

interface FlatItem {
  item: TreeItem;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
}

type Grouped = Map<string, TreeItem[]>;

// Arrastrar y soltar: `folder` es la carpeta de destino ('' = raíz). Soltar sobre un
// archivo lo mueve a la carpeta de ese archivo, como en Obsidian
interface DragHandlers {
  dropTarget: string | null;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent, folder: string, hoveredFolder?: string) => void;
  onDrop: (e: React.DragEvent, folder: string) => void;
  onDragEnd: () => void;
}

const displayName = (item: TreeItem) =>
  item.type === 'file' ? item.name.replace(/\.md$/i, '') : item.name;

// Aplana el árbol en lista 1D para virtualización manual
function flattenTree(
  items: TreeItem[],
  grouped: Grouped,
  expandedFolders: Set<string>,
  level: number = 0
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const item of items) {
    const hasChildren = item.type === 'folder' && (grouped.get(item.path)?.length ?? 0) > 0;
    const isExpanded = expandedFolders.has(item.path);
    result.push({ item, level, isExpanded, hasChildren });
    if (isExpanded && hasChildren) {
      const children = grouped.get(item.path) ?? [];
      result.push(...flattenTree(children, grouped, expandedFolders, level + 1));
    }
  }
  return result;
}

function buildTree(items: TreeItem[]) {
  const grouped: Grouped = new Map();
  const roots: TreeItem[] = [];

  for (const item of items) {
    const idx = item.path.lastIndexOf('/');
    const parentPath = idx >= 0 ? item.path.substring(0, idx) : '';
    if (!parentPath) {
      roots.push(item);
    } else {
      if (!grouped.has(parentPath)) grouped.set(parentPath, []);
      grouped.get(parentPath)!.push(item);
    }
  }

  const sort = (list: TreeItem[]) =>
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  sort(roots);
  grouped.forEach((list) => sort(list));

  return { roots, grouped };
}

function FileTreeItem({
  flatItem,
  activeTab,
  onToggle,
  onSelect,
  onContextMenu,
  drag,
}: {
  flatItem: FlatItem;
  activeTab: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (at: { x: number; y: number }, path: string, isFolder: boolean) => void;
  drag: DragHandlers;
}) {
  const { item, level, isExpanded, hasChildren } = flatItem;
  const mobile = useIsMobile();
  const isFolder = item.type === 'folder';
  const folder = isFolder ? item.path : parentOf(item.path);
  const longPress = useLongPress((x, y) => onContextMenu({ x, y }, item.path, isFolder));

  return (
    <div className={`tree-node ${isFolder && drag.dropTarget === item.path ? 'drop-target' : ''}`}>
      <div
        className={`tree-item ${isFolder ? 'folder' : 'file'} ${activeTab === item.path ? 'active' : ''}`}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
        draggable={!mobile}
        {...longPress.handlers}
        onClick={() => {
          if (longPress.fired.current) return;
          if (isFolder) onToggle(item.path);
          else onSelect(item.path);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu({ x: e.clientX, y: e.clientY }, item.path, isFolder);
        }}
        onDragStart={(e) => drag.onDragStart(e, item.path)}
        onDragOver={(e) => drag.onDragOver(e, folder, isFolder ? item.path : undefined)}
        onDrop={(e) => drag.onDrop(e, folder)}
        onDragEnd={drag.onDragEnd}
      >
        {isFolder && (
          <span className="tree-chevron">
            {hasChildren && (isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />)}
          </span>
        )}
        <span className="tree-label">{displayName(item)}</span>
      </div>
    </div>
  );
}

export default function FileExplorer() {
  const tree = useStore((s) => s.tree);
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const toggleFolder = useStore((s) => s.toggleFolder);
  const collapseAll = useStore((s) => s.collapseAll);
  const expandedFolders = useStore((s) => s.expandedFolders);
  const addTab = useStore((s) => s.addTab);
  const openFile = useStore((s) => s.openFile);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; isFolder: boolean } | null>(null);
  const [dialog, setDialog] = useState<{
    kind: 'rename' | 'move' | 'delete' | 'new-note' | 'new-folder';
    path: string;
    isFolder?: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const handleSelect = (path: string) => {
    openFile(path, fileName(path));
    // En el móvil la barra lateral tapa la nota (también si ya estaba abierta)
    if (isMobile()) useStore.setState({ sidebarOpen: false });
  };

  const handleOpenInNewTab = (path: string) => {
    addTab(path, fileName(path));
    setActiveTab(path);
  };

  const handleContextMenu = (at: { x: number; y: number }, path: string, isFolder: boolean) => {
    // Mantener el menú dentro de la ventana
    const x = Math.max(4, Math.min(at.x, window.innerWidth - 220));
    const y = Math.max(4, Math.min(at.y, window.innerHeight - 240));
    setMenu({ x, y, path, isFolder });
  };

  const runMenuAction = (action: (path: string) => void) => {
    if (!menu) return;
    const path = menu.path;
    setMenu(null);
    action(path);
  };

  const openDialog = (kind: NonNullable<typeof dialog>['kind']) =>
    runMenuAction((path) => setDialog({ kind, path, isFolder: menu?.isFolder }));

  const expandFolder = (path: string) => {
    if (!useStore.getState().expandedFolders.has(path)) toggleFolder(path);
  };

  // folder '' es la raíz de la bóveda
  const handleNewNote = async (folder: string, name: string) => {
    const path = `${folder ? folder + '/' : ''}${name}${/\.md$/i.test(name) ? '' : '.md'}`;
    await filesApi.createNote(path);
    await refreshTree();
    if (folder) expandFolder(folder);
    openFile(path, fileName(path));
    // Una nota recién creada se abre en modo edición, lista para escribir
    useStore.getState().setEditMode(true);
    setDialog(null);
  };

  const handleNewFolder = async (folder: string, name: string) => {
    await filesApi.createFolder(`${folder ? folder + '/' : ''}${name}`);
    await refreshTree();
    if (folder) expandFolder(folder);
    setDialog(null);
  };

  const handleCopy = async (path: string) => {
    try {
      await flushPendingSave(path);
      await filesApi.copyFile(path);
      await refreshTree();
    } catch (err) {
      alert(t('file.copyError', { error: (err as Error).message }));
    }
  };

  const handleDownloadFolder = (path: string) => {
    const url = filesApi.downloadFolder(path);
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Las operaciones viven en fileActions.ts, compartidas con los atajos de teclado
  const closeDialog = () => setDialog(null);

  const handleRename = (oldPath: string, newName: string, isFolder?: boolean) =>
    applyPathChange(oldPath, renamedPath(oldPath, newName, isFolder)).then(closeDialog);

  const handleMove = (oldPath: string, folder: string) =>
    applyPathChange(oldPath, movedPath(oldPath, folder)).then(closeDialog);

  const handleDelete = (path: string, images: string[]) =>
    deletePath(path, images).finally(closeDialog);

  // Arrastrar y soltar. La ruta arrastrada se guarda aquí porque durante el arrastre
  // el navegador no deja leer los datos del dataTransfer
  const dragPath = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Una carpeta cerrada se abre si se mantiene el arrastre encima un momento
  const expandTimer = useRef<{ folder: string; timer: number } | null>(null);

  const clearExpandTimer = () => {
    if (expandTimer.current) clearTimeout(expandTimer.current.timer);
    expandTimer.current = null;
  };

  const endDrag = () => {
    dragPath.current = null;
    setDropTarget(null);
    clearExpandTimer();
  };

  // Archivos o carpetas soltados desde el sistema: se suben las notas e imágenes a `folder`
  const handleExternalDrop = async (e: React.DragEvent, folder: string) => {
    e.preventDefault();
    e.stopPropagation();
    endDrag();
    // Se leen las entradas antes del primer `await`: el navegador vacía el dataTransfer al salir del evento
    const dropped = droppedEntries(e.dataTransfer);
    notify('upload', t('file.uploading'), 'info', 0);
    try {
      const { uploaded, errors } = await uploadDropped(folder, dropped);
      await refreshTree();
      if (folder && uploaded) expandFolder(folder);
      if (errors.length) notify('upload', t('file.uploadError', { error: errors.join('; ') }), 'error');
      else if (uploaded) notify('upload', t('file.uploaded', { count: uploaded }));
      else notify('upload', t('file.uploadNothing'), 'info');
    } catch (err) {
      // Si falla al leer una carpeta o al refrescar el árbol, el aviso de "subiendo" (que no
      // caduca solo) tiene que sustituirse igualmente y el error no puede quedar sin gestionar
      notify('upload', t('file.uploadError', { error: (err as Error).message }), 'error');
    }
  };

  // No se mueve a su misma carpeta ni una carpeta dentro de sí misma
  const canDrop = (from: string, folder: string) => parentOf(from) !== folder && !isUnder(folder, from);

  const drag: DragHandlers = {
    dropTarget,
    onDragStart: (e, path) => {
      dragPath.current = path;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', path);
      setMenu(null);
    },
    onDragOver: (e, folder, hoveredFolder) => {
      const from = dragPath.current;
      const external = from === null && hasExternalFiles(e.dataTransfer);
      // Arrastres de texto, enlaces...: no se tocan
      if (from === null && !external) return;
      e.stopPropagation();
      if (hoveredFolder !== expandTimer.current?.folder) {
        clearExpandTimer();
        if (hoveredFolder && !useStore.getState().expandedFolders.has(hoveredFolder)) {
          expandTimer.current = { folder: hoveredFolder, timer: window.setTimeout(() => expandFolder(hoveredFolder), 700) };
        }
      }
      // Los archivos del sistema se pueden soltar en cualquier carpeta: se copian
      const target = external || canDrop(from!, folder) ? folder : null;
      if (target !== null) {
        e.preventDefault();
        e.dataTransfer.dropEffect = external ? 'copy' : 'move';
      }
      if (target !== dropTarget) setDropTarget(target);
    },
    onDrop: async (e, folder) => {
      const from = dragPath.current;
      if (from === null) {
        // Sin esperar: el evento de soltar debe terminar ya (y `handleExternalDrop` ya informa
        // de sus propios errores)
        if (hasExternalFiles(e.dataTransfer)) void handleExternalDrop(e, folder);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      endDrag();
      if (!canDrop(from, folder)) return;
      try {
        await handleMove(from, folder);
        if (folder) expandFolder(folder);
      } catch (err) {
        alert(t('file.moveError', { error: (err as Error).message }));
      }
    },
    onDragEnd: endDrag,
  };

  useEffect(() => clearExpandTimer, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // `tree` solo se reemplaza entero (nunca se muta en sitio), así que memoizar por identidad
  // es seguro. Sin esto, filtrar y reconstruir el árbol completo corría en CADA render (~3 ms
  // con 3000 notas) y el explorador re-renderiza al expandir, al cambiar de pestaña, etc.
  const { roots, grouped } = useMemo(() => {
    const matchers = hiddenMatchers(hiddenFolders);
    const visibleTree = matchers.length
      ? tree.filter((item) => !isHiddenPath(item.path, item.type === 'folder', matchers))
      : tree;
    return buildTree(visibleTree);
  }, [tree, hiddenFolders]);

  const flatItems = useMemo(() => {
    return flattenTree(roots, grouped, expandedFolders);
  }, [roots, grouped, expandedFolders]);

  const activeTab = useStore((s) => s.activeTab);

  return (
    <>
      <div className="sidebar-toolbar">
        <button className="icon-btn" title={t('file.createNote')} onClick={() => setDialog({ kind: 'new-note', path: '' })}>
          <IconFileNew size={16} />
        </button>
        <button className="icon-btn" title={t('file.createFolder')} onClick={() => setDialog({ kind: 'new-folder', path: '' })}>
          <IconFolderNew size={16} />
        </button>
        <button className="icon-btn" title={t('file.collapseAll')} onClick={collapseAll}>
          <IconCollapseAll size={16} />
        </button>
      </div>
      <div
        className={`file-explorer ${dropTarget === '' ? 'drop-target' : ''}`}
        // El hueco libre del explorador es la raíz de la bóveda
        onDragOver={(e) => drag.onDragOver(e, '')}
        onDrop={(e) => drag.onDrop(e, '')}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget(null);
            clearExpandTimer();
          }
        }}
      >
        {flatItems.map((flatItem) => (
          <FileTreeItem
            key={flatItem.item.path}
            flatItem={flatItem}
            activeTab={activeTab}
            onToggle={toggleFolder}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            drag={drag}
          />
        ))}
      </div>
      {menu && (
        <div ref={menuRef} className="context-menu" style={{ top: menu.y, left: menu.x }}>
          {menu.isFolder ? (
            <>
              <div className="dropdown-item" onClick={() => openDialog('new-note')}>
                {t('file.newNote')}
              </div>
              <div className="dropdown-item" onClick={() => openDialog('new-folder')}>
                {t('file.newFolder')}
              </div>
            </>
          ) : (
            <div className="dropdown-item" onClick={() => runMenuAction(handleOpenInNewTab)}>
              {t('file.openInNewTab')}
            </div>
          )}
          <hr className="dropdown-divider" />
          <div className="dropdown-item" onClick={() => runMenuAction(handleCopy)}>
            {t('file.makeCopy')}
          </div>
          {menu.isFolder && (
            <div className="dropdown-item" onClick={() => runMenuAction(handleDownloadFolder)}>
              {t('file.downloadFolder')}
            </div>
          )}
          <div className="dropdown-item" onClick={() => openDialog('move')}>
            {menu.isFolder ? t('file.moveFolder') : t('file.moveFile')}
          </div>
          <div className="dropdown-item" onClick={() => openDialog('rename')}>
            {t('file.rename')}
          </div>
          <hr className="dropdown-divider" />
          <div className="dropdown-item danger" onClick={() => openDialog('delete')}>
            {t('common.delete')}
          </div>
        </div>
      )}
      {(dialog?.kind === 'new-note' || dialog?.kind === 'new-folder') && (
        <RenameDialog
          title={dialog.kind === 'new-note' ? t('file.newNote') : t('file.newFolder')}
          confirmLabel={t('common.create')}
          placeholder={dialog.kind === 'new-note' ? t('file.noteName') : t('file.folderName')}
          initialName=""
          onSubmit={(name) =>
            dialog.kind === 'new-note' ? handleNewNote(dialog.path, name) : handleNewFolder(dialog.path, name)
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          initialName={displayName({
            type: dialog.isFolder ? 'folder' : /\.md$/i.test(dialog.path) ? 'file' : 'other',
            path: dialog.path,
            name: fileName(dialog.path),
          })}
          onSubmit={(name) => handleRename(dialog.path, name, dialog.isFolder)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          title={dialog.isFolder ? t('file.moveFolder') : t('file.moveFile')}
          folders={tree
            .filter((i) => i.type === 'folder' && !(dialog.isFolder && isUnder(i.path, dialog.path)))
            .map((i) => i.path)
            .sort((a, b) => a.localeCompare(b))}
          currentFolder={parentOf(dialog.path)}
          onSubmit={(folder) => handleMove(dialog.path, folder)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteFileDialog
          path={dialog.path}
          isFolder={dialog.isFolder}
          title={dialog.isFolder ? t('file.deleteFolder') : t('file.deleteFile')}
          confirmLabel={t('common.delete')}
          onDelete={(images) => handleDelete(dialog.path, images)}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
