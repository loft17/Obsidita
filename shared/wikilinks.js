// Resolución de [[wikilinks]] compartida por el cliente (web/src/wikilinks.ts) y el servidor
// (server/links.js): ambos deben llegar siempre al mismo archivo. Sin dependencias a propósito.

const lower = (s) => s.toLowerCase();
const parentDir = (p) => p.split('/').slice(0, -1).join('/');

// Ruta del archivo enlazado desde `notePath` entre `paths` (todo lo que no es carpeta), o null.
// Orden: ruta exacta desde la raíz, relativa a la nota y, por último, por nombre en cualquier
// carpeta (la más cercana a la nota). Si dos rutas solo difieren en mayúsculas, gana la primera
export function resolveWikilink(target, notePath, paths) {
  if (!target) return notePath || null;
  const withExt = /\.[^/]+$/.test(target) && !/\.md$/i.test(target) ? target : target.replace(/\.md$/i, '') + '.md';
  const clean = withExt.replace(/^\/+/, '');
  const dir = parentDir(notePath);
  const find = (p) => paths.find((f) => lower(f) === lower(p));
  const exact = find(clean) ?? find(dir ? `${dir}/${clean}` : clean);
  if (exact) return exact;

  const suffix = lower(`/${clean}`);
  const matches = paths.filter((p) => lower(`/${p}`).endsWith(suffix));
  if (!matches.length) return null;
  const noteDir = dir.split('/');
  const shared = (p) => {
    const a = parentDir(p).split('/');
    let n = 0;
    while (n < a.length && n < noteDir.length && a[n] === noteDir[n]) n++;
    return n;
  };
  return matches.sort((x, y) => shared(y) - shared(x) || x.length - y.length)[0];
}
