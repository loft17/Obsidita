import { useState } from 'react';
import { useStore } from '../store';
import { useT } from '../i18n';
import { IconClose, IconPlus, IconSidebar } from './Icons';
import { useIsMobile } from '../mobile';
import { ConfirmDialog } from './FileDialogs';

export default function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const removeTab = useStore((s) => s.removeTab);
  const showRibbon = useStore((s) => s.showRibbon);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const mobile = useIsMobile();
  const t = useT();
  const [pathToClose, setPathToClose] = useState<string | null>(null);

  return (
    <div className="tabs">
      {/* Sin la cinta, este es el único botón para volver a abrir la barra lateral */}
      {!showRibbon && !mobile && (
        <button className="icon-btn tabs-sidebar-toggle" title={`${t('sidebar.toggle')} (Ctrl+B)`} onClick={toggleSidebar}>
          <IconSidebar size={16} />
        </button>
      )}
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`tab ${activeTab === tab.path ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.path)}
        >
          <span className="tab-title">{tab.name.replace(/\.md$/i, '')}</span>
          {tab.isDirty && <span className="tab-dirty">●</span>}
          <div
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              if (tab.isDirty) {
                setPathToClose(tab.path);
              } else {
                removeTab(tab.path);
              }
            }}
            title={t('common.close')}
          >
            <IconClose size={14} />
          </div>
        </div>
      ))}
      <div className="tab-new" title={t('tabs.new')}>
        <IconPlus size={16} />
      </div>
      {pathToClose && (
        <ConfirmDialog
          title={t('tabs.closeUnsaved')}
          message={t('tabs.closeUnsavedMessage')}
          confirmLabel={t('tabs.closeWithoutSaving')}
          onConfirm={async () => {
            removeTab(pathToClose);
            setPathToClose(null);
          }}
          onClose={() => setPathToClose(null)}
        />
      )}
    </div>
  );
}
