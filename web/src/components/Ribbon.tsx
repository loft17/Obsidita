import { useState } from 'react';
import { useStore } from '../store';
import { authApi, filesApi, settingsApi } from '../api';
import { isImage } from '../attachments';
import { openDailyNote, templateFiles, applyTemplate } from '../templates';
import { insertIntoNote } from './Editor';
import { QuickOpenDialog } from './FileDialogs';
import { t, useT } from '../i18n';
import { notify } from '../toast';
import { noteTitle } from '../paths';
import { IconSidebar, IconFolderOpen, IconSearch, IconTag, IconCalendarDays, IconTemplate, IconTrash, IconSettings, IconLogout } from './Icons';

export const logout = async () => {
  await authApi.logout();
  window.location.reload();
};

const openToday = () =>
  openDailyNote().catch((err) => notify('daily', t('daily.openError', { error: (err as Error).message }), 'error'));

// "Insertar plantilla": elige una nota de la carpeta de plantillas y la inserta en el cursor de la nota abierta
function useTemplatePicker() {
  const [picker, setPicker] = useState<{ folder: string; files: { path: string; name: string }[] } | null>(null);

  const open = async () => {
    const { activeTab, setTree } = useStore.getState();
    if (!activeTab || isImage(activeTab)) return notify('templates', t('templates.openNoteFirst'), 'info');
    try {
      const { templates } = await settingsApi.getNotes();
      if (!templates.folder) {
        return notify('templates', t('templates.configureFolder'), 'info');
      }
      const tree = await filesApi.getTree();
      setTree(tree);
      setPicker({ folder: templates.folder, files: templateFiles(tree, templates.folder) });
    } catch (err) {
      notify('templates', t('templates.loadError', { error: (err as Error).message }), 'error');
    }
  };

  const insert = async (path: string) => {
    const { activeTab } = useStore.getState();
    if (!activeTab) return;
    try {
      const [{ content }, { templates }] = await Promise.all([filesApi.readFile(path), settingsApi.getNotes()]);
      const title = noteTitle(activeTab);
      insertIntoNote(activeTab, applyTemplate(content, title, templates));
    } catch (err) {
      notify('templates', t('templates.insertError', { error: (err as Error).message }), 'error');
    }
  };

  const dialog = picker && (
    <QuickOpenDialog
      files={picker.files}
      title={t('templates.insert')}
      placeholder={t('templates.search')}
      emptyText={t('templates.none', { folder: picker.folder })}
      label={(path) => path.slice(picker.folder.replace(/^\/+|\/+$/g, '').length + 1).replace(/\.md$/i, '')}
      onSelect={insert}
      onClose={() => setPicker(null)}
    />
  );

  return { open, dialog };
}

export default function Ribbon() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const sidebarView = useStore((s) => s.sidebarView);
  const showSidebarView = useStore((s) => s.showSidebarView);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const templates = useTemplatePicker();
  const t = useT();

  return (
    <div className="ribbon">
      <div className="ribbon-group">
        <button type="button" className="ribbon-item" title={t('sidebar.toggle')} aria-label={t('sidebar.toggle')} onClick={toggleSidebar}>
          <IconSidebar />
        </button>
        <button
          type="button"
          className={`ribbon-item ${sidebarOpen && sidebarView === 'files' ? 'active' : ''}`}
          title={t('sidebar.files')}
          aria-label={t('sidebar.files')}
          aria-pressed={sidebarOpen && sidebarView === 'files'}
          onClick={() => showSidebarView('files')}
        >
          <IconFolderOpen />
        </button>
        <button
          type="button"
          className={`ribbon-item ${sidebarOpen && sidebarView === 'search' ? 'active' : ''}`}
          title={`${t('sidebar.search')} (Ctrl+Shift+F)`}
          aria-label={`${t('sidebar.search')} (Ctrl+Shift+F)`}
          aria-pressed={sidebarOpen && sidebarView === 'search'}
          onClick={() => showSidebarView('search')}
        >
          <IconSearch />
        </button>
        <button
          type="button"
          className={`ribbon-item ${sidebarOpen && sidebarView === 'tags' ? 'active' : ''}`}
          title={t('sidebar.tags')}
          aria-label={t('sidebar.tags')}
          aria-pressed={sidebarOpen && sidebarView === 'tags'}
          onClick={() => showSidebarView('tags')}
        >
          <IconTag />
        </button>
        <button
          type="button"
          className={`ribbon-item ${sidebarOpen && sidebarView === 'trash' ? 'active' : ''}`}
          title={t('sidebar.trash')}
          aria-label={t('sidebar.trash')}
          aria-pressed={sidebarOpen && sidebarView === 'trash'}
          onClick={() => showSidebarView('trash')}
        >
          <IconTrash />
        </button>
        <button type="button" className="ribbon-item" title={t('daily.open')} aria-label={t('daily.open')} onClick={openToday}>
          <IconCalendarDays />
        </button>
        <button type="button" className="ribbon-item" title={t('templates.insert')} aria-label={t('templates.insert')} onClick={templates.open}>
          <IconTemplate />
        </button>
      </div>

      <div className="ribbon-group bottom">
        <button type="button" className="ribbon-item" title={t('settings.open')} aria-label={t('settings.open')} onClick={() => setSettingsOpen(true)}>
          <IconSettings />
        </button>
        <button type="button" className="ribbon-item" title={t('auth.logout')} aria-label={t('auth.logout')} onClick={logout}>
          <IconLogout />
        </button>
      </div>
      {templates.dialog}
    </div>
  );
}

// Con la cinta oculta, sus botones pasan al pie de la barra lateral
export function SidebarFooter() {
  const sidebarView = useStore((s) => s.sidebarView);
  const showSidebarView = useStore((s) => s.showSidebarView);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const templates = useTemplatePicker();
  const t = useT();

  return (
    <div className="sidebar-footer">
      <button
        className={`icon-btn ${sidebarView === 'files' ? 'active' : ''}`}
        title={t('sidebar.files')}
        onClick={() => showSidebarView('files')}
      >
        <IconFolderOpen size={16} />
      </button>
      <button
        className={`icon-btn ${sidebarView === 'search' ? 'active' : ''}`}
        title={`${t('sidebar.search')} (Ctrl+Shift+F)`}
        onClick={() => showSidebarView('search')}
      >
        <IconSearch size={16} />
      </button>
      <button
        className={`icon-btn ${sidebarView === 'tags' ? 'active' : ''}`}
        title={t('sidebar.tags')}
        onClick={() => showSidebarView('tags')}
      >
        <IconTag size={16} />
      </button>
      <button
        className={`icon-btn ${sidebarView === 'trash' ? 'active' : ''}`}
        title={t('sidebar.trash')}
        onClick={() => showSidebarView('trash')}
      >
        <IconTrash size={16} />
      </button>
      <button className="icon-btn" title={t('daily.open')} onClick={openToday}>
        <IconCalendarDays size={16} />
      </button>
      <button className="icon-btn" title={t('templates.insert')} onClick={templates.open}>
        <IconTemplate size={16} />
      </button>
      <span className="sidebar-footer-spacer" />
      <button className="icon-btn" title={t('settings.open')} onClick={() => setSettingsOpen(true)}>
        <IconSettings size={16} />
      </button>
      <button className="icon-btn" title={t('auth.logout')} onClick={logout}>
        <IconLogout size={16} />
      </button>
      {templates.dialog}
    </div>
  );
}
