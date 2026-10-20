import { settingsApi } from '../api';
import { LANG_KEY, isLang, useI18n } from '../i18n';
import { createLogger } from '../logger';
import { useStore } from './index';
import { getSyncedKeys, readRaw, setSyncedChangeHandler, writeRaw } from './storage';

// Preferencias compartidas por todos los dispositivos: el servidor (data/prefs.json) manda y
// localStorage es la copia local, que permite pintar al instante con lo último conocido. Al
// entrar (y al volver a la pestaña) se descargan las del servidor; cada cambio se sube agrupado
const log = createLogger('Prefs');
const PUSH_DELAY = 500;

let pending: Record<string, string | null> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
// Solo con sesión: antes del login la API responde 401
let loggedIn = false;

const push = () => {
  clearTimeout(timer);
  timer = undefined;
  const changes = pending;
  pending = {};
  if (!Object.keys(changes).length) return;
  settingsApi.setPrefs(changes).catch((err) => log.warn('No se pudieron guardar las preferencias:', err));
};

setSyncedChangeHandler((key, value) => {
  pending[key] = value;
  clearTimeout(timer);
  timer = setTimeout(push, PUSH_DELAY);
});

// Al cerrar la pestaña o pasar a otra app (iOS no avisa de más), subir lo pendiente ya
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') push();
  else if (loggedIn) void pullPrefs();
});

// Trae las preferencias del servidor y aplica las que hayan cambiado. Si el servidor aún no
// tiene ninguna, se suben las de este navegador. Sin conexión se siguen usando las locales.
// `startup`: aún no hay ninguna nota abierta, así que el modo de la nota sigue al predeterminado
export async function pullPrefs(startup = false) {
  loggedIn = true;
  // Con cambios por subir, lo local es más reciente: se espera a la próxima vez
  if (Object.keys(pending).length) return;
  let server: Record<string, string> | null;
  try {
    server = (await settingsApi.getPrefs()).prefs;
  } catch (err) {
    log.warn('No se pudieron leer las preferencias:', err);
    return;
  }
  const keys = getSyncedKeys();
  if (server === null) {
    const local: Record<string, string> = {};
    for (const key of keys) {
      const value = readRaw(key);
      if (value !== null) local[key] = value;
    }
    if (Object.keys(local).length) settingsApi.setPrefs(local).catch((err) => log.warn(err));
    return;
  }
  // Puede haber cambiado algo aquí mientras llegaba la respuesta
  if (Object.keys(pending).length) return;
  let changed = false;
  for (const key of keys) {
    const value = server[key] ?? null;
    if (readRaw(key) === value) continue;
    writeRaw(key, value);
    changed = true;
  }
  if (changed) {
    useStore.getState().reloadPrefs();
    const lang = server[LANG_KEY];
    if (isLang(lang) && lang !== useI18n.getState().lang) useI18n.getState().setLang(lang);
  }
  const state = useStore.getState();
  if (startup && !state.activeTab) useStore.setState({ editMode: state.defaultEditMode });
}
