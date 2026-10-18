// Fuentes libres incluidas en Obsidita (paquetes de Fontsource): se sirven desde el propio servidor,
// sin pedir nada a Google.
// Solo el subconjunto latino (español, catalán, inglés…) en normal, cursiva y negrita.
//
// Las 21 familias NO se importan todas en el arranque: cada variante (.css) se carga con un
// import() dinámico, así Vite deja cada familia en sus propios trozos y el navegador solo
// descarga la de la familia que se está usando (antes entraban las 78 variantes en el CSS
// inicial). Ver loadBundledFont(), que se llama al arrancar y al cambiar de fuente.

import log from './logger';

export type FontCategory = 'sans' | 'serif' | 'mono';

// El nombre debe coincidir con el `font-family` que declara cada paquete
export const BUNDLED_FONTS: Record<FontCategory, string[]> = {
  sans: ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Nunito', 'Source Sans 3', 'IBM Plex Sans', 'Atkinson Hyperlegible'],
  serif: ['Lora', 'Merriweather', 'Literata', 'Source Serif 4', 'EB Garamond', 'Crimson Pro', 'IBM Plex Serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono', 'Roboto Mono'],
};

export const isBundledFont = (name: string) => Object.values(BUNDLED_FONTS).some((fonts) => fonts.includes(name));

// Nombre visible → carpeta del paquete de Fontsource
const PACKAGES: Record<string, string> = {
  Inter: 'inter',
  Roboto: 'roboto',
  'Open Sans': 'open-sans',
  Lato: 'lato',
  Nunito: 'nunito',
  'Source Sans 3': 'source-sans-3',
  'IBM Plex Sans': 'ibm-plex-sans',
  'Atkinson Hyperlegible': 'atkinson-hyperlegible',
  Lora: 'lora',
  Merriweather: 'merriweather',
  Literata: 'literata',
  'Source Serif 4': 'source-serif-4',
  'EB Garamond': 'eb-garamond',
  'Crimson Pro': 'crimson-pro',
  'IBM Plex Serif': 'ibm-plex-serif',
  'JetBrains Mono': 'jetbrains-mono',
  'Fira Code': 'fira-code',
  'Source Code Pro': 'source-code-pro',
  'IBM Plex Mono': 'ibm-plex-mono',
  'Roboto Mono': 'roboto-mono',
};

