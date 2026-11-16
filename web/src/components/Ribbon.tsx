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
import { ribbonLayout, type RibbonId } from '../ribbonItems';
import {
  IconSidebar,
  IconFolderOpen,
  IconSearch,
  IconTag,
  IconCalendarDays,
  IconTemplate,
  IconTrash,
  IconBookmark,
  IconLink,
  IconSettings,
  IconLogout,
} from './Icons';

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

type RibbonButton = {
  Icon: typeof IconSidebar;
  title: string;
  // Solo los botones que cambian la vista de la barra lateral tienen estado pulsado
  pressed?: boolean;
  onClick: () => void;
};

// Botones de la cinta según el estado actual (la cinta y el pie de la barra lateral los usan)
function useRibbonButtons(openTemplates: () => void): Record<RibbonId, RibbonButton> {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const sidebarView = useStore((s) => s.sidebarView);
  const showSidebarView = useStore((s) => s.showSidebarView);
  const t = useT();

  const view = (id: 'files' | 'search' | 'tags' | 'trash' | 'bookmarks' | 'shortlinks') => ({
    pressed: sidebarOpen && sidebarView === id,
    onClick: () => showSidebarView(id),
  });

  return {
    sidebar: { Icon: IconSidebar, title: t('sidebar.toggle'), onClick: toggleSidebar },
    files: { Icon: IconFolderOpen, title: t('sidebar.files'), ...view('files') },
    search: { Icon: IconSearch, title: `${t('sidebar.search')} (Ctrl+Shift+F)`, ...view('search') },
    tags: { Icon: IconTag, title: t('sidebar.tags'), ...view('tags') },
    trash: { Icon: IconTrash, title: t('sidebar.trash'), ...view('trash') },
    bookmarks: { Icon: IconBookmark, title: t('sidebar.bookmarks'), ...view('bookmarks') },
    shortlinks: { Icon: IconLink, title: t('sidebar.shortlinks'), ...view('shortlinks') },
    daily: { Icon: IconCalendarDays, title: t('daily.open'), onClick: openToday },
    templates: { Icon: IconTemplate, title: t('templates.insert'), onClick: openTemplates },
  };
}

// Ids visibles, en el orden elegido en los ajustes
function useVisibleRibbonIds(): RibbonId[] {
  const order = useStore((s) => s.ribbonOrder);
  const hidden = useStore((s) => s.ribbonHidden);
  return ribbonLayout(order, hidden)
    .filter((item) => item.visible)
    .map((item) => item.id);
}

export default function Ribbon() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const templates = useTemplatePicker();
  const buttons = useRibbonButtons(templates.open);
  const visible = useVisibleRibbonIds();
  const t = useT();

  return (
    <div className="ribbon">
      <div className="ribbon-group">
        {visible.map((id) => {
          const { Icon, title, pressed, onClick } = buttons[id];
          return (
            <button
              key={id}
              type="button"
              className={`ribbon-item ${pressed ? 'active' : ''}`}
              title={title}
              aria-label={title}
              aria-pressed={pressed}
              onClick={onClick}
            >
              <Icon />
            </button>
          );
        })}
      </div>

      <div className="ribbon-group bottom">
        <button
          type="button"
          className="ribbon-item"
          title={t('settings.open')}
          aria-label={t('settings.open')}
          onClick={() => setSettingsOpen(true)}
        >
          <IconSettings />
        </button>
        <button
          type="button"
          className="ribbon-item"
          title={t('auth.logout')}
          aria-label={t('auth.logout')}
          onClick={logout}
        >
          <IconLogout />
        </button>
      </div>
      {templates.dialog}
    </div>
  );
}

// Botones de la cinta que también aparecen en el pie de la barra lateral (con la cinta oculta)
const FOOTER_IDS: RibbonId[] = ['files', 'search', 'tags', 'trash', 'daily', 'templates'];

// Con la cinta oculta, sus botones pasan al pie de la barra lateral (respetan el orden y los ocultos)
export function SidebarFooter() {
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const templates = useTemplatePicker();
  const buttons = useRibbonButtons(templates.open);
  const visible = useVisibleRibbonIds().filter((id) => FOOTER_IDS.includes(id));
  const t = useT();

  return (
    <div className="sidebar-footer">
      {visible.map((id) => {
        const { Icon, title, pressed, onClick } = buttons[id];
        return (
          <button key={id} className={`icon-btn ${pressed ? 'active' : ''}`} title={title} onClick={onClick}>
            <Icon size={16} />
          </button>
        );
      })}
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
