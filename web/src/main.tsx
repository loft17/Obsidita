import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { fitToVisualViewport } from './mobile';
import { i18nReady } from './i18n';
import { useStore } from './store';
import { themeStyleReady } from './themes';

fitToVisualViewport();

// Soltar un archivo fuera del editor no debe hacer que el navegador lo abra (y abandone la app)
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
}

// Advertir si el usuario intenta cerrar la ventana con cambios sin guardar
window.addEventListener('beforeunload', (e) => {
  const tabs = useStore.getState().tabs;
  const hasUnsavedChanges = tabs.some((t) => t.isDirty);
  if (hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// Se pinta cuando el idioma de la interfaz y el estilo visual están disponibles
Promise.all([i18nReady, themeStyleReady()]).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
