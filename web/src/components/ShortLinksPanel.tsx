// Panel de enlaces cortos (vista propia de la barra izquierda): lista con copiar y borrar, y el formulario
// para crear uno (con código propio o aleatorio)
import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { linksApi } from '../api';
import type { ShortLink } from '../types';
import { useT } from '../i18n';
import { notify } from '../toast';
import { copyText } from '../clipboard';
import { shortLinkUrl } from '../shortLinks';
import { IconClose, IconLink } from './Icons';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function ShortLinksPanel() {
  const tree = useStore((s) => s.tree);
  const [links, setLinks] = useState<ShortLink[] | null>(null);
  const [path, setPath] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();

  const load = async () => {
    try {
      setLinks((await linksApi.list()).links);
    } catch (err) {
      setError(errorText(err));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const target = path.trim();
    if (!target) return setError(t('shortlink.pathRequired'));
    setBusy(true);
    try {
      const { link } = await linksApi.create(target, code.trim() || undefined);
      setPath('');
      setCode('');
      setError('');
      await copyText(shortLinkUrl(link.code)).catch(() => {});
      notify('shortlink', t('shortlink.created', { url: shortLinkUrl(link.code) }));
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (link: ShortLink) => {
    try {
      await linksApi.remove(link.code);
      setError('');
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const copy = async (link: ShortLink) => {
    await copyText(shortLinkUrl(link.code)).catch(() => {});
    notify('shortlink', t('shortlink.copied'));
  };

  return (
    <div className="shortlink-panel">
      <div className="sidebar-title shortlink-section-head">
        <IconLink size={14} />
        <span>{t('shortlink.title')}</span>
        {links && <span className="bookmark-count">{links.length}</span>}
      </div>
      <>
          {error && <div className="dropdown-empty">{error}</div>}
          <div className="shortlink-list">
            {links === null ? (
              <div className="dropdown-empty">{t('common.loading')}</div>
            ) : links.length === 0 ? (
              <div className="dropdown-empty">{t('shortlink.empty')}</div>
            ) : (
              links.map((link) => {
                const broken = !tree.some((i) => i.path === link.path);
                return (
                  <div key={link.code} className={`bookmark-row ${broken ? 'is-broken' : ''}`}>
                    <span className="bookmark-open" title={link.path}>
                      <span className="tree-label">
                        /{link.code}
                        <span className="bookmark-sub">{link.path}</span>
                      </span>
                    </span>
                    {broken && <span className="bookmark-missing">{t('bookmarks.missingBadge')}</span>}
                    <span className="bookmark-actions">
                      <button className="icon-btn" title={t('shortlink.copy')} onClick={() => copy(link)}>
                        <IconLink size={14} />
                      </button>
                      <button className="icon-btn" title={t('shortlink.delete')} onClick={() => remove(link)}>
                        <IconClose size={14} />
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <form onSubmit={create} className="shortlink-form">
            <input
              className="file-dialog-input"
              list="shortlink-paths"
              aria-label={t('shortlink.path')}
              placeholder={t('shortlink.pathPlaceholder')}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <datalist id="shortlink-paths">
              {tree
                .filter((i) => i.type !== 'other')
                .map((i) => (
                  <option key={i.path} value={i.path} />
                ))}
            </datalist>
            <input
              className="file-dialog-input"
              aria-label={t('shortlink.code')}
              placeholder={t('shortlink.codePlaceholder')}
              value={code}
              maxLength={32}
              onChange={(e) => setCode(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {t('common.create')}
            </button>
          </form>
      </>
    </div>
  );
}
