import { useState } from 'react';
import { authApi, ApiError } from '../api';
import { useT } from '../i18n';
import { useStore, DEFAULT_SITE_TITLE } from '../store';

interface Props {
  onComplete: () => void;
  // Error al arrancar (no se pudo conectar, fallo al cargar el árbol): se muestra aquí
  startupError?: string;
}

export default function Login({ onComplete, startupError }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = useT();
  const siteTitle = useStore((s) => s.siteTitle);
  const message = error || startupError || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError(t('login.required'));
      return;
    }

    setLoading(true);
    try {
      await authApi.login(password);
      onComplete();
    } catch (err) {
      setError((err instanceof ApiError && err.data.error) || t('login.wrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-form">
        <h1>{siteTitle || DEFAULT_SITE_TITLE}</h1>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', marginBottom: '16px' }}>{t('login.prompt')}</p>

        {message && <div className="error">{message}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="password"
            placeholder={t('common.password')}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? t('login.verifying') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
