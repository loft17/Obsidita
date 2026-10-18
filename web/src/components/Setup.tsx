import { useEffect, useId, useState } from 'react';
import { setupApi } from '../api';
import { LANGUAGES, useI18n, useT, type Lang } from '../i18n';

interface Props {
  onComplete: () => void;
}

export default function Setup({ onComplete }: Props) {
  const [setupToken, setSetupToken] = useState('');
  const [vaultPath, setVaultPath] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [port, setPort] = useState('3000');
  const [error, setError] = useState('');
  const [minPasswordLength, setMinPasswordLength] = useState(12);
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const setLang = useI18n((s) => s.setLang);
  // Prefijo de los id que asocian cada <label> (y cada pista) con su campo
  const id = useId();

  useEffect(() => {
    setupApi
      .checkStatus()
      .then((s) => s.minPasswordLength && setMinPasswordLength(s.minPasswordLength))
      .catch(() => {});
  }, []);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!setupToken.trim()) {
      setError(t('setup.tokenRequired'));
      return;
    }
    if (!vaultPath.trim()) {
      setError(t('setup.vaultRequired'));
      return;
    }
    if (!password || password.length < minPasswordLength) {
      setError(t('password.tooShort', { n: minPasswordLength }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await setupApi.init(setupToken, vaultPath, password, parseInt(port));
      // Solo es un éxito si el servidor lo dice: dar por bueno cualquier respuesta sin `error`
      // hacía recargar la página ante un fallo, volviendo a la pantalla de configuración
      if (result.success === true) {
        onComplete();
      } else {
        setError(result.error || t('setup.error'));
        setLoading(false);
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || t('setup.error'));
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-form">
        <h1>{t('setup.title')}</h1>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '-8px' }}>{t('setup.subtitle')}</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit} className="setup-wizard">
          <div className="setup-wizard-field">
            <label htmlFor={`${id}-lang`}>{t('settings.language')}</label>
            <select id={`${id}-lang`} value={lang} onChange={(e) => setLang(e.target.value as Lang)} disabled={loading}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div className="setup-wizard-field">
            <label htmlFor={`${id}-token`}>{t('setup.token')}</label>
            <input
              id={`${id}-token`}
              aria-describedby={`${id}-token-hint`}
              type="text"
              autoComplete="off"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              disabled={loading}
            />
            <small id={`${id}-token-hint`} style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
              {t('setup.tokenHint')}
            </small>
          </div>

          <div className="setup-wizard-field">
            <label htmlFor={`${id}-vault`}>{t('setup.vaultPath')}</label>
            <input
              id={`${id}-vault`}
              aria-describedby={`${id}-vault-hint`}
              type="text"
              placeholder="/home/user/my-vault"
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              disabled={loading}
            />
            <small id={`${id}-vault-hint`} style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
              {t('setup.vaultHint')}
            </small>
          </div>

          <div className="setup-wizard-field">
            <label htmlFor={`${id}-password`}>{t('common.password')}</label>
            <input
              id={`${id}-password`}
              type="password"
              placeholder={t('password.min', { n: minPasswordLength })}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="setup-wizard-field">
            <label htmlFor={`${id}-confirm`}>{t('setup.confirmPassword')}</label>
            <input
              id={`${id}-confirm`}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="setup-wizard-field">
            <label htmlFor={`${id}-port`}>{t('setup.port')}</label>
            <input
              id={`${id}-port`}
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? t('setup.submitting') : t('setup.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
