import { useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useT } from '../i18n';
import { IconClose, IconPlus, IconSidebar } from './Icons';
import { useIsMobile } from '../mobile';
import { flushPendingSave } from './Editor';

function CloseUnsavedDialog({ path, onClose, onRemove }: { path: string; onClose: () => void; onRemove: () => void }) {
  const [busy, setBusy] = useState(false);
  const t = useT();

  const handleSaveAndClose = async () => {
    setBusy(true);
    try {
      await flushPendingSave(path);
      onRemove();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal file-dialog">
        <div className="file-dialog-title">{t('tabs.closeUnsaved')}</div>
        <p className="file-dialog-message">{t('tabs.closeUnsavedMessage')}</p>
        <div className="file-dialog-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setBusy(true);
              onRemove();
            }}
            disabled={busy}
          >
            {t('tabs.closeWithoutSaving')}
          </button>
          <button type="button" onClick={handleSaveAndClose} disabled={busy}>
            {t('tabs.saveAndClose')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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
  const listRef = useRef<HTMLDivElement>(null);

  const closeTab = (path: string, isDirty?: boolean) => {
    if (isDirty) setPathToClose(path);
    else removeTab(path);
  };

  // Patrón de pestañas de ARIA con activación manual: ←/→ e Inicio/Fin mueven el foco, Intro/Espacio
  // abren la pestaña enfocada y Supr la cierra. Solo la activa entra en el orden de Tab
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    const list = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const tab = tabs[index];
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (index + 1) % list.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + list.length) % list.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = list.length - 1;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        setActiveTab(tab.path);
        return;
      case 'Delete': {
        e.preventDefault();
        // El foco pasa a la pestaña vecina antes de que esta desaparezca
        if (!tab.isDirty) (list[index + 1] ?? list[index - 1])?.focus();
        closeTab(tab.path, tab.isDirty);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div className="tabs">
      {/* Sin la cinta, este es el único botón para volver a abrir la barra lateral */}
      {!showRibbon && !mobile && (
        <button
          className="icon-btn tabs-sidebar-toggle"
          title={`${t('sidebar.toggle')} (Ctrl+B)`}
          onClick={toggleSidebar}
        >
          <IconSidebar size={16} />
        </button>
      )}
      <div className="tabs-list" role="tablist" ref={listRef}>
        {tabs.map((tab, index) => (
          <div
            key={tab.path}
            className={`tab ${activeTab === tab.path ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab.path}
            tabIndex={activeTab === tab.path || (!activeTab && index === 0) ? 0 : -1}
            onClick={() => setActiveTab(tab.path)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
          >
            <span className="tab-title">{tab.name.replace(/\.md$/i, '')}</span>
            {tab.isDirty && <span className="tab-dirty">●</span>}
            {/* Fuera del orden de Tab (no puede haber controles dentro de una pestaña): con el teclado, Supr */}
            <button
              type="button"
              className="tab-close"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path, tab.isDirty);
              }}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <IconClose size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="tab-new" title={t('tabs.new')}>
        <IconPlus size={16} />
      </div>
      {pathToClose && (
        <CloseUnsavedDialog
          path={pathToClose}
          onClose={() => setPathToClose(null)}
          onRemove={() => {
            removeTab(pathToClose);
            setPathToClose(null);
          }}
        />
      )}
    </div>
  );
}
