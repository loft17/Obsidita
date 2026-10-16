import { lazy, Suspense, useEffect, useState } from 'react';
import { setupApi, authApi, filesApi } from './api';
import Setup from './components/Setup';
import Login from './components/Login';
import { useStore } from './store';
import { t, useT } from './i18n';

// La pantalla principal (editor, CodeMirror, markdown-it...) va en su propio archivo: el login
// y el setup cargan sin ella. Se empieza a descargar en cuanto se sabe que el vault está configurado
const loadMainLayout = () => import('./components/MainLayout');
const MainLayout = lazy(loadMainLayout);

type AppState = 'setup' | 'login' | 'main';

export default function App() {
  const [appState, setAppState] = useState<AppState>('setup');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const setTree = useStore((s) => s.setTree);
  const setSiteTitle = useStore((s) => s.setSiteTitle);
  const tr = useT();

  useEffect(() => {
    const init = async () => {
      try {
        const status = await setupApi.checkStatus();
        console.log('Setup status:', status);
        setSiteTitle(status.siteTitle || '');
        if (status.configured) {
          loadMainLayout().catch(() => {});
          // Si la cookie de sesión sigue siendo válida (p. ej. al recargar), entrar directamente
          try {
            const tree = await filesApi.getTree();
            setTree(tree);
            setAppState('main');
          } catch {
            setAppState('login');
          }
        } else {
          setAppState('setup');
        }
      } catch (err: any) {
        console.error('Init error:', err);
        setError(`Error: ${err.message || t('app.connectError')}`);
        setAppState('setup');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleSetupComplete = async () => {
    try {
      // Después del setup, necesitamos recargar la página o llamar a checkStatus de nuevo
      // porque el servidor ha actualizado su estado en memoria
      setTimeout(async () => {
        try {
          const tree = await filesApi.getTree();
          setTree(tree);
          setAppState('main');
        } catch (err) {
          console.log('Entrando a login después de setup');
          setAppState('login');
        }
      }, 500);
    } catch (err: any) {
      console.error('Setup completion error:', err);
    }
  };

  const handleLoginComplete = async () => {
    try {
      const tree = await filesApi.getTree();
      setTree(tree);
      setAppState('main');
    } catch (err) {
      console.error('Failed to load tree:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
        <div>{tr('common.loading')}</div>
        {error && <div style={{ color: 'var(--color-red)', fontSize: '12px' }}>{error}</div>}
      </div>
    );
  }

  return (
    <>
      {appState === 'setup' && <Setup onComplete={handleSetupComplete} />}
      {appState === 'login' && <Login onComplete={handleLoginComplete} />}
      {appState === 'main' && (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>{tr('common.loading')}</div>}>
          <MainLayout />
        </Suspense>
      )}
    </>
  );
}
