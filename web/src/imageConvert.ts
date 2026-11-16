// Conversión en el navegador de imágenes a WebP o JPG con la calidad elegida en Preferencias →
// Archivos. La usan las subidas desde el editor (pegar, arrastrar, insertar) y el menú de la
// imagen (clic derecho → convertir)
import type { ImageFormat } from './store';

const MIME: Record<Exclude<ImageFormat, 'original'>, string> = { webp: 'image/webp', jpg: 'image/jpeg' };

// Solo mapas de bits estáticos: los GIF pueden ser animados y los SVG ya son vectoriales
const CONVERTIBLE = /^image\/(png|jpeg|webp|bmp)$/;

export const changeExt = (name: string, ext: string) => {
  const dot = name.lastIndexOf('.');
  return `${dot > 0 ? name.slice(0, dot) : name}.${ext}`;
};

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality / 100));

// Codifica la imagen en el formato pedido, sin mirar el tamaño. Devuelve null si el formato no se
// puede convertir (no admitido, o el navegador no codifica a ese tipo: Safari antiguo devuelve PNG)
export async function encodeImage(file: Blob, format: Exclude<ImageFormat, 'original'>, quality: number) {
  if (!CONVERTIBLE.test(file.type)) return null;
  const type = MIME[format];
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // JPG no tiene transparencia: fondo blanco en vez de negro
    if (format === 'jpg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await encode(canvas, type, quality);
    return blob && blob.type === type ? blob : null;
  } catch {
    return null;
  }
}

// Devuelve el archivo convertido y su nombre con la nueva extensión. Si no se puede convertir o el
// resultado ocupa más, se queda el original
export async function convertImage(
  file: File,
  name: string,
  format: ImageFormat,
  quality: number
): Promise<{ file: Blob; name: string }> {
  if (format === 'original') return { file, name };
  const blob = await encodeImage(file, format, quality);
  if (!blob || blob.size >= file.size) return { file, name };
  return { file: blob, name: changeExt(name, format) };
}
