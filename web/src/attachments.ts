// Resolución de adjuntos (imágenes) al estilo Obsidian: ![[imagen.png]] y ![](ruta/imagen.png)
import { useStore } from './store';
import { filesApi, searchApi } from './api';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

export const isImage = (path: string) => IMAGE_EXT.test(path);

// Archivos de texto que no son notas: se muestran en solo lectura (ver TextViewer)
const TEXT_EXT = /\.(txt|text|log|json|canvas|csv|tsv|ya?ml|toml|ini|conf|cfg|xml|css|js|mjs|ts|html?|sh|py|sql)$/i;

export const isPlainText = (path: string) => TEXT_EXT.test(path);

const isExternal = (src: string) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src);

const safeDecode = (s: string) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

// Une y normaliza segmentos (resuelve "." y "..")
const joinPath = (dir: string, rel: string) => {
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
};

const parentDir = (path: string) => path.split('/').slice(0, -1).join('/');

// Devuelve la ruta dentro del vault del adjunto enlazado desde `notePath`.
// Orden: relativa a la nota, relativa a la raíz y, por último, por nombre en
// cualquier carpeta (la más cercana a la nota).
export function resolveAttachment(link: string, notePath: string): string {
  const target = safeDecode(link.split('#')[0]).replace(/^\/+/, '');
  const noteDir = parentDir(notePath);
  const fromNote = joinPath(noteDir, target);

  const files = useStore.getState().tree.filter((item) => item.type !== 'folder');
  if (!files.length) return fromNote;

  const lower = (s: string) => s.toLowerCase();
  const exists = (p: string) => files.some((f) => lower(f.path) === lower(p));
  if (exists(fromNote)) return fromNote;
  const fromRoot = joinPath('', target);
  if (exists(fromRoot)) return fromRoot;

  const suffix = lower(`/${fromRoot}`);
  const matches = files.filter((f) => lower(`/${f.path}`).endsWith(suffix));
  if (!matches.length) return fromNote;
  // Prefiere el que comparte más carpetas con la nota
  const shared = (p: string) => {
    const a = parentDir(p).split('/');
    const b = noteDir.split('/');
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  };
  return matches.sort((x, y) => shared(y.path) - shared(x.path) || x.path.length - y.path.length)[0].path;
}

export const rawFileUrl = (vaultPath: string) => `/api/files/raw/${encodeURIComponent(vaultPath)}`;

// URL final para un src de imagen (externo se respeta tal cual)
export const attachmentUrl = (src: string, notePath: string) =>
  isExternal(src) ? src : rawFileUrl(resolveAttachment(src, notePath));

const EMBED = /!\[\[([^\]\n]+?)\]\]/g;
const MD_IMAGE = /!\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))[^)\n]*\)/g;

// Imágenes del vault incrustadas en una nota: rutas reales del árbol, sin repetir
export function noteImages(content: string, notePath: string): string[] {
  const files = new Map<string, string>();
  for (const item of useStore.getState().tree) {
    if (item.type !== 'folder') files.set(item.path.toLowerCase(), item.path);
  }
  const links = [
    ...Array.from(content.matchAll(EMBED), (m) => m[1].split('|')[0]),
    ...Array.from(content.matchAll(MD_IMAGE), (m) => m[1] ?? m[2]),
  ];
  const found = new Map<string, string>();
  for (const link of links) {
    const target = link.split('#')[0].trim();
    if (!target || isExternal(target) || !isImage(target)) continue;
    const key = resolveAttachment(target, notePath).toLowerCase();
    const path = files.get(key);
    if (path) found.set(key, path);
  }
  return [...found.values()];
}

// Imágenes de la nota separadas en exclusivas (`own`) y usadas también por otras notas (`shared`).
// Regla de seguridad: si no se puede determinar si otra nota usa la imagen, cuenta como `shared`
// y no se ofrece borrar. El error debe caer del lado de «no borres», nunca del de «borra»: la
// búsqueda puede fallar (el servidor limita las búsquedas por IP y responde 429), y una nota
// candidata puede no leerse. `complete` indica si la comprobación se pudo hacer entera.
export async function noteImageUsage(
  notePath: string
): Promise<{ own: string[]; shared: string[]; complete: boolean }> {
  const { content } = await filesApi.readFile(notePath);
  const own: string[] = [];
  const shared: string[] = [];
  const cache = new Map<string, string[]>();
  // Notas que no se pudieron leer: se recuerdan aparte, porque la caché de contenido no puede
  // distinguir "leída y no usa la imagen" de "no se pudo leer" (que debe contar como desconocido)
  const unreadable = new Set<string>();
  const imagesOf = async (path: string): Promise<string[] | null> => {
    if (unreadable.has(path)) return null;
    if (!cache.has(path)) {
      try {
        cache.set(path, noteImages((await filesApi.readFile(path)).content, path));
      } catch {
        unreadable.add(path);
        return null;
      }
    }
    return cache.get(path)!;
  };

  let complete = true;
  for (const image of noteImages(content, notePath)) {
    const name = image.split('/').pop()!;
    // Candidatas: notas que mencionan el nombre (tal cual o codificado en ![](...))
    const queries = [...new Set([name, encodeURI(name)])];
    const candidates = new Set<string>();
    // ¿Se pudo averiguar el uso de ESTA imagen? Si no, no se puede afirmar que sea exclusiva
    let unknown = false;
    for (const q of queries) {
      try {
        for (const r of await searchApi.search(q)) {
          if (r.total > 0 && r.path !== notePath) candidates.add(r.path);
        }
      } catch {
        // Búsqueda fallida (p. ej. 429 del límite por IP): sin candidatas fiables
        unknown = true;
      }
    }
    let used = false;
    for (const path of candidates) {
      const images = await imagesOf(path);
      // Una candidata ilegible también impide descartar que use la imagen
      if (images === null) unknown = true;
      else if (images.includes(image)) {
        used = true;
        break;
      }
    }
    if (unknown && !used) complete = false;
    (used || unknown ? shared : own).push(image);
  }
  return { own, shared, complete };
}

// Obsidian admite tamaño tras "|": "texto|300" o "texto|300x200"
export function parseSize(text: string): { text: string; width?: number; height?: number } {
  const m = /\|\s*(\d+)(?:\s*x\s*(\d+))?\s*$/.exec(text);
  if (!m) return { text };
  return { text: text.slice(0, m.index), width: Number(m[1]), height: m[2] ? Number(m[2]) : undefined };
}