// Variantes de cada familia, con import() literal para que Vite las resuelva como módulos
// (y las separe en trozos propios). Fira Code solo trae dos: no tiene cursivas
const LOADERS: Record<string, () => Promise<unknown>> = {
  inter: () =>
    Promise.all([
      import('@fontsource/inter/latin-400.css'),
      import('@fontsource/inter/latin-400-italic.css'),
      import('@fontsource/inter/latin-700.css'),
      import('@fontsource/inter/latin-700-italic.css'),
    ]),
  roboto: () =>
    Promise.all([
      import('@fontsource/roboto/latin-400.css'),
      import('@fontsource/roboto/latin-400-italic.css'),
      import('@fontsource/roboto/latin-700.css'),
      import('@fontsource/roboto/latin-700-italic.css'),
    ]),
  'open-sans': () =>
    Promise.all([
      import('@fontsource/open-sans/latin-400.css'),
      import('@fontsource/open-sans/latin-400-italic.css'),
      import('@fontsource/open-sans/latin-700.css'),
      import('@fontsource/open-sans/latin-700-italic.css'),
    ]),
  lato: () =>
    Promise.all([
      import('@fontsource/lato/latin-400.css'),
      import('@fontsource/lato/latin-400-italic.css'),
      import('@fontsource/lato/latin-700.css'),
      import('@fontsource/lato/latin-700-italic.css'),
    ]),
  nunito: () =>
    Promise.all([
      import('@fontsource/nunito/latin-400.css'),
      import('@fontsource/nunito/latin-400-italic.css'),
      import('@fontsource/nunito/latin-700.css'),
      import('@fontsource/nunito/latin-700-italic.css'),
    ]),
  'source-sans-3': () =>
    Promise.all([
      import('@fontsource/source-sans-3/latin-400.css'),
      import('@fontsource/source-sans-3/latin-400-italic.css'),
      import('@fontsource/source-sans-3/latin-700.css'),
      import('@fontsource/source-sans-3/latin-700-italic.css'),
    ]),
  'ibm-plex-sans': () =>
    Promise.all([
      import('@fontsource/ibm-plex-sans/latin-400.css'),
      import('@fontsource/ibm-plex-sans/latin-400-italic.css'),
      import('@fontsource/ibm-plex-sans/latin-700.css'),
      import('@fontsource/ibm-plex-sans/latin-700-italic.css'),
    ]),
  'atkinson-hyperlegible': () =>
    Promise.all([
      import('@fontsource/atkinson-hyperlegible/latin-400.css'),
      import('@fontsource/atkinson-hyperlegible/latin-400-italic.css'),
      import('@fontsource/atkinson-hyperlegible/latin-700.css'),
      import('@fontsource/atkinson-hyperlegible/latin-700-italic.css'),
    ]),
  lora: () =>
    Promise.all([
      import('@fontsource/lora/latin-400.css'),
      import('@fontsource/lora/latin-400-italic.css'),
      import('@fontsource/lora/latin-700.css'),
      import('@fontsource/lora/latin-700-italic.css'),
    ]),
  merriweather: () =>
    Promise.all([
      import('@fontsource/merriweather/latin-400.css'),
      import('@fontsource/merriweather/latin-400-italic.css'),
      import('@fontsource/merriweather/latin-700.css'),
      import('@fontsource/merriweather/latin-700-italic.css'),
    ]),
  literata: () =>
    Promise.all([
      import('@fontsource/literata/latin-400.css'),
      import('@fontsource/literata/latin-400-italic.css'),
      import('@fontsource/literata/latin-700.css'),
      import('@fontsource/literata/latin-700-italic.css'),
    ]),
  'source-serif-4': () =>
    Promise.all([
      import('@fontsource/source-serif-4/latin-400.css'),
      import('@fontsource/source-serif-4/latin-400-italic.css'),
      import('@fontsource/source-serif-4/latin-700.css'),
      import('@fontsource/source-serif-4/latin-700-italic.css'),
    ]),
  'eb-garamond': () =>
    Promise.all([
      import('@fontsource/eb-garamond/latin-400.css'),
      import('@fontsource/eb-garamond/latin-400-italic.css'),
      import('@fontsource/eb-garamond/latin-700.css'),
      import('@fontsource/eb-garamond/latin-700-italic.css'),
    ]),
  'crimson-pro': () =>
    Promise.all([
      import('@fontsource/crimson-pro/latin-400.css'),
      import('@fontsource/crimson-pro/latin-400-italic.css'),
      import('@fontsource/crimson-pro/latin-700.css'),
      import('@fontsource/crimson-pro/latin-700-italic.css'),
    ]),
  'ibm-plex-serif': () =>
    Promise.all([
      import('@fontsource/ibm-plex-serif/latin-400.css'),
      import('@fontsource/ibm-plex-serif/latin-400-italic.css'),
      import('@fontsource/ibm-plex-serif/latin-700.css'),
      import('@fontsource/ibm-plex-serif/latin-700-italic.css'),
    ]),
  'jetbrains-mono': () =>
    Promise.all([
      import('@fontsource/jetbrains-mono/latin-400.css'),
      import('@fontsource/jetbrains-mono/latin-400-italic.css'),
      import('@fontsource/jetbrains-mono/latin-700.css'),
      import('@fontsource/jetbrains-mono/latin-700-italic.css'),
    ]),
  'fira-code': () =>
    Promise.all([import('@fontsource/fira-code/latin-400.css'), import('@fontsource/fira-code/latin-700.css')]),
  'source-code-pro': () =>
    Promise.all([
      import('@fontsource/source-code-pro/latin-400.css'),
      import('@fontsource/source-code-pro/latin-400-italic.css'),
      import('@fontsource/source-code-pro/latin-700.css'),
      import('@fontsource/source-code-pro/latin-700-italic.css'),
    ]),
  'ibm-plex-mono': () =>
    Promise.all([
      import('@fontsource/ibm-plex-mono/latin-400.css'),
      import('@fontsource/ibm-plex-mono/latin-400-italic.css'),
      import('@fontsource/ibm-plex-mono/latin-700.css'),
      import('@fontsource/ibm-plex-mono/latin-700-italic.css'),
    ]),
  'roboto-mono': () =>
    Promise.all([
      import('@fontsource/roboto-mono/latin-400.css'),
      import('@fontsource/roboto-mono/latin-400-italic.css'),
      import('@fontsource/roboto-mono/latin-700.css'),
      import('@fontsource/roboto-mono/latin-700-italic.css'),
    ]),
};

const loaded = new Map<string, Promise<void>>();

// Carga las variantes de una familia incluida. Las llamadas repetidas no vuelven a pedirlas.
export function loadBundledFont(name: string): Promise<void> {
  const pkg = PACKAGES[name];
  const load = pkg ? LOADERS[pkg] : undefined;
  if (!pkg || !load) return Promise.resolve();
  const pending = loaded.get(pkg);
  if (pending) return pending;
  const task = load().then(
    () => undefined,
    (err) => {
      // Si falla, se reintentará la próxima vez que se pida la familia
      loaded.delete(pkg);
      log.warn(`[Fonts] No se pudo cargar ${name}:`, err);
    },
  );
  loaded.set(pkg, task);
  return task;
}
