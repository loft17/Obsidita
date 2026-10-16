// Traducción de la interfaz. Cada idioma es un diccionario plano clave → texto; `es` es la
// referencia: los demás deben tener exactamente sus mismas claves (lo comprueba TypeScript).
// Los textos admiten variables con {nombre}: t('search.line', { n: 3 })
import { Fragment, useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import { es } from './es';

export type Lang = 'es' | 'en' | 'ca';
export type MessageKey = keyof typeof es;
export type Messages = Record<MessageKey, string>;
type Params = Record<string, string | number>;

// `es` va siempre en la carga inicial (es la referencia y el respaldo de las claves que falten);
// los demás idiomas se descargan solo cuando se usan
const MESSAGES: Partial<Record<Lang, Messages>> = { es };
const LOADERS: Record<Exclude<Lang, 'es'>, () => Promise<Messages>> = {
  en: () => import('./en').then((m) => m.en),
  ca: () => import('./ca').then((m) => m.ca),
};

const loadLang = async (lang: Lang) => {
  if (lang !== 'es' && !MESSAGES[lang]) MESSAGES[lang] = await LOADERS[lang]();
};

const messagesFor = (lang: Lang): Messages => MESSAGES[lang] ?? es;

// Cada idioma se muestra con su propio nombre en el selector
export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'ca', label: 'Català' },
];

const isLang = (value: unknown): value is Lang => LANGUAGES.some((l) => l.value === value);

// Sin preferencia guardada: el primer idioma del navegador que esté disponible; si no, inglés
const LANG_KEY = 'lang';
const initialLang = ((): Lang => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // almacenamiento no disponible: se usa el idioma del navegador
  }
  const browser = (navigator.languages?.length ? navigator.languages : [navigator.language])
    .map((l) => l?.slice(0, 2).toLowerCase())
    .find(isLang);
  return browser ?? 'en';
})();

const applyLang = (lang: Lang) => {
  document.documentElement.lang = lang;
};
applyLang(initialLang);

// Se espera antes de pintar la app (main.tsx) para no mostrar un instante el texto en español.
// Si no se puede descargar el idioma, se usa el español
export const i18nReady = loadLang(initialLang).catch(() => {});

export const useI18n = create<{ lang: Lang; setLang: (lang: Lang) => void }>((set) => ({
  lang: initialLang,
  setLang: async (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // almacenamiento no disponible: la preferencia solo dura la sesión
    }
    // Primero se descarga el idioma, para cambiar todos los textos de una vez
    await loadLang(lang).catch(() => {});
    applyLang(lang);
    set({ lang });
  },
}));

const format = (lang: Lang, key: MessageKey, params?: Params) => {
  const text = messagesFor(lang)[key] ?? es[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
};

export type TFunction = (key: MessageKey, params?: Params) => string;

// Fuera de React (alertas, widgets del editor...): usa el idioma actual en el momento de llamarla
export const t: TFunction = (key, params) => format(useI18n.getState().lang, key, params);

// Idioma actual, también para formatear fechas con toLocaleString
export const getLang = () => useI18n.getState().lang;

// En componentes: vuelve a pintar el componente al cambiar de idioma
export function useT(): TFunction {
  const lang = useI18n((s) => s.lang);
  return useMemo(() => (key, params) => format(lang, key, params), [lang]);
}

// Texto con elementos dentro: las variables {nombre} se sustituyen por nodos de React.
// <Trans k="files.hidden.desc" values={{ example: <code>_*</code> }} />
export function Trans({ k, values }: { k: MessageKey; values: Record<string, ReactNode> }) {
  const lang = useI18n((s) => s.lang);
  const parts = messagesFor(lang)[k].split(/\{(\w+)\}/g);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{i % 2 === 1 ? (part in values ? values[part] : `{${part}}`) : part}</Fragment>
      ))}
    </>
  );
}
