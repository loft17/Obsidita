import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { filesApi } from '../api';
import Ribbon, { SidebarFooter } from './Ribbon';
import SettingsModal from './SettingsModal';
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
import { isImage } from '../attachments';
import NoteMenu from './NoteMenu';
import { IconBook, IconEdit, IconSidebar, IconSearch } from './Icons';
import { useT, t as translate } from '../i18n';
import Toasts from './Toasts';
import { notify } from '../toast';
import { useSyncNotifications } from '../syncNotify';
import { useUpdateNotification } from '../updateNotify';
import { loadServerFonts } from '../serverFonts';
import { useIsMobile } from '../mobile';

// Cada cuánto se comprueba si la nota abierta ha cambiado en el servidor (ms)
const EXTERNAL_CHECK_INTERVAL = 15000;

export default function MainLayout() {
  const activeTab = useStore((s) => s.activeTab);
  const editMode = useStore((s) => s.editMode);
  const setEditMode = useStore((s) => s.setEditMode);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const sidebarView = useStore((s) => s.sidebarView);
  const [fileContent, setFileContent] = useState('');
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

  // Atajos globales: Ctrl/Cmd+P abrir nota, +S guardar, +E editar/leer, +B barra lateral, +Shift+F buscar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
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
          else if (!isImage(activeTab)) notify('save', translate('toast.saved'));
          break;
        case 'e':
          if (!activeTab || isImage(activeTab)) return;
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
  }, [activeTab]);

  useEffect(() => {
    if (!activeTab) return;
    // Las imágenes las carga el visor; leerlas como texto las corrompería al autoguardar
    if (isImage(activeTab)) {
      setFileContent('');
      return;
    }

    const loadFile = async () => {
      setLoading(true);
      try {
        // Un guardado aún en curso de esta nota se leería a medias
        await flushPendingSave(activeTab);
        const data = await filesApi.readFile(activeTab);
        noteVersions.set(activeTab, data.version);
        setFileContent(data.content);
      } catch (err) {
        console.error('Error loading file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [activeTab]);

  // La nota abierta puede cambiar fuera de esta pestaña: otro dispositivo, la sincronización
  // con GitHub, Obsidian de escritorio... Se comprueba al volver a la pestaña, cada poco
  // mientras está visible y cuando el servidor reescribe enlaces. Si hay cambios sin guardar
  // no se toca nada: el guardado detectará el conflicto
  useEffect(() => {
    let checking = false;
    const busy = (path: string) =>
      hasPendingSave(path) || !!useStore.getState().tabs.find((t) => t.path === path)?.isDirty;

    const check = async () => {
      const { activeTab: path, conflicts } = useStore.getState();
      if (checking || !path || isImage(path) || conflicts.length || busy(path)) return;
      if (document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const known = noteVersions.get(path);
        const data = await filesApi.readFile(path);
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

  const editToggle = activeTab && !activeIsImage && (
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
          <aside className="sidebar-left">
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

        <div className="editor-container">
          {mobile && (
            <div className="mobile-header">
              <button className="icon-btn" title={t('sidebar.toggle')} onClick={toggleSidebar}>
                <IconSidebar />
              </button>
              <div className="mobile-header-title">
                {activeTab ? (activeTab.split('/').pop() || activeTab).replace(/\.md$/i, '') : ''}
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
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                {t('common.loading')}
              </div>
            ) : activeTab ? (
              activeIsImage ? (
                <ImageViewer filePath={activeTab} />
              ) : editMode ? (
                <Editor filePath={activeTab} content={fileContent} onContentChange={setFileContent} />
              ) : (
                <ReadingView content={fileContent} filePath={activeTab} />
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
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
    </div>
  );
}
