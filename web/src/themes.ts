// Estilos visuales de la app: cada .css de styles/themes/ es uno (su nombre de archivo es el id) y
// define los colores del tema oscuro en :root y los del claro en :root[data-theme="light"].
// Se detectan al compilar: basta con añadir el archivo y volver a construir la web.
// Solo se descarga el elegido, y se aplica en un <style> que se sustituye al cambiar de estilo

const loaders = import.meta.glob<string>('./styles/themes/*.css', { query: '?inline', import: 'default' });

export const DEFAULT_THEME_STYLE = 'obsidian';

const idFromPath = (path: string) => path.replace(/^.*\//, '').replace(/\.css$/, '');
const pathById = new Map(Object.keys(loaders).map((path) => [idFromPath(path), path]));

// "gemini" → "Gemini", "mi-tema_azul" → "Mi Tema Azul"
const labelFromId = (id: string) => id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// El predeterminado primero; el resto por orden alfabético
export const THEME_STYLES = [...pathById.keys()]
  .sort((a, b) => Number(b === DEFAULT_THEME_STYLE) - Number(a === DEFAULT_THEME_STYLE) || a.localeCompare(b))
  .map((id) => ({ id, label: labelFromId(id) }));

// Un estilo guardado que ya no existe pasa al predeterminado (o al primero que haya)
export const resolveThemeStyle = (id: string) =>
  pathById.has(id) ? id : pathById.has(DEFAULT_THEME_STYLE) ? DEFAULT_THEME_STYLE : THEME_STYLES[0]?.id ?? '';

const styleEl = document.createElement('style');
styleEl.id = 'theme-style';
// Al principio del <head>: las hojas de los componentes (ai.css…) van después y mandan sobre él
document.head.prepend(styleEl);

let applied = '';
let requested = '';
let pending: Promise<void> = Promise.resolve();

export const applyThemeStyle = (id: string): Promise<void> => {
  const resolved = resolveThemeStyle(id);
  requested = resolved;
  if (resolved === applied) return pending;
  const path = pathById.get(resolved);
  if (!path) return pending;
  pending = loaders[path]()
    .then((css) => {
      // Si mientras se descargaba se eligió otro, gana el último
      if (requested !== resolved) return;
      styleEl.textContent = css;
      applied = resolved;
    })
    .catch(() => {});
  return pending;
};

// Se resuelve cuando el estilo pedido está aplicado (main.tsx espera a él antes de pintar)
export const themeStyleReady = () => pending;
