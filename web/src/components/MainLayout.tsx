import {
  lazy,
  Suspense,
  useState,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useStore, DEFAULT_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '../store';
import Ribbon, { SidebarFooter } from './Ribbon';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';
import TagsPanel from './TagsPanel';
import TrashPanel from './TrashPanel';
import Tabs from './Tabs';
import Editor, { cancelPendingSave, noteVersions, saveNote } from './Editor';
import { QuickOpenDialog, ConflictDialog } from './FileDialogs';
import ReadingView from './ReadingView';
import ImageViewer from './ImageViewer';
import StatusBar from './StatusBar';
import TextViewer from './TextViewer';
import { isImage, isPlainText } from '../attachments';
import NoteMenu from './NoteMenu';
import NoteShortcuts from './NoteShortcuts';
import { IconBook, IconEdit, IconSidebar, IconSearch } from './Icons';
import { useT } from '../i18n';
import Toasts from './Toasts';
import { useSyncNotifications } from '../syncNotify';
import { useUpdateNotification } from '../updateNotify';
import { loadServerFonts } from '../serverFonts';
import { useIsMobile } from '../mobile';
import { isNote, noteTitle } from '../paths';
import { useNoteLoader } from '../noteLoader';
import { useExternalCheck } from '../externalCheck';
import { useGlobalShortcuts } from '../globalShortcuts';

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

export default function MainLayout() {
  const activeTab = useStore((s) => s.activeTab);
  const editMode = useStore((s) => s.editMode);
  const setEditMode = useStore((s) => s.setEditMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarView = useStore((s) => s.sidebarView);
  const sidebarWidth = useStore((s) => s.sidebarWidth);
  const { content: fileContent, setContent: setFileContent, loading } = useNoteLoader(activeTab);
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
  useGlobalShortcuts(() => setQuickOpen(true));
  useExternalCheck(setFileContent);

  // Fuentes de la carpeta fonts/ del servidor; se releen al abrir Ajustes por si se han añadido más
  useEffect(() => {
    if (settingsOpen || !document.getElementById('server-fonts')) loadServerFonts();
  }, [settingsOpen]);

  // En el móvil la barra lateral tapa la nota: al abrir una se cierra
  useEffect(() => {
    if (mobile && activeTab) useStore.setState({ sidebarOpen: false });
  }, [activeTab, mobile]);

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
              <div className="mobile-header-title">{activeTab ? noteTitle(activeTab) : ''}</div>
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
                {activeTab
                  .replace(/\.md$/i, '')
                  .split('/')
                  .map((part, i, arr) => (
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
            {loading ? (
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
                <ReadingView
                  key={activeTab}
                  content={fileContent}
                  filePath={activeTab}
                  onContentChange={setFileContent}
                />
              )
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  color: 'var(--text-faint)',
                }}
              >
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
