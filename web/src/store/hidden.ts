// Filtros del explorador, la búsqueda y las etiquetas: carpetas y extensiones ocultas

// Extensiones separadas por comas, espacios o saltos de línea; el punto inicial es opcional
export const parseHiddenExtensions = (value: string): Set<string> =>
  new Set(
    value
      .split(/[\s,;]+/)
      .map((e) => e.trim().replace(/^\*?\./, '').toLowerCase())
      .filter(Boolean)
  );

export const hasHiddenExtension = (path: string, exts: Set<string>) => {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 && exts.has(name.slice(dot + 1).toLowerCase());
};

// Un patrón por línea; `*` es comodín. Se compara con el nombre de cada carpeta (sin distinguir mayúsculas)
export const hiddenMatchers = (patterns: string): RegExp[] =>
  patterns
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));

// true si alguna carpeta de la ruta coincide con los patrones ocultos
export const isHiddenPath = (path: string, isFolder: boolean, matchers: RegExp[]) => {
  const segments = path.split('/');
  const folders = isFolder ? segments : segments.slice(0, -1);
  return folders.some((name) => matchers.some((re) => re.test(name)));
};
