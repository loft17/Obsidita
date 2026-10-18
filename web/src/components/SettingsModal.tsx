import { useEffect, useState, type CSSProperties } from 'react';
import { useStore, type FontKind, type Theme, DEFAULT_FONT_SIZE, DEFAULT_SITE_TITLE, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../store';
import { settingsApi, syncApi, type NotesConfig, type NotesConfigUpdate, type ServerLimits, type SyncConfig, type SyncConfigUpdate, type SyncProvider, type UpdateStatus, type UploadExtensions } from '../api';
import { formatDate as formatMoment, DEFAULT_DAILY_FORMAT, DEFAULT_DATE_FORMAT, DEFAULT_TIME_FORMAT } from '../templates';
import { getLang, LANGUAGES, Trans, useI18n, useT, type Lang, type MessageKey } from '../i18n';
import { IconChevronLeft, IconClose, IconEdit, IconEye, IconFolderNew, IconList, IconLock, IconReset, IconSearch, IconSync, IconUserCircle } from './Icons';
import { runSync } from '../syncNotify';
import { BUNDLED_FONTS, isBundledFont, loadBundledFont, type FontCategory } from '../fonts';
import { useServerFonts } from '../serverFonts';
import { useIsMobile } from '../mobile';

interface Props {
  onClose: () => void;
}

const SECTIONS: { id: string; label: MessageKey; Icon: typeof IconEye }[] = [
  { id: 'about', label: 'settings.section.about', Icon: IconUserCircle },
  { id: 'appearance', label: 'settings.section.appearance', Icon: IconEye },
  { id: 'editor', label: 'settings.section.editor', Icon: IconEdit },
  { id: 'files', label: 'settings.section.files', Icon: IconFolderNew },
  { id: 'sync', label: 'settings.section.sync', Icon: IconSync },
  { id: 'security', label: 'settings.section.security', Icon: IconLock },
  { id: 'shortcuts', label: 'settings.section.shortcuts', Icon: IconList },
  { id: 'variables', label: 'settings.section.variables', Icon: IconUserCircle },
];

// Orden de los grupos del desplegable: primero los que mejor encajan con cada uso
const FONT_GROUPS: Record<FontKind, FontCategory[]> = {
  interface: ['sans', 'serif', 'mono'],
  text: ['sans', 'serif', 'mono'],
  monospace: ['mono', 'sans', 'serif'],
};

const FONT_CATEGORY_LABELS: Record<FontCategory, MessageKey> = {
  sans: 'settings.font.sans',
  serif: 'settings.font.serif',
  mono: 'settings.font.mono',
};

const FONT_LABELS: Record<FontKind, MessageKey> = {
  interface: 'settings.font.interface',
  text: 'settings.font.text',
  monospace: 'settings.font.monospace',
};

const DEFAULT_OPTION = '';
const CUSTOM_OPTION = '__custom__';
const fontStack = (name: string, kind: FontKind) =>
  name.trim() ? `"${name.replace(/["\\]/g, '')}", var(--font-${kind}-default, var(--font-interface-default))` : undefined;

// Una de las fuentes incluidas o, con "Otra fuente instalada", el nombre de cualquier fuente del equipo
function FontSetting({ kind }: { kind: FontKind }) {
  const font = useStore((s) => s.fonts[kind]);
  const setFont = useStore((s) => s.setFont);
  const serverFamilies = useServerFonts((s) => s.families);
  // "Otra fuente instalada" se elige a mano o se deduce de una fuente que no está en ninguna lista
  const [chooseOther, setChooseOther] = useState(false);
  const known = !font || isBundledFont(font) || serverFamilies.includes(font);
  const custom = chooseOther || !known;
  const [text, setText] = useState(font);
  const t = useT();
  useEffect(() => setText(font), [font]);
  // El desplegable muestra cada opción en su propia fuente: aquí sí hacen falta todas. Se cargan
  // solo al abrir Ajustes (no en el arranque), porque fuera de aquí basta con la elegida
  useEffect(() => {
    for (const names of Object.values(BUNDLED_FONTS)) for (const name of names) void loadBundledFont(name);
  }, []);
  const save = () => text.trim() !== font && setFont(kind, text);

  const choose = (value: string) => {
    if (value === CUSTOM_OPTION) {
      setChooseOther(true);
      setText(known ? '' : font);
      return;
    }
    setChooseOther(false);
    setFont(kind, value);
  };

  return (
    <div className="setting-item">
      <div className="setting-info">
        <div className="setting-name">{t(FONT_LABELS[kind])}</div>
        <div className="setting-desc">{t(`${FONT_LABELS[kind]}.desc` as MessageKey)}</div>
      </div>
      <div className="setting-slider">
        <button
          className="icon-btn"
          title={t('settings.resetDefault')}
          disabled={!font && !custom}
          onClick={() => choose(DEFAULT_OPTION)}
        >
          <IconReset size={16} />
        </button>
        {custom && (
          <input
            className="setting-input setting-font-input"
            type="text"
            autoFocus={!font}
            placeholder={t('settings.font.customPlaceholder')}
            value={text}
            style={{ fontFamily: fontStack(text, kind) }}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        )}
        <select
          value={custom ? CUSTOM_OPTION : font}
          style={{ fontFamily: custom ? undefined : fontStack(font, kind) }}
          onChange={(e) => choose(e.target.value)}
        >
          <option value={DEFAULT_OPTION}>{t('settings.font.default')}</option>
          {serverFamilies.length > 0 && (
            <optgroup label={t('settings.font.server')}>
              {serverFamilies.map((name) => (
                <option key={name} value={name} style={{ fontFamily: fontStack(name, kind) }}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
          {FONT_GROUPS[kind].map((category) => (
            <optgroup key={category} label={t(FONT_CATEGORY_LABELS[category])}>
              {BUNDLED_FONTS[category].map((name) => (
                <option key={name} value={name} style={{ fontFamily: fontStack(name, kind) }}>
                  {name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM_OPTION}>{t('settings.font.custom')}</option>
        </select>
      </div>
    </div>
  );
}

// Título de la web: se guarda en el servidor (vale para todos los dispositivos) al salir del campo o pulsar Intro
function SiteTitleSetting() {
  const siteTitle = useStore((s) => s.siteTitle);
  const setSiteTitle = useStore((s) => s.setSiteTitle);
  const [value, setValue] = useState(siteTitle);
  const [error, setError] = useState('');
  const t = useT();

  const save = async (title: string) => {
    const clean = title.trim();
    if (clean === siteTitle) return setValue(clean);
    setError('');
    try {
      const saved = await settingsApi.setSiteTitle(clean);
      setSiteTitle(saved.siteTitle);
      setValue(saved.siteTitle);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="setting-item">
      <div className="setting-info">
        <div className="setting-name">{t('settings.siteTitle')}</div>
        <div className="setting-desc">{t('settings.siteTitle.desc', { title: DEFAULT_SITE_TITLE })}</div>
        {error && <div className="setting-desc" style={{ color: 'var(--text-error, #e5484d)' }}>{error}</div>}
      </div>
      <div className="setting-slider">
        <button
          className="icon-btn"
          title={t('settings.resetDefault')}
          disabled={!siteTitle}
          onClick={() => save('')}
        >
          <IconReset size={16} />
        </button>
        <input
          className="setting-input setting-font-input"
          type="text"
          maxLength={60}
          placeholder={DEFAULT_SITE_TITLE}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(value)}
          onKeyDown={(e) => e.key === 'Enter' && save(value)}
        />
      </div>
    </div>
  );
}

// Los cambios se guardan automáticamente (el store los persiste en localStorage)
function AppearanceSection() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const showTabHeader = useStore((s) => s.showTabHeader);
  const setShowTabHeader = useStore((s) => s.setShowTabHeader);
  const showRibbon = useStore((s) => s.showRibbon);
  const setShowRibbon = useStore((s) => s.setShowRibbon);
  const quickFontSize = useStore((s) => s.quickFontSize);
  const setQuickFontSize = useStore((s) => s.setQuickFontSize);
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  const t = useT();
  const fontPercent = ((fontSize - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100;
  return (
    <>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.language')}</div>
          <div className="setting-desc">{t('settings.language.desc')}</div>
        </div>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.theme')}</div>
          <div className="setting-desc">{t('settings.theme.desc')}</div>
        </div>
        <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
          <option value="dark">{t('settings.theme.dark')}</option>
          <option value="light">{t('settings.theme.light')}</option>
          <option value="system">{t('settings.theme.system')}</option>
        </select>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.tabHeader')}</div>
          <div className="setting-desc">{t('settings.tabHeader.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={showTabHeader} onChange={(e) => setShowTabHeader(e.target.checked)} />
          <span />
        </label>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.ribbon')}</div>
          <div className="setting-desc">{t('settings.ribbon.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={showRibbon} onChange={(e) => setShowRibbon(e.target.checked)} />
          <span />
        </label>
      </div>
    </div>
    <h3 className="settings-heading">{t('settings.site')}</h3>
    <div className="settings-group">
      <SiteTitleSetting />
    </div>
    <h3 className="settings-heading">{t('settings.font')}</h3>
    <div className="settings-group">
      <FontSetting kind="interface" />
      <FontSetting kind="text" />
      <FontSetting kind="monospace" />
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.fontSize')}</div>
          <div className="setting-desc">{t('settings.fontSize.desc')}</div>
        </div>
        <div className="setting-slider">
          <button
            className="icon-btn"
            title={t('settings.resetDefault')}
            disabled={fontSize === DEFAULT_FONT_SIZE}
            onClick={() => setFontSize(DEFAULT_FONT_SIZE)}
          >
            <IconReset size={16} />
          </button>
          <span className="setting-slider-value">{fontSize}</span>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={fontSize}
            style={{ '--slider-fill': `${fontPercent}%` } as CSSProperties}
            onChange={(e) => setFontSize(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.quickFont')}</div>
          <div className="setting-desc">{t('settings.quickFont.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={quickFontSize}
            onChange={(e) => setQuickFontSize(e.target.checked)}
          />
          <span />
        </label>
      </div>
    </div>
    </>
  );
}

function EditorSection() {
  const defaultEditMode = useStore((s) => s.defaultEditMode);
  const setDefaultEditMode = useStore((s) => s.setDefaultEditMode);
  const showInlineTitle = useStore((s) => s.showInlineTitle);
  const setShowInlineTitle = useStore((s) => s.setShowInlineTitle);
  const showLineNumbers = useStore((s) => s.showLineNumbers);
  const setShowLineNumbers = useStore((s) => s.setShowLineNumbers);
  const readableLineLength = useStore((s) => s.readableLineLength);
  const setReadableLineLength = useStore((s) => s.setReadableLineLength);
  const t = useT();
  return (
    <>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.defaultMode')}</div>
          <div className="setting-desc">{t('settings.defaultMode.desc')}</div>
        </div>
        <select
          value={defaultEditMode ? 'edit' : 'view'}
          onChange={(e) => setDefaultEditMode(e.target.value === 'edit')}
        >
          <option value="view">{t('settings.defaultMode.view')}</option>
          <option value="edit">{t('settings.defaultMode.edit')}</option>
        </select>
      </div>
    </div>
    <h3 className="settings-heading">{t('settings.display')}</h3>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.inlineTitle')}</div>
          <div className="setting-desc">{t('settings.inlineTitle.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={showInlineTitle} onChange={(e) => setShowInlineTitle(e.target.checked)} />
          <span />
        </label>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.readableLine')}</div>
          <div className="setting-desc">{t('settings.readableLine.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input
            type="checkbox"
            checked={readableLineLength}
            onChange={(e) => setReadableLineLength(e.target.checked)}
          />
          <span />
        </label>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.lineNumbers')}</div>
          <div className="setting-desc">{t('settings.lineNumbers.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={showLineNumbers} onChange={(e) => setShowLineNumbers(e.target.checked)} />
          <span />
        </label>
      </div>
    </div>
    </>
  );
}

type AttachmentMode = 'root' | 'same' | 'sub' | 'folder';

// Traduce `attachmentFolderPath` de Obsidian a la opción del desplegable y su carpeta
const parseAttachmentSetting = (value: string): { mode: AttachmentMode; folder: string } => {
  if (value === '' || value === '/') return { mode: 'root', folder: '' };
  if (value === '.' || value === './') return { mode: 'same', folder: '' };
  if (value.startsWith('./')) return { mode: 'sub', folder: value.slice(2) };
  return { mode: 'folder', folder: value };
};

const buildAttachmentSetting = (mode: AttachmentMode, folder: string) => {
  const name = folder.trim().replace(/^\/+|\/+$/g, '') || 'attachments';
  if (mode === 'root') return '/';
  if (mode === 'same') return './';
  return mode === 'sub' ? `./${name}` : name;
};

// Se guarda en .obsidian/app.json del vault, compartido con Obsidian de escritorio
function AttachmentsSetting() {
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<AttachmentMode>('root');
  const [folder, setFolder] = useState('');
  const [savedFolder, setSavedFolder] = useState('');
  const [error, setError] = useState('');
  const t = useT();

  useEffect(() => {
    settingsApi
      .getAttachments()
      .then((r) => {
        const parsed = parseAttachmentSetting(r.attachmentFolderPath);
        setMode(parsed.mode);
        setFolder(parsed.folder);
        setSavedFolder(parsed.folder);
        setLoaded(true);
      })
      .catch((err) => setError(err.message));
  }, []);

  const save = async (newMode: AttachmentMode, newFolder: string) => {
    setError('');
    try {
      const r = await settingsApi.setAttachments(buildAttachmentSetting(newMode, newFolder));
      const parsed = parseAttachmentSetting(r.attachmentFolderPath);
      setMode(parsed.mode);
      setFolder(parsed.folder);
      setSavedFolder(parsed.folder);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveFolder = () => folder.trim() !== savedFolder && save(mode, folder);

  return (
    <>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.attachments')}</div>
          <div className="setting-desc">{t('settings.attachments.desc')}</div>
          {error && <div className="setting-desc" style={{ color: 'var(--text-error, #e5484d)' }}>{error}</div>}
        </div>
        <select
          value={mode}
          disabled={!loaded}
          onChange={(e) => save(e.target.value as AttachmentMode, folder)}
        >
          <option value="root">{t('settings.attachments.root')}</option>
          <option value="same">{t('settings.attachments.same')}</option>
          <option value="sub">{t('settings.attachments.sub')}</option>
          <option value="folder">{t('settings.attachments.folder')}</option>
        </select>
      </div>
      {(mode === 'sub' || mode === 'folder') && (
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">
              {mode === 'sub' ? t('settings.attachments.subName') : t('settings.attachments.folderPath')}
            </div>
            <div className="setting-desc">
              {mode === 'sub'
                ? t('settings.attachments.subDesc', { folder: folder || 'attachments' })
                : t('settings.attachments.folderDesc')}
            </div>
          </div>
          <input
            className="setting-input"
            type="text"
            placeholder="attachments"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={saveFolder}
            onKeyDown={(e) => e.key === 'Enter' && saveFolder()}
          />
        </div>
      )}
    </>
  );
}

// Extensiones que se pueden subir arrastrando archivos al explorador (se guarda en el servidor)
function UploadsSetting() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const t = useT();

  const apply = (r: UploadExtensions) => {
    const text = r.extensions.map((e) => `.${e}`).join(', ');
    setValue(text);
    setSaved(text);
    setIsDefault(r.extensions.join() === r.defaults.join());
    setLoaded(true);
  };

  useEffect(() => {
    settingsApi.getUploads().then(apply).catch((err) => setError(err.message));
  }, []);

  const save = async (text: string) => {
    if (text.trim() === saved) return setValue(saved);
    setError('');
    try {
      apply(await settingsApi.setUploads(text));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.uploads')}</div>
          <div className="setting-desc">
            <Trans k="settings.uploads.desc" values={{ a: <code>.txt, .pdf</code> }} />
          </div>
          {error && <div className="setting-desc" style={{ color: 'var(--text-error, #e5484d)' }}>{error}</div>}
        </div>
        <button className="icon-btn" title={t('settings.resetDefault')} disabled={!loaded || isDefault} onClick={() => save('')}>
          <IconReset size={16} />
        </button>
      </div>
      <div className="setting-item">
        <input
          className="setting-input"
          type="text"
          disabled={!loaded}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => save(value)}
          onKeyDown={(e) => e.key === 'Enter' && save(value)}
        />
      </div>
    </>
  );
}

type NotesGroup = keyof NotesConfig;

// Campo de texto que se guarda al salir de él o al pulsar Intro
function NotesField({
  name,
  desc,
  placeholder,
  value,
  disabled,
  onSave,
}: {
  name: string;
  desc: React.ReactNode;
  placeholder?: string;
  value: string;
  disabled: boolean;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => text.trim() !== value && onSave(text.trim());
  return (
    <div className="setting-item">
      <div className="setting-info">
        <div className="setting-name">{name}</div>
        <div className="setting-desc">{desc}</div>
      </div>
      <input
        className="setting-input"
        type="text"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
    </div>
  );
}

// Notas diarias y plantillas: se guardan en .obsidian/daily-notes.json y templates.json,
// compartidos con los plugins de Obsidian de escritorio
function NotesSettings() {
  const [config, setConfig] = useState<NotesConfig | null>(null);
  const [error, setError] = useState('');
  const t = useT();

  useEffect(() => {
    settingsApi
      .getNotes()
      .then(setConfig)
      .catch((err) => setError(err.message));
  }, []);

  const save = async <G extends NotesGroup>(group: G, key: keyof NotesConfig[G], value: string) => {
    setError('');
    try {
      setConfig(await settingsApi.setNotes({ [group]: { [key]: value } } as NotesConfigUpdate));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const now = new Date();
  const preview = (format: string, fallback: string) => (
    <>
      <Trans
        k="settings.notes.formatPreview"
        values={{ example: <code>{fallback}</code>, preview: <strong>{formatMoment(now, format || fallback)}</strong> }}
      />
    </>
  );
  const disabled = !config;
  const daily = config?.dailyNotes ?? { folder: '', format: '', template: '' };
  const templates = config?.templates ?? { folder: '', dateFormat: '', timeFormat: '' };

  return (
    <>
      <h3 className="settings-heading">{t('settings.daily')}</h3>
      {error && <div className="setting-desc" style={{ color: 'var(--text-error, #e5484d)' }}>{error}</div>}
      <div className="settings-group">
      <NotesField
        name={t('settings.dateFormat')}
        desc={<>{preview(daily.format, DEFAULT_DAILY_FORMAT)}. <Trans k="settings.daily.subfolders" values={{ example: <code>YYYY/MM/YYYY-MM-DD</code> }} /></>}
        placeholder={DEFAULT_DAILY_FORMAT}
        value={daily.format}
        disabled={disabled}
        onSave={(v) => save('dailyNotes', 'format', v)}
      />
      <NotesField
        name={t('settings.daily.folder')}
        desc={t('settings.daily.folder.desc')}
        placeholder={t('settings.daily.folder.placeholder')}
        value={daily.folder}
        disabled={disabled}
        onSave={(v) => save('dailyNotes', 'folder', v)}
      />
      <NotesField
        name={t('settings.daily.template')}
        desc={t('settings.daily.template.desc')}
        placeholder={t('settings.daily.template.placeholder')}
        value={daily.template}
        disabled={disabled}
        onSave={(v) => save('dailyNotes', 'template', v)}
      />
      </div>

      <h3 className="settings-heading">{t('settings.templates')}</h3>
      <div className="settings-group">
      <NotesField
        name={t('settings.templates.folder')}
        desc={t('settings.templates.folder.desc')}
        placeholder={t('settings.templates.folder.placeholder')}
        value={templates.folder}
        disabled={disabled}
        onSave={(v) => save('templates', 'folder', v)}
      />
      <NotesField
        name={t('settings.dateFormat')}
        desc={<>{preview(templates.dateFormat, DEFAULT_DATE_FORMAT)}. <Trans k="settings.templates.usedIn" values={{ variable: <code>{'{{date}}'}</code> }} /></>}
        placeholder={DEFAULT_DATE_FORMAT}
        value={templates.dateFormat}
        disabled={disabled}
        onSave={(v) => save('templates', 'dateFormat', v)}
      />
      <NotesField
        name={t('settings.timeFormat')}
        desc={<>{preview(templates.timeFormat, DEFAULT_TIME_FORMAT)}. <Trans k="settings.templates.usedIn" values={{ variable: <code>{'{{time}}'}</code> }} /></>}
        placeholder={DEFAULT_TIME_FORMAT}
        value={templates.timeFormat}
        disabled={disabled}
        onSave={(v) => save('templates', 'timeFormat', v)}
      />
      </div>
    </>
  );
}

function FilesSection() {
  const hiddenFolders = useStore((s) => s.hiddenFolders);
  const setHiddenFolders = useStore((s) => s.setHiddenFolders);
  const hiddenExtensions = useStore((s) => s.hiddenExtensions);
  const setHiddenExtensions = useStore((s) => s.setHiddenExtensions);
  const [vaultPath, setVaultPath] = useState('');
  const [savedPath, setSavedPath] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultError, setVaultError] = useState('');
  const [saving, setSaving] = useState(false);
  const [includeGit, setIncludeGit] = useState(false);
  const [includeTrash, setIncludeTrash] = useState(false);
  const t = useT();

  useEffect(() => {
    settingsApi
      .getVault()
      .then((r) => {
        setVaultPath(r.vaultPath);
        setSavedPath(r.vaultPath);
      })
      .catch((err) => setVaultError(err.message));
  }, []);

  const saveVault = async () => {
    setVaultError('');
    setSaving(true);
    try {
      await settingsApi.setVault(vaultPath.trim(), vaultPassword);
      // Recargar para descartar pestañas y árbol de la bóveda anterior
      window.location.reload();
    } catch (err) {
      setVaultError((err as Error).message);
      setSaving(false);
    }
  };

  // Enlace directo: el navegador descarga el ZIP por streaming sin guardarlo en memoria
  const downloadUrl = settingsApi.downloadVaultUrl({ git: includeGit, trash: includeTrash });

  return (
    <>
    <h3 className="settings-heading settings-heading-first">{t('settings.files.vault')}</h3>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.vaultPath')}</div>
          <div className="setting-desc">{t('settings.vaultPath.desc')}</div>
          {vaultError && <div className="setting-desc" style={{ color: 'var(--text-error, #e5484d)' }}>{vaultError}</div>}
        </div>
      </div>
      <div className="setting-item">
        <input
          className="setting-input"
          type="text"
          value={vaultPath}
          onChange={(e) => setVaultPath(e.target.value)}
          disabled={saving}
        />
      </div>
      {vaultPath.trim() !== savedPath && (
        <div className="setting-item">
          <input
            className="setting-input"
            type="password"
            placeholder={t('password.current')}
            autoComplete="current-password"
            value={vaultPassword}
            onChange={(e) => setVaultPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && vaultPath.trim() && vaultPassword && saveVault()}
            disabled={saving}
          />
          <button onClick={saveVault} disabled={saving || !vaultPath.trim() || !vaultPassword}>
            {t('common.save')}
          </button>
        </div>
      )}
    </div>

    <h3 className="settings-heading">{t('settings.files.download')}</h3>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.download.git')}</div>
          <div className="setting-desc">{t('settings.download.git.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={includeGit} onChange={(e) => setIncludeGit(e.target.checked)} />
          <span />
        </label>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.download.trash')}</div>
          <div className="setting-desc">{t('settings.download.trash.desc')}</div>
        </div>
        <label className="setting-toggle">
          <input type="checkbox" checked={includeTrash} onChange={(e) => setIncludeTrash(e.target.checked)} />
          <span />
        </label>
      </div>
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('common.download')}</div>
          <div className="setting-desc">{t('settings.download.desc')}</div>
        </div>
        <a className="button" href={downloadUrl} download>
          {t('common.download')}
        </a>
      </div>
    </div>

    <h3 className="settings-heading">{t('settings.files.attachments')}</h3>
    <div className="settings-group">
      <AttachmentsSetting />
      <UploadsSetting />
    </div>

    <h3 className="settings-heading">{t('settings.files.explorer')}</h3>
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.hiddenFolders')}</div>
          <div className="setting-desc">
            <Trans k="settings.hiddenFolders.desc" values={{ a: <code>{t('settings.hiddenFolders.example')}</code>, b: <code>_*</code> }} />
          </div>
        </div>
      </div>
      <textarea
        className="setting-textarea"
        rows={6}
        placeholder={`${t('settings.hiddenFolders.example')}\n_*`}
        value={hiddenFolders}
        onChange={(e) => setHiddenFolders(e.target.value)}
      />
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('settings.hiddenExtensions')}</div>
          <div className="setting-desc">
            <Trans k="settings.hiddenExtensions.desc" values={{ a: <code>.txt, .pdf</code> }} />
          </div>
        </div>
      </div>
      <div className="setting-item">
        <input
          className="setting-input"
          type="text"
          placeholder=".txt, .pdf"
          value={hiddenExtensions}
          onChange={(e) => setHiddenExtensions(e.target.value)}
        />
      </div>
    </div>

    <NotesSettings />
    </>
  );
}

const INTERVAL_OPTIONS: { value: number; label: MessageKey; n?: number }[] = [
  { value: 0, label: 'sync.interval.manual' },
  { value: 5, label: 'sync.interval.minutes', n: 5 },
  { value: 15, label: 'sync.interval.minutes', n: 15 },
  { value: 30, label: 'sync.interval.minutes', n: 30 },
  { value: 60, label: 'sync.interval.hour' },
  { value: 180, label: 'sync.interval.hours', n: 3 },
  { value: 1440, label: 'sync.interval.day' },
];

const errorStyle = { color: 'var(--text-error, #e5484d)' };
const fieldStyle = { flex: '0 1 280px', minWidth: 0 };

const formatDate = (iso: string | null, never: string) => (iso ? new Date(iso).toLocaleString(getLang()) : never);

// La configuración y el token se guardan en el servidor (data/sync.json);
// el token nunca vuelve al navegador, solo si está guardado
function SyncSection() {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [provider, setProvider] = useState<SyncProvider>('none');
  const [interval, setIntervalValue] = useState(0);
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();

  const applyConfig = (c: SyncConfig, p: SyncProvider = c.provider) => {
    setConfig(c);
    setProvider(p);
    setIntervalValue(c.interval);
    setRepo(c.github.repo);
    setBranch(c.github.branch);
    setGithubToken('');
  };

  useEffect(() => {
    syncApi
      .get()
      .then((c) => applyConfig(c))
      .catch((err) => setMessage({ error: true, text: err.message }));
  }, []);

  // Si hay una sincronización automática en marcha, se sigue su estado
  const running = Boolean(config?.status.running);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      syncApi.get().then((c) => setConfig((prev) => (prev ? { ...prev, status: c.status } : c))).catch(() => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [running]);

  const changeProvider = (p: SyncProvider) => {
    setMessage(null);
    if (config) applyConfig(config, p);
    else setProvider(p);
  };

  const dirty =
    !!config &&
    (provider !== config.provider ||
      interval !== config.interval ||
      (provider === 'github' &&
        (repo.trim() !== config.github.repo || branch.trim() !== config.github.branch || githubToken.trim() !== '')));

  const save = async () => {
    setMessage(null);
    setBusy(true);
    const changes: SyncConfigUpdate = { provider, interval };
    if (provider === 'github') changes.github = { repo: repo.trim(), branch: branch.trim(), token: githubToken.trim() };
    try {
      applyConfig(await syncApi.configure(changes));
      setMessage({ error: false, text: t('common.saved') });
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
    }
    setBusy(false);
  };

  const forgetToken = async () => {
    setMessage(null);
    try {
      applyConfig(await syncApi.configure({ github: { token: null } }), provider);
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
    }
  };

  const syncNow = async () => {
    setMessage(null);
    setBusy(true);
    setConfig((prev) => (prev ? { ...prev, status: { ...prev.status, running: true } } : prev));
    try {
      // Avisa del resultado y recarga el árbol, que puede haber traído notas nuevas o cambiadas
      setConfig(await runSync());
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
    }
    setBusy(false);
  };

  if (!config) {
    return message ? <div className="setting-desc" style={errorStyle}>{message.text}</div> : null;
  }

  const hasToken = provider === 'github' && config.github.hasToken;
  const status = config.status;

  return (
    <>
      <div className="settings-group">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">{t('sync.service')}</div>
            <div className="setting-desc">{t('sync.service.desc')}</div>
          </div>
          <select value={provider} onChange={(e) => changeProvider(e.target.value as SyncProvider)} disabled={busy}>
            <option value="none">{t('sync.disabled')}</option>
            <option value="github">GitHub</option>
          </select>
        </div>
        {provider !== 'none' && (
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-name">{t('sync.auto')}</div>
              <div className="setting-desc">{t('sync.auto.desc')}</div>
            </div>
            <select value={interval} onChange={(e) => setIntervalValue(Number(e.target.value))} disabled={busy}>
              {INTERVAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label, { n: o.n ?? 0 })}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {provider === 'github' && (
        <>
          <h3 className="settings-heading">GitHub</h3>
          <div className="settings-group">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('sync.repo')}</div>
                <div className="setting-desc">
                  <Trans k="sync.repo.desc" values={{ example: <code>{t('sync.repo.example')}</code> }} />
                </div>
              </div>
              <input
                className="setting-input"
                style={fieldStyle}
                type="text"
                placeholder={t('sync.repo.placeholder')}
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('sync.branch')}</div>
              </div>
              <input
                className="setting-input"
                style={fieldStyle}
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('sync.token')}</div>
                <div className="setting-desc">
                  <Trans
                    k="sync.token.desc"
                    values={{ tokens: <em>Fine-grained tokens</em>, permission: <em>Contents: Read and write</em> }}
                  />
                  {hasToken && ` ${t('sync.token.saved')}`}
                </div>
              </div>
              <input
                className="setting-input"
                style={fieldStyle}
                type="password"
                autoComplete="off"
                placeholder={hasToken ? `•••••••• (${t('sync.token.savedShort')})` : 'github_pat_…'}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="setting-desc" style={{ marginTop: 8 }}>
            <Trans k="sync.howItWorks" values={{ trash: <code>.trash/</code> }} />
          </div>
        </>
      )}


      <div className="setting-item" style={{ borderBottom: 'none' }}>
        <div className="setting-info">
          {message && (
            <div className="setting-desc" style={message.error ? errorStyle : undefined}>
              {message.text}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasToken && (
            <button onClick={forgetToken} disabled={busy}>
              {t('sync.forgetToken')}
            </button>
          )}
          <button onClick={save} disabled={busy || !dirty}>
            {t('common.save')}
          </button>
        </div>
      </div>

      {config.provider !== 'none' && (
        <>
          <h3 className="settings-heading">{t('sync.status')}</h3>
          <div className="settings-group">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">
                  {status.running ? t('sync.running') : t('sync.last', { date: formatDate(status.lastSync, t('sync.never')) })}
                </div>
                {!status.running && status.lastError && (
                  <div className="setting-desc" style={errorStyle}>
                    Error ({formatDate(status.lastAttempt, t('sync.never'))}): {status.lastError}
                  </div>
                )}
                {!status.running && !status.lastError && status.lastMessage && (
                  <div className="setting-desc">{status.lastMessage}</div>
                )}
              </div>
              <button onClick={syncNow} disabled={busy || status.running || dirty} title={dirty ? t('sync.saveFirst') : undefined}>
                {t('sync.now')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Límites del servidor (variables de entorno); null mientras se cargan o si falla la petición
function useServerLimits() {
  const [limits, setLimits] = useState<ServerLimits | null>(null);
  useEffect(() => {
    settingsApi.getLimits().then(setLimits).catch(() => {});
  }, []);
  return limits;
}

function SecuritySection() {
  const limits = useServerLimits();
  const MIN_PASSWORD_LENGTH = limits?.minPasswordLength ?? 12;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const t = useT();

  const mismatch = confirm !== '' && next !== confirm;
  const canSave = !busy && current && next.length >= MIN_PASSWORD_LENGTH && next === confirm;

  const changePassword = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await settingsApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ error: false, text: t('security.changed') });
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
    }
    setBusy(false);
  };

  const revokeSessions = async () => {
    setBusy(true);
    try {
      await settingsApi.revokeSessions();
      window.location.reload();
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
      setBusy(false);
    }
  };

  return (
    <>
      <div className="settings-group">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">{t('security.changePassword')}</div>
            <div className="setting-desc">{t('security.changePassword.desc', { n: MIN_PASSWORD_LENGTH })}</div>
            {message && (
              <div className="setting-desc" style={message.error ? { color: 'var(--text-error, #e5484d)' } : undefined}>
                {message.text}
              </div>
            )}
          </div>
        </div>
        <div className="setting-item">
          <input
            className="setting-input"
            type="password"
            placeholder={t('password.current')}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="setting-item">
          <input
            className="setting-input"
            type="password"
            placeholder={t('password.new')}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="setting-item">
          <input
            className="setting-input"
            type="password"
            placeholder={mismatch ? t('password.mismatch') : t('password.repeat')}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSave && changePassword()}
            disabled={busy}
            style={mismatch ? { borderColor: 'var(--text-error, #e5484d)' } : undefined}
          />
          <button onClick={changePassword} disabled={!canSave}>
            {t('security.change')}
          </button>
        </div>
      </div>
      <div className="settings-group">
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name">{t('security.revoke')}</div>
            <div className="setting-desc">
              {t('security.revoke.desc', { max: limits?.sessionMaxDays ?? 30, idle: limits?.sessionIdleDays ?? 7 })}
            </div>
          </div>
          {confirmRevoke ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmRevoke(false)} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button onClick={revokeSessions} disabled={busy}>
                {t('common.confirm')}
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmRevoke(true)}>{t('security.revokeAll')}</button>
          )}
        </div>
      </div>
    </>
  );
}

// Las teclas con nombre propio en cada idioma (Mayús, Retroceso) van como clave de traducción
const SHIFT: MessageKey = 'key.shift';
const BACKSPACE: MessageKey = 'key.backspace';

const SHORTCUT_GROUPS: { title: MessageKey; items: { keys: string[]; desc: MessageKey }[] }[] = [
  {
    title: 'shortcuts.general',
    items: [
      { keys: ['Ctrl', 'P'], desc: 'shortcuts.quickOpen' },
      { keys: ['Ctrl', 'S'], desc: 'shortcuts.save' },
      { keys: ['Ctrl', 'E'], desc: 'shortcuts.toggleMode' },
      { keys: ['Ctrl', 'B'], desc: 'shortcuts.toggleSidebar' },
      { keys: ['Esc'], desc: 'shortcuts.close' },
    ],
  },
  {
    title: 'shortcuts.file',
    items: [
      { keys: ['F2'], desc: 'shortcuts.rename' },
      { keys: ['Ctrl', SHIFT, 'M'], desc: 'shortcuts.move' },
      { keys: ['Ctrl', SHIFT, BACKSPACE], desc: 'shortcuts.delete' },
    ],
  },
  {
    title: 'shortcuts.findInNote',
    items: [
      { keys: ['Ctrl', 'F'], desc: 'shortcuts.openFind' },
      { keys: ['Enter'], desc: 'shortcuts.nextResultShift' },
      { keys: ['F3'], desc: 'shortcuts.nextResult' },
      { keys: [SHIFT, 'F3'], desc: 'shortcuts.prevResult' },
    ],
  },
  {
    title: 'quickOpen.title',
    items: [
      { keys: ['↑', '↓'], desc: 'shortcuts.moveResults' },
      { keys: ['Enter'], desc: 'shortcuts.openSelected' },
    ],
  },
  {
    title: 'props.title',
    items: [
      { keys: ['Enter'], desc: 'shortcuts.addValue' },
      { keys: [','], desc: 'shortcuts.addListValue' },
      { keys: [BACKSPACE], desc: 'shortcuts.removeLast' },
      { keys: ['Esc'], desc: 'shortcuts.cancelProperty' },
    ],
  },
];

function ShortcutsSection() {
  const t = useT();
  const keyName = (k: string) => (k === SHIFT || k === BACKSPACE ? t(k) : k);
  return (
    <>
      <div className="setting-desc" style={{ marginBottom: 12 }}>
        {t('shortcuts.mac')}
      </div>
      {SHORTCUT_GROUPS.map((group) => (
        <div className="settings-group" key={group.title}>
          <div className="settings-nav-title">{t(group.title)}</div>
          {group.items.map((item) => (
            <div className="setting-item" key={item.desc}>
              <div className="setting-info">
                <div className="setting-name">{t(item.desc)}</div>
              </div>
              <div className="shortcut-keys">
                {item.keys.map((k, i) => (
                  <span key={i}>
                    {i > 0 && ' + '}
                    <kbd>{keyName(k)}</kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function AboutSection() {
  const t = useT();
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    settingsApi.getUpdate().then(setUpdate).catch(() => {});
  }, []);

  const updateText = !update
    ? null
    : !update.enabled
      ? t('about.updateDisabled')
      : !update.latest
        ? t('about.updateUnknown')
        : update.updateAvailable
          ? null
          : t('about.upToDate');

  return (
    <div className="settings-group">
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">{t('about.version', { version: __APP_VERSION__ })}</div>
          <div className="setting-desc">Obsidita{updateText && ` · ${updateText}`}</div>
        </div>
      </div>
      {update?.updateAvailable && update.latest && (
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-name" style={{ color: 'var(--interactive-accent)' }}>
              {t('about.updateAvailable', { version: update.latest })}
            </div>
            <div className="setting-desc">{t('about.updateDesc')}</div>
          </div>
          <button onClick={() => window.open(update.url, '_blank', 'noopener,noreferrer')}>{t('about.viewOnGithub')}</button>
        </div>
      )}
      <div className="setting-item">
        <div className="setting-info">
          <div className="setting-name">
            {t('about.developedBy')} <a href="https://github.com/loft17" target="_blank" rel="noopener noreferrer"><strong>Jose Luis Romera</strong></a>
          </div>
          <div className="setting-desc">{t('about.tagline')}</div>
        </div>
      </div>
    </div>
  );
}

function VariablesSection() {
  const limits = useServerLimits();
  const t = useT();
  const rows: [string, string, string][] = limits
    ? [
        [t('limits.maxNote'), `${limits.maxNoteMB} MB`, 'MAX_NOTE_MB'],
        [t('limits.maxUpload'), `${limits.maxUploadMB} MB`, 'MAX_UPLOAD_MB'],
        [t('limits.minPassword'), t('limits.chars', { n: limits.minPasswordLength }), 'MIN_PASSWORD_LENGTH'],
        [t('limits.maxQuery'), t('limits.chars', { n: limits.searchMaxQueryLength }), 'SEARCH_MAX_QUERY_LENGTH'],
        [t('limits.skippedNotes'), t('limits.moreThanMB', { n: limits.searchMaxFileMB }), 'SEARCH_MAX_FILE_MB'],
        [t('limits.indexedNotes'), `${limits.searchMaxScannedMB} MB`, 'SEARCH_MAX_SCANNED_MB'],
        [t('limits.searchRate'), `${limits.searchRateMax}`, 'SEARCH_RATE_MAX'],
        [t('limits.searchResults'), t('limits.files', { n: limits.searchMaxResults }), 'SEARCH_MAX_RESULTS'],
        [t('limits.matchesPerFile'), `${limits.searchMaxMatchesPerFile}`, 'SEARCH_MAX_MATCHES_PER_FILE'],
        [t('limits.sessionMax'), t('limits.days', { n: limits.sessionMaxDays }), 'SESSION_MAX_DAYS'],
        [t('limits.sessionIdle'), t('limits.days', { n: limits.sessionIdleDays }), 'SESSION_IDLE_DAYS'],
      ]
    : [];

  return (
    <>
      {limits && (
        <div className="settings-group">
          <div className="settings-nav-title">{t('limits.title')}</div>
          <div className="setting-desc" style={{ marginBottom: 8 }}>
            <Trans k="limits.desc" values={{ file: <code>.env.example</code> }} />
          </div>
          {rows.map(([name, value, env]) => (
            <div className="setting-item" key={env}>
              <div className="setting-info">
                <div className="setting-name">{name}</div>
                <div className="setting-desc">
                  <code>{env}</code>
                </div>
              </div>
              <div>{value}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function SettingsModal({ onClose }: Props) {
  const [section, setSection] = useState('about');
  const [query, setQuery] = useState('');
  // En el móvil no caben la lista y la sección a la vez: primero la lista y luego la sección elegida
  const mobile = useIsMobile();
  const [showSection, setShowSection] = useState(false);
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections = SECTIONS.filter((s) => t(s.label).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-titlebar">
          {mobile && showSection ? (
            <button className="settings-back" onClick={() => setShowSection(false)}>
              <IconChevronLeft size={16} />
              <span>{t(SECTIONS.find((s) => s.id === section)!.label)}</span>
            </button>
          ) : (
            <span>{t('settings.title')}</span>
          )}
          <button className="icon-btn" title={t('common.close')} onClick={onClose}>
            <IconClose size={16} />
          </button>
        </div>
        <div className={`settings-body ${mobile ? (showSection ? 'mobile-section' : 'mobile-nav') : ''}`}>
          <nav className="settings-sidebar">
            <div className="settings-search">
              <IconSearch size={14} />
              <input
                placeholder={t('settings.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="settings-nav-title">{t('settings.options')}</div>
            {sections.map(({ id, label, Icon }) => (
              <div
                key={id}
                className={`settings-nav-item ${section === id ? 'active' : ''}`}
                onClick={() => {
                  setSection(id);
                  setShowSection(true);
                }}
              >
                <Icon size={16} />
                <span>{t(label)}</span>
              </div>
            ))}
          </nav>
          <div className="settings-content">
            {section === 'about' && <AboutSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'editor' && <EditorSection />}
            {section === 'files' && <FilesSection />}
            {section === 'sync' && <SyncSection />}
            {section === 'security' && <SecuritySection />}
            {section === 'shortcuts' && <ShortcutsSection />}
            {section === 'variables' && <VariablesSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
