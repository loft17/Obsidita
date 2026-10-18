import {
  lazy,
  Suspense,
  useState,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useStore, DEFAULT_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '../store';
import { filesApi } from '../api';
import Ribbon, { SidebarFooter } from './Ribbon';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';
import TagsPanel from './TagsPanel';
import TrashPanel from './TrashPanel';
import Tabs from './Tabs';
import Editor, { flushPendingSave, cancelPendingSave, hasPendingSave, noteVersions, saveNote, NOTES_CHANGED } from './Editor';
import { QuickOpenDialog, ConflictDialog } from './FileDialogs';
import ReadingView from './ReadingView';
import ImageViewer from './ImageViewer';
import StatusBar from './StatusBar';
import TextViewer from './TextViewer';
import { isImage, isPlainText } from '../attachments';
import NoteMenu from './NoteMenu';
import NoteShortcuts, { useNoteOverlayStore } from './NoteShortcuts';
import { IconBook, IconEdit, IconSidebar, IconSearch } from './Icons';
import { useT, t as translate } from '../i18n';
import Toasts from './Toasts';
import { notify } from '../toast';
import { useSyncNotifications } from '../syncNotify';
import { useUpdateNotification } from '../updateNotify';
import { loadServerFonts } from '../serverFonts';
import { useIsMobile } from '../mobile';
import { noteTitle } from '../paths';
import { canRunFileShortcut, fileShortcutFor, hasOpenOverlay } from '../fileShortcuts';

// Los ajustes solo se descargan la primera vez que se abren
const SettingsModal = lazy(() => import('./SettingsModal'));

// Paso de las flechas al redimensionar con el teclado (px); con Shift, el grande
const RESIZE_STEP = 10;
const RESIZE_STEP_LARGE = 50;

// Borde arrastrable entre la barra lateral y la nota; doble clic vuelve al ancho por defecto.
// Con el foco: flechas para estrechar/ensanchar, Inicio/Fin para el mínimo/máximo e Intro para el ancho por defecto
function SidebarResizer() {
  const setSidebarWidth = useStore((s) => s.setSidebarWidth);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const t = useT();

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    const startX = e.clientX;
    const startWidth = useStore.getState().sidebarWidth;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    const move = (ev: PointerEvent) => setSidebarWidth(startWidth + ev.clientX - startX);
    const end = (ev: PointerEvent) => {
      setSidebarWidth(startWidth + ev.clientX - startX, true);
      document.body.classList.remove('is-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    let width: number;
    switch (e.key) {
      case 'ArrowLeft':
        width = sidebarWidth - step;
        break;
      case 'ArrowRight':
        width = sidebarWidth + step;
        break;
      case 'Home':
        width = MIN_SIDEBAR_WIDTH;
        break;
      case 'End':
        width = MAX_SIDEBAR_WIDTH;
        break;
      case 'Enter':
        width = DEFAULT_SIDEBAR_WIDTH;
        break;
      default:
        return;
    }
    e.preventDefault();
    setSidebarWidth(width, true);
  };

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('sidebar.resize')}
      aria-controls="sidebar-left"
      aria-valuenow={sidebarWidth}
      aria-valuemin={MIN_SIDEBAR_WIDTH}
      aria-valuemax={MAX_SIDEBAR_WIDTH}
      tabIndex={0}
      title={t('sidebar.resize')}
      onPointerDown={startDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, true)}
    />
  );
}

// Cada cuánto se comprueba si la nota abierta ha cambiado en el servidor (ms)
const EXTERNAL_CHECK_INTERVAL = 15000;

// Solo el markdown se edita como texto: cualquier otro archivo se leería en UTF-8 y al
// autoguardarlo se reescribiría corrompido (un PDF, un ZIP...)
const isNote = (path: string) => /\.md$/i.test(path);

