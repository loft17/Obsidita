// Módulos pesados que solo se usan en acciones puntuales (exportar a PDF, descargar un ZIP):
// se cargan la primera vez que hacen falta en lugar de al arrancar, así el servidor ocupa
// menos memoria mientras no se usan

let markdownPromise;
export const loadMarkdown = () =>
  (markdownPromise ??= import('markdown-it').then(
    ({ default: MarkdownIt }) => new MarkdownIt({ html: false, linkify: true, breaks: true })
  ));

let archiverPromise;
export const loadZipArchive = () => (archiverPromise ??= import('archiver').then((m) => m.ZipArchive));

// Nivel de compresión de los ZIP: el 6 (el de zlib por defecto) comprime casi igual que el 9
// con bastante menos CPU, y las imágenes y adjuntos ya vienen comprimidos
export const ZIP_LEVEL = 6;
