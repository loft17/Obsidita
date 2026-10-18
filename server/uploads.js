// Extensiones que se pueden subir arrastrando archivos al explorador. Se configuran en
// Preferencias (config.json → uploadExtensions); sin configurar, notas (.md) e imágenes
export const DEFAULT_UPLOAD_EXTENSIONS = ['md', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];
const MAX_EXTENSIONS = 100;

// Acepta "txt, .pdf *.csv" o un array; sin punto inicial, en minúsculas y sin repetir
export const parseUploadExtensions = (value) => {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/);
  const exts = [];
  for (const raw of list) {
    const ext = String(raw).trim().replace(/^\*?\./, '').toLowerCase();
    if (!ext) continue;
    if (!/^[a-z0-9_+-]{1,20}$/.test(ext)) throw new Error(`Extensión no válida: ${raw}`);
    if (!exts.includes(ext)) exts.push(ext);
  }
  if (exts.length > MAX_EXTENSIONS) throw new Error(`Máximo ${MAX_EXTENSIONS} extensiones`);
  return exts;
};

export const uploadExtensions = (cfg) =>
  Array.isArray(cfg?.uploadExtensions) ? cfg.uploadExtensions : DEFAULT_UPLOAD_EXTENSIONS;

export const isUploadable = (cfg, name) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 && uploadExtensions(cfg).includes(name.slice(dot + 1).toLowerCase());
};
