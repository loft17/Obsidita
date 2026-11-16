// CSS propio del usuario (data/custom.css en el servidor): se aplica en una <style> al final del
// <head>, así que gana sobre el tema. Se carga una vez por sesión de la página.
import { settingsApi } from './api';
import { createLogger } from './logger';

const log = createLogger('CustomCss');
const STYLE_ID = 'custom-css';
let loading = false;
let loaded = false;

// Pone el CSS en la página (vacío = quita la hoja)
export function applyCustomCss(css: string) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css.trim()) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export function ensureCustomCss() {
  if (loading || loaded) return;
  loading = true;
  settingsApi
    .getCustomCss()
    .then((css) => {
      loaded = true;
      applyCustomCss(css);
    })
    .catch((err) => log.warn('No se pudo cargar data/custom.css:', err))
    .finally(() => {
      loading = false;
    });
}
