import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/obsidian.css';
import './fonts';
import { fitToVisualViewport } from './mobile';
import { i18nReady } from './i18n';

fitToVisualViewport();

// Soltar un archivo fuera del editor no debe hacer que el navegador lo abra (y abandone la app)
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
}

// Se pinta cuando el idioma de la interfaz está disponible
i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
