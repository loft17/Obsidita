import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore, hiddenMatchers, isHiddenPath, parseHiddenExtensions, hasHiddenExtension } from '../store';
import { filesApi } from '../api';
import type { TreeItem } from '../types';
import { flushPendingSave } from './Editor';
import { applyPathChange, deletePath, refreshTree } from './fileActions';
import { fileName, isUnder, joinPath, movedPath, parentFolder, renamedPath } from '../paths';
import { RenameDialog, MoveDialog, DeleteFileDialog } from './FileDialogs';
import { useT } from '../i18n';
import { IconChevronRight, IconChevronDown, IconCollapseAll, IconFileNew, IconFolderNew } from './Icons';
import { isMobile, useIsMobile, useLongPress } from '../mobile';
import { hasExternalFiles, droppedEntries, uploadDropped } from '../folderUpload';
import { notify } from '../toast';
import { MenuItem, focusMenuItem, onMenuKeyDown } from './menuNav';
import { fileShortcutFor } from '../fileShortcuts';

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

const displayName = (item: TreeItem) => (item.type === 'file' ? item.name.replace(/\.md$/i, '') : item.name);

// Aplana el árbol en lista 1D para virtualización manual
function flattenTree(items: TreeItem[], grouped: Grouped, expandedFolders: Set<string>, level: number = 0): FlatItem[] {
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
    const parentPath = parentFolder(item.path);
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
  onKeyDown,
  onFocus,
  tabStop,
  revealed,
  drag,
}: {
  flatItem: FlatItem;
  activeTab: string | null;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (at: { x: number; y: number }, path: string, isFolder: boolean) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus: (path: string) => void;
  // Único elemento del árbol alcanzable con Tab; el resto se recorre con las flechas
  tabStop: boolean;
  // Carpeta seleccionada desde el breadcrumb
  revealed: boolean;
  drag: DragHandlers;
}) {
  const { item, level, isExpanded, hasChildren } = flatItem;
  const mobile = useIsMobile();
  const isFolder = item.type === 'folder';
  const folder = isFolder ? item.path : parentFolder(item.path);
  const longPress = useLongPress((x, y) => onContextMenu({ x, y }, item.path, isFolder));

  return (
    <div className={`tree-node ${isFolder && drag.dropTarget === item.path ? 'drop-target' : ''}`} role="none">
      <div
        className={`tree-item ${isFolder ? 'folder' : 'file'} ${activeTab === item.path ? 'active' : ''} ${revealed ? 'revealed' : ''}`}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
        role="treeitem"
        aria-level={level + 1}
        aria-expanded={isFolder && hasChildren ? isExpanded : undefined}
        aria-selected={activeTab === item.path}
        tabIndex={tabStop ? 0 : -1}
        data-path={item.path}
        onKeyDown={onKeyDown}
        onFocus={() => onFocus(item.path)}
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

const ITEM_HEIGHT = 27; // px, debe coincidir con min-height en CSS

export default function FileExplorer() {
  const tree = useStore((s) => s.tree);
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const hiddenExtensions = useStore((s) => s.hiddenExtensions);
  const toggleFolder = useStore((s) => s.toggleFolder);
  const collapseAll = useStore((s) => s.collapseAll);
  const expandedFolders = useStore((s) => s.expandedFolders);
  const addTab = useStore((s) => s.addTab);
  const openFile = useStore((s) => s.openFile);
  const setActiveTab = useStore((s) => s.setActiveTab);
  // keyboard: abierto con el teclado (tecla de menú o Shift+F10), el foco va al primer elemento
  const [menu, setMenu] = useState<{ x: number; y: number; path: string; isFolder: boolean; keyboard: boolean } | null>(
    null,
  );
  // Elemento del árbol con el foco (o el último que lo tuvo): es la parada de Tab del árbol
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  // Elemento que debe recibir el foco en cuanto la virtualización lo pinte
  const pendingFocus = useRef<string | null>(null);
  // Carpeta seleccionada desde el breadcrumb; se olvida con el siguiente clic o al cambiar de nota
  const [revealedPath, setRevealedPath] = useState<string | null>(null);
  const revealRequest = useStore((s) => s.revealRequest);
  const [dialog, setDialog] = useState<{
    kind: 'rename' | 'move' | 'delete' | 'new-note' | 'new-folder';
    path: string;
    isFolder?: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  const t = useT();

  // Virtualización manual: calcula qué items son visibles basándose en scroll
  const updateRange = (container: HTMLDivElement) => {
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 10);
    const end = Math.ceil((scrollTop + clientHeight) / ITEM_HEIGHT) + 10;
    setVisibleRange({ start, end });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => updateRange(e.currentTarget);

  const focusTreeItem = (path: string) => {
    const el = explorerRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    el?.focus();
    return !!el;
  };

  const handleSelect = (path: string) => {
    openFile(path, fileName(path));
    // En el móvil la barra lateral tapa la nota (también si ya estaba abierta)
    if (isMobile()) useStore.setState({ sidebarOpen: false });
  };

  const handleOpenInNewTab = (path: string) => {
    addTab(path, fileName(path));
    setActiveTab(path);
  };

  const handleContextMenu = (at: { x: number; y: number }, path: string, isFolder: boolean, keyboard = false) => {
    // Mantener el menú dentro de la ventana
    const x = Math.max(4, Math.min(at.x, window.innerWidth - 220));
    const y = Math.max(4, Math.min(at.y, window.innerHeight - 240));
    setMenu({ x, y, path, isFolder, keyboard });
  };

  const closeMenu = () => {
    if (!menu) return;
    setMenu(null);
    focusTreeItem(menu.path);
  };

  const runMenuAction = (action: (path: string) => void) => {
    if (!menu) return;
    const path = menu.path;
    // El foco vuelve antes al elemento del árbol: así el diálogo que se abra lo devuelve allí al cerrarse
    closeMenu();
    action(path);
  };

  const openDialog = (kind: NonNullable<typeof dialog>['kind']) =>
    runMenuAction((path) => setDialog({ kind, path, isFolder: menu?.isFolder }));

  const expandFolder = (path: string) => {
    if (!useStore.getState().expandedFolders.has(path)) toggleFolder(path);
  };

  // folder '' es la raíz de la bóveda
  const handleNewNote = async (folder: string, name: string) => {
    const path = joinPath(folder, /\.md$/i.test(name) ? name : `${name}.md`);
    await filesApi.createNote(path);
    await refreshTree();
    if (folder) expandFolder(folder);
    openFile(path, fileName(path));
    // Una nota recién creada se abre en modo edición, lista para escribir
    useStore.getState().setEditMode(true);
    setDialog(null);
  };

  const handleNewFolder = async (folder: string, name: string) => {
    await filesApi.createFolder(joinPath(folder, name));
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
      notify('copy', t('file.copyError', { error: (err as Error).message }), 'error');
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

  const handleDelete = (path: string, images: string[]) => deletePath(path, images).finally(closeDialog);

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
  const canDrop = (from: string, folder: string) => parentFolder(from) !== folder && !isUnder(folder, from);

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
          expandTimer.current = {
            folder: hoveredFolder,
            timer: window.setTimeout(() => expandFolder(hoveredFolder), 700),
          };
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
        notify('move', t('file.moveError', { error: (err as Error).message }), 'error');
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
    // Escape también cierra el menú abierto con el ratón; si el foco estaba en él, vuelve al árbol
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      const inMenu = menuRef.current?.contains(document.activeElement);
      setMenu(null);
      if (inMenu) focusTreeItem(menu.path);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // Al abrirse, el foco entra en el menú para recorrerlo con las flechas: con el teclado, en su
  // primer elemento; con el ratón, en el contenedor, sin resaltar ninguno
  useEffect(() => {
    if (!menu) return;
    if (menu.keyboard) focusMenuItem(menuRef.current, 'first');
    else menuRef.current?.focus();
  }, [menu]);

  // Sin dependencias: el elemento pendiente aparece cuando el scroll actualiza el rango visible.
  // Sin nada pendiente solo compara una ref, así que correr tras cada render no cuesta nada
  useEffect(() => {
    if (pendingFocus.current && focusTreeItem(pendingFocus.current)) pendingFocus.current = null;
  });

  // `tree` solo se reemplaza entero (nunca se muta en sitio), así que memoizar por identidad
  // es seguro. Sin esto, filtrar y reconstruir el árbol completo corría en CADA render (~3 ms
  // con 3000 notas) y el explorador re-renderiza al expandir, al cambiar de pestaña, etc.
  const { roots, grouped } = useMemo(() => {
    const matchers = hiddenMatchers(hiddenFolders);
    const exts = parseHiddenExtensions(hiddenExtensions);
    const visibleTree =
      matchers.length || exts.size
        ? tree.filter(
            (item) =>
              !isHiddenPath(item.path, item.type === 'folder', matchers) &&
              !(item.type !== 'folder' && exts.size && hasHiddenExtension(item.path, exts)),
          )
        : tree;
    return buildTree(visibleTree);
  }, [tree, hiddenFolders, hiddenExtensions]);

  const flatItems = useMemo(() => {
    return flattenTree(roots, grouped, expandedFolders);
  }, [roots, grouped, expandedFolders]);

  const activeTab = useStore((s) => s.activeTab);

  // Petición del breadcrumb: la carpeta ya está desplegada (y sus padres); se centra en el
  // árbol y se selecciona. Se pinta tras hacer scroll, así que el foco va por `pendingFocus`
  useEffect(() => {
    if (!revealRequest) return;
    const { path } = revealRequest;
    useStore.getState().clearRevealRequest();
    const index = flatItems.findIndex((f) => f.item.path === path);
    const container = explorerRef.current;
    if (index < 0 || !container) return;
    setRevealedPath(path);
    setFocusedPath(path);
    container.scrollTop = Math.max(0, index * ITEM_HEIGHT - container.clientHeight / 2);
    updateRange(container);
    pendingFocus.current = path;
  }, [revealRequest, flatItems]);

  // El sombreado se quita con el siguiente clic en cualquier parte de la página. El clic del
  // breadcrumb que lo ha puesto ya pasó, así que no lo borra
  useEffect(() => {
    if (!revealedPath) return;
    const clear = () => setRevealedPath(null);
    document.addEventListener('pointerdown', clear, true);
    return () => document.removeEventListener('pointerdown', clear, true);
  }, [revealedPath]);

  // Solo al cambiar de nota: al montarse el explorador no debe borrar la selección recién hecha
  const lastActiveTab = useRef(activeTab);
  useEffect(() => {
    if (lastActiveTab.current === activeTab) return;
    lastActiveTab.current = activeTab;
    setRevealedPath(null);
  }, [activeTab]);

  // Lleva el foco a un elemento del árbol, aunque la virtualización aún no lo haya pintado
  const moveFocus = (index: number) => {
    const target = flatItems[index];
    const container = explorerRef.current;
    if (!target || !container) return;
    setFocusedPath(target.item.path);
    if (focusTreeItem(target.item.path)) return;
    container.scrollTop = Math.max(0, index * ITEM_HEIGHT - container.clientHeight / 2);
    updateRange(container);
    pendingFocus.current = target.item.path;
  };

  // Patrón de árbol de ARIA: ↑/↓ e Inicio/Fin recorren, → despliega o entra en la carpeta, ← la
  // pliega o sube a la carpeta padre, Intro/Espacio abren, y la tecla de menú o Shift+F10 sacan el
  // menú contextual. F2, Supr y los atajos de mover/borrar abren su diálogo para ese elemento
  const handleTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    const { item, isExpanded, hasChildren } = flatItems[index];
    const isFolder = item.type === 'folder';
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      handleContextMenu({ x: r.left + 24, y: r.bottom }, item.path, isFolder, true);
      return;
    }
    // En el árbol, los atajos de archivo actúan sobre el elemento enfocado y no sobre la nota abierta
    const action =
      fileShortcutFor(e) ??
      (e.key === 'Delete' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey ? 'delete' : null);
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      setDialog({ kind: action, path: item.path, isFolder });
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    switch (e.key) {
      case 'ArrowDown':
        moveFocus(Math.min(index + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        moveFocus(Math.max(index - 1, 0));
        break;
      case 'Home':
        moveFocus(0);
        break;
      case 'End':
        moveFocus(flatItems.length - 1);
        break;
      case 'ArrowRight':
        if (!isFolder || !hasChildren) break;
        if (isExpanded) moveFocus(index + 1);
        else toggleFolder(item.path);
        break;
      case 'ArrowLeft':
        if (isFolder && isExpanded) toggleFolder(item.path);
        else {
          const parent = parentFolder(item.path);
          const parentIndex = flatItems.findIndex((f) => f.item.path === parent);
          if (parentIndex >= 0) moveFocus(parentIndex);
        }
        break;
      case 'Enter':
      case ' ':
        if (isFolder) toggleFolder(item.path);
        else handleSelect(item.path);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const visibleItems = flatItems.slice(visibleRange.start, visibleRange.end);
  // Parada de Tab: el último elemento enfocado, si no la nota abierta y si no el primero visible
  const isVisible = (path: string | null) => visibleItems.some((f) => f.item.path === path);
  const tabStop = isVisible(focusedPath) ? focusedPath : isVisible(activeTab) ? activeTab : visibleItems[0]?.item.path;

  return (
    <>
      <div className="sidebar-toolbar">
        <button
          className="icon-btn"
          title={t('file.createNote')}
          onClick={() => setDialog({ kind: 'new-note', path: '' })}
        >
          <IconFileNew size={16} />
        </button>
        <button
          className="icon-btn"
          title={t('file.createFolder')}
          onClick={() => setDialog({ kind: 'new-folder', path: '' })}
        >
          <IconFolderNew size={16} />
        </button>
        <button className="icon-btn" title={t('file.collapseAll')} onClick={collapseAll}>
          <IconCollapseAll size={16} />
        </button>
      </div>
      <div
        ref={explorerRef}
        className={`file-explorer ${dropTarget === '' ? 'drop-target' : ''}`}
        role="tree"
        aria-label={t('sidebar.files')}
        // El hueco libre del explorador es la raíz de la bóveda
        onDragOver={(e) => drag.onDragOver(e, '')}
        onDrop={(e) => drag.onDrop(e, '')}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropTarget(null);
            clearExpandTimer();
          }
        }}
        onScroll={handleScroll}
      >
        {/* Spacer arriba */}
        <div role="none" style={{ height: `${visibleRange.start * ITEM_HEIGHT}px` }} />

        {/* Items visibles */}
        {visibleItems.map((flatItem, idx) => (
          <FileTreeItem
            key={flatItem.item.path}
            flatItem={flatItem}
            activeTab={activeTab}
            onToggle={toggleFolder}
            onSelect={handleSelect}
            onContextMenu={handleContextMenu}
            onKeyDown={(e) => handleTreeKeyDown(e, visibleRange.start + idx)}
            onFocus={setFocusedPath}
            tabStop={flatItem.item.path === tabStop}
            revealed={flatItem.item.path === revealedPath}
            drag={drag}
          />
        ))}

        {/* Spacer abajo */}
        <div role="none" style={{ height: `${Math.max(0, (flatItems.length - visibleRange.end) * ITEM_HEIGHT)}px` }} />
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          aria-label={fileName(menu.path)}
          tabIndex={-1}
          style={{ top: menu.y, left: menu.x }}
          // Tab cierra el menú y devuelve el foco al árbol: el menú está al final del documento
          onKeyDown={(e) =>
            onMenuKeyDown(e, (ev) => {
              ev.preventDefault();
              closeMenu();
            })
          }
          // La tecla de menú dispara también el `contextmenu` nativo, ya sobre el menú abierto
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.isFolder ? (
            <>
              <MenuItem onClick={() => openDialog('new-note')}>{t('file.newNote')}</MenuItem>
              <MenuItem onClick={() => openDialog('new-folder')}>{t('file.newFolder')}</MenuItem>
            </>
          ) : (
            <MenuItem onClick={() => runMenuAction(handleOpenInNewTab)}>{t('file.openInNewTab')}</MenuItem>
          )}
          {!menu.isFolder && (
            <MenuItem onClick={() => runMenuAction((path) => useStore.getState().setNoteInfoPath(path))}>
              {t('file.info')}
            </MenuItem>
          )}
          <hr className="dropdown-divider" />
          <MenuItem onClick={() => runMenuAction(handleCopy)}>{t('file.makeCopy')}</MenuItem>
          {menu.isFolder && (
            <MenuItem onClick={() => runMenuAction(handleDownloadFolder)}>{t('file.downloadFolder')}</MenuItem>
          )}
          <MenuItem onClick={() => openDialog('move')}>
            {menu.isFolder ? t('file.moveFolder') : t('file.moveFile')}
          </MenuItem>
          <MenuItem onClick={() => openDialog('rename')}>{t('file.rename')}</MenuItem>
          <hr className="dropdown-divider" />
          <MenuItem danger onClick={() => openDialog('delete')}>
            {t('common.delete')}
          </MenuItem>
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
          currentFolder={parentFolder(dialog.path)}
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
