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
          setError('');
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
      setError('');
      setAppState('main');
    } catch (err: any) {
      // Sin esto, un fallo al cargar el árbol dejaba al usuario en el login sin explicación
      console.error('Failed to load tree:', err);
      setError(`Error: ${err?.message || t('app.connectError')}`);
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
      {/* El error se muestra también fuera de la carga: si no, cualquier fallo al arrancar
          (o al entrar) dejaba al usuario en la pantalla de configuración sin saber por qué */}
      {error && appState !== 'login' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'var(--color-red, #e5484d)', color: '#fff', padding: '8px 12px', fontSize: '13px', textAlign: 'center' }}>
          {error}
        </div>
      )}
      {appState === 'setup' && <Setup onComplete={handleSetupComplete} />}
      {appState === 'login' && <Login onComplete={handleLoginComplete} startupError={error} />}
      {appState === 'main' && (
        <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>{tr('common.loading')}</div>}>
          <MainLayout />
        </Suspense>
      )}
    </>
  );
}