export default function MainLayout() {
  const activeTab = useStore((s) => s.activeTab);
  const editMode = useStore((s) => s.editMode);
  const setEditMode = useStore((s) => s.setEditMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarView = useStore((s) => s.sidebarView);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const [fileContent, setFileContent] = useState('');
  // Nota a la que pertenece `fileContent`: al cambiar de pestaña, hasta que llega la nueva, es la anterior
  const [contentPath, setContentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const tree = useStore((s) => s.tree);
  const openFile = useStore((s) => s.openFile);
  const activeIsImage = !!activeTab && isImage(activeTab);
  const showRibbon = useStore((s) => s.showRibbon);
  const showTabHeader = useStore((s) => s.showTabHeader);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const conflict = useStore((s) => s.conflicts[0]);
  const tabCount = useStore((s) => s.tabs.length);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const mobile = useIsMobile();
  const t = useT();
  useSyncNotifications();
  useUpdateNotification();

  // Fuentes de la carpeta fonts/ del servidor; se releen al abrir Ajustes por si se han añadido más
  useEffect(() => {
    if (settingsOpen || !document.getElementById('server-fonts')) loadServerFonts();
  }, [settingsOpen]);

  // Atajos globales. Con modificador: Ctrl/Cmd+P abrir nota, +S guardar, +E editar/leer,
  // +B barra lateral, +Shift+F buscar. Para el archivo abierto: F2 renombrar, Ctrl/Cmd+Shift+M
  // mover y Ctrl/Cmd+Shift+Retroceso borrar (ver SHORTCUT_GROUPS en Ajustes → Atajos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const fileAction = fileShortcutFor(e);
      if (fileAction) {
        const { activeTab } = useStore.getState();
        const target = e.target as Element | null;
        // Sin archivo abierto no hay nada que renombrar, mover ni borrar
        if (!activeTab || !canRunFileShortcut(fileAction, target, { overlayOpen: hasOpenOverlay() })) return;
        // Con un botón enfocado Intro/Espacio lo activan; no hay motivo para saltar a un diálogo
        if ((document.activeElement as HTMLElement | null)?.closest('button')) return;
        e.preventDefault();
        useNoteOverlayStore.getState().open(fileAction);
        return;
      }

      const withMod = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (!withMod) return;
      if (e.shiftKey) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          useStore.setState({ sidebarOpen: true, sidebarView: 'search' });
        }
        return;
      }
      const { activeTab, editMode, setEditMode, toggleSidebar } = useStore.getState();
      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          setQuickOpen(true);
          break;
        case 's':
          e.preventDefault();
          if (!activeTab) break;
          // Sin nada pendiente no hay guardado que avise: se confirma igualmente
          if (hasPendingSave(activeTab)) flushPendingSave(activeTab);
          else if (isNote(activeTab)) notify('save', translate('toast.saved'));
          break;
        case 'e':
          // Solo las notas tienen modo edición: el resto de archivos son de solo lectura
          if (!activeTab || !isNote(activeTab)) return;
          e.preventDefault();
          setEditMode(!editMode);
          break;
        case 'b':
          e.preventDefault();
          toggleSidebar();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Ajuste rápido del tamaño de fuente: Ctrl/Cmd + rueda sobre la nota. Los navegadores también envían
  // el gesto de pellizcar del trackpad como rueda con ctrlKey. Fuera de la nota se mantiene el zoom del navegador
  useEffect(() => {
    let accumulated = 0;
    const onWheel = (e: WheelEvent) => {
      const { quickFontSize, fontSize, setFontSize } = useStore.getState();
      if (!quickFontSize || !(e.ctrlKey || e.metaKey)) return;
      if (!(e.target as Element).closest?.('.cm-editor, .reading-view')) return;
      e.preventDefault();
      // El trackpad manda muchos deltas pequeños: acumularlos para que el gesto no vaya demasiado rápido
      accumulated += e.deltaY;
      if (Math.abs(accumulated) < 20) return;
      setFontSize(fontSize + (accumulated < 0 ? 1 : -1));
      accumulated = 0;
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  // En el móvil la barra lateral tapa la nota: al abrir una se cierra
  useEffect(() => {
    if (mobile && activeTab) useStore.setState({ sidebarOpen: false });
  }, [activeTab, mobile]);

  useEffect(() => {
    if (!activeTab) return;
    // Solo las notas markdown se leen como texto. Las imágenes las carga el visor y el resto de
    // archivos (PDF, ZIP...) se leerían en UTF-8 y el autoguardado los reescribiría corrompidos
    if (!isNote(activeTab)) {
      setFileContent('');
      setContentPath(activeTab);
      setLoading(false);
      return;
    }

    const path = activeTab;
    // Cambiar de pestaña mientras esta carga está en curso no debe pisar la nota nueva:
    // el efecto se limpia al cambiar `activeTab`, así que a partir de ahí el resultado se ignora
    let cancelled = false;

    const loadFile = async () => {
      setLoading(true);
      try {
        // Un guardado aún en curso de esta nota se leería a medias
        await flushPendingSave(path);
        const data = await filesApi.readFile(path);
        if (cancelled || useStore.getState().activeTab !== path) return;
        noteVersions.set(path, data.version);
        setFileContent(data.content);
        setContentPath(path);
      } catch (err) {
        console.error('Error loading file:', err);
        if (!cancelled) setContentPath(path);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFile();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Al ocultar o cerrar la pestaña se guardan ya los autoguardados que estén esperando al
  // temporizador (hasta 2 s de lo escrito se perderían si no). pagehide cubre el cierre/recarga
  // y visibilitychange el cambio de app en el móvil
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') flushPendingSave(null);
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // La nota abierta puede cambiar fuera de esta pestaña: otro dispositivo, la sincronización
  // con GitHub, Obsidian de escritorio... Se comprueba al volver a la pestaña, cada poco
  // mientras está visible y cuando el servidor reescribe enlaces. Solo se pide la nota si su
  // versión en el servidor es otra (ver más abajo). Si hay cambios sin guardar no se toca
  // nada: el guardado detectará el conflicto
  useEffect(() => {
    let checking = false;
    const busy = (path: string) =>
      hasPendingSave(path) || !!useStore.getState().tabs.find((t) => t.path === path)?.isDirty;

    const check = async () => {
      const { activeTab: path, conflicts } = useStore.getState();
      if (checking || !path || !isNote(path) || conflicts.length || busy(path)) return;
      if (document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const known = noteVersions.get(path);
        // Con la versión conocida el servidor responde 304 y no se descarga la nota: solo
        // viaja el hash, así que el sondeo cada 15 s no reenvía notas grandes sin cambios
        const data = known ? await filesApi.readFile(path, known) : await filesApi.readFile(path);
        if (data.unchanged) return;
        const unchanged = useStore.getState().activeTab === path && !busy(path) && noteVersions.get(path) === known;
        if (!unchanged || data.version === known) return;
        noteVersions.set(path, data.version);
        setFileContent(data.content);
      } catch {
        // borrada o sin conexión: se vuelve a intentar en la próxima comprobación
      } finally {
        checking = false;
      }
    };

    const timer = window.setInterval(check, EXTERNAL_CHECK_INTERVAL);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener(NOTES_CHANGED, check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
      window.removeEventListener(NOTES_CHANGED, check);
    };
  }, []);

  // Conflicto: conservar lo escrito aquí (sobrescribe la versión del servidor)…
  const keepMine = async () => {
    if (!conflict) return;
    // Un autoguardado pendiente de esta nota es más viejo que `conflict.mine`: si se dejara
    // programado, al dispararse revertiría lo que se acaba de decidir
    cancelPendingSave(conflict.path);
    noteVersions.set(conflict.path, conflict.version);
    await saveNote(conflict.path, conflict.mine);
  };

  // …o quedarse con la del servidor y descartar lo escrito aquí
  const keepTheirs = () => {
    if (!conflict) return;
    const { path, theirs, version } = conflict;
    cancelPendingSave(path);
    noteVersions.set(path, version);
    const { setTabDirty, clearConflict, activeTab } = useStore.getState();
    setTabDirty(path, false);
    clearConflict(path);
    if (activeTab === path) setFileContent(theirs);
  };

  const editToggle = activeTab && isNote(activeTab) && (
    <button
      className="icon-btn"
      title={editMode ? t('note.toReading') : t('note.toEditing')}
      onClick={() => setEditMode(!editMode)}
    >
      {editMode ? <IconBook /> : <IconEdit />}
    </button>
  );

  return (
    <div className={`app-container ${mobile ? 'is-mobile' : ''}`}>
      {showRibbon && !mobile && <Ribbon />}
      <div className="main-content">
        {mobile && sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => useStore.setState({ sidebarOpen: false })} />
        )}
        {sidebarOpen && (
          <aside id="sidebar-left" className="sidebar-left" style={mobile ? undefined : { width: sidebarWidth }}>
            {sidebarView === 'search' ? (
              <SearchPanel />
            ) : sidebarView === 'tags' ? (
              <TagsPanel />
            ) : sidebarView === 'trash' ? (
              <TrashPanel />
            ) : (
              <FileExplorer />
            )}
            {(!showRibbon || mobile) && <SidebarFooter />}
          </aside>
        )}
        {sidebarOpen && !mobile && <SidebarResizer />}

        <div className="editor-container">
          {mobile && (
            <div className="mobile-header">
              <button className="icon-btn" title={t('sidebar.toggle')} onClick={toggleSidebar}>
                <IconSidebar />
              </button>
              <div className="mobile-header-title">
                {activeTab ? noteTitle(activeTab) : ''}
              </div>
              <button className="icon-btn" title={t('quickOpen.title')} onClick={() => setQuickOpen(true)}>
                <IconSearch />
              </button>
              {editToggle}
              {activeTab && <NoteMenu />}
            </div>
          )}
          {/* En el móvil las pestañas solo se muestran si hay más de una */}
          {(!mobile || tabCount > 1) && <Tabs />}
          {!mobile && activeTab && showTabHeader && (
            <div className="breadcrumb">
              <div className="breadcrumb-path">
                {activeTab.replace(/\.md$/i, '').split('/').map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && <span className="breadcrumb-sep"> / </span>}
                  </span>
                ))}
              </div>
              <div className="breadcrumb-actions">
                {editToggle}
                <NoteMenu />
              </div>
            </div>
          )}
          <div className="editor-wrapper">
            {loading || (activeTab && isNote(activeTab) && contentPath !== activeTab) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                {t('common.loading')}
              </div>
            ) : activeTab ? (
              activeIsImage ? (
                <ImageViewer key={activeTab} filePath={activeTab} />
              ) : isPlainText(activeTab) ? (
                <TextViewer key={activeTab} filePath={activeTab} />
              ) : !isNote(activeTab) ? (
                <div className="unsupported-file">
                  <div>{t('main.notEditable')}</div>
                  <a href={`/api/files/raw/${encodeURIComponent(activeTab)}`} download>
                    {t('common.download')}
                  </a>
                </div>
              ) : editMode ? (
                <Editor key={activeTab} filePath={activeTab} content={fileContent} onContentChange={setFileContent} />
              ) : (
                <ReadingView key={activeTab} content={fileContent} filePath={activeTab} onContentChange={setFileContent} />
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-faint)' }}>
                {t('main.empty')}
              </div>
            )}
          </div>
          {!activeIsImage && !mobile && <StatusBar content={fileContent} />}
        </div>
      </div>
      <Toasts />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        </Suspense>
      )}
      {conflict && (
        <ConflictDialog
          key={conflict.path}
          path={conflict.path}
          mine={conflict.mine}
          theirs={conflict.theirs}
          onKeepMine={keepMine}
          onKeepTheirs={keepTheirs}
        />
      )}
      {quickOpen && (
        <QuickOpenDialog
          files={tree.filter((i) => i.type === 'file' && /\.md$/i.test(i.path))}
          onSelect={openFile}
          onClose={() => setQuickOpen(false)}
        />
      )}
      {/* Diálogos de renombrar/mover/borrar que abren los atajos (F2, Ctrl+Shift+M, ...) */}
      <NoteShortcuts />
    </div>
  );
}
