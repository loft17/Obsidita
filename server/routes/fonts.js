import { Router } from 'express';
import { mkdirSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, extname, join, resolve, basename } from 'path';
import { publicError } from '../security.js';
import { createLogger } from '../logger.js';
const log = createLogger('Fonts');

// Fuentes propias: basta con copiar los archivos en esta carpeta (y recargar la web), que los
// registra con @font-face y los ofrece en Ajustes > Apariencia > Fuente.
// No vale una fuente instalada en el sistema del servidor: el navegador solo ve las de su equipo
const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FONTS_DIR = process.env.FONTS_DIR ? resolve(process.env.FONTS_DIR) : join(appDir, 'web', 'src', 'fonts');

const FONT_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const WEIGHTS = {
  thin: 100, hairline: 100,
  extralight: 200, ultralight: 200,
  light: 300,
  regular: 400, normal: 400, book: 400, '': 400,
  medium: 500,
  semibold: 600, demibold: 600,
  bold: 700,
  extrabold: 800, ultrabold: 800,
  black: 900, heavy: 900,
};

// Caracteres que no deben acabar nunca en el CSS generado: comillas, barra invertida,
// llaves y punto y coma romperían la declaración; los de control (C0 \x00-\x1f, DEL \x7f
// y C1 \x80-\x9f) son invisibles y no pintan nada en un nombre de familia (defensa en
// profundidad: el nombre del archivo es entrada no confiable y va a un <style>)
const UNSAFE_IN_CSS = /["\\;{}]|[\x00-\x1f\x7f-\x9f]/g;
const sanitizeFamily = (name) => name.replace(/_/g, ' ').replace(UNSAFE_IN_CSS, '').trim();

// Familia, peso y estilo a partir del nombre del archivo, con la convención de Google Fonts:
// Lora-Regular.ttf, Lora-BoldItalic.ttf, Lora-VariableFont_wght.ttf, Lora-Italic-VariableFont_wght.ttf
export const parseFontFile = (file) => {
  let family = file.slice(0, -extname(file).length);
  let weight = '400';
  let style = 'normal';
  const variable = /[-_ ]?(VariableFont.*|\[.*\])$/i;
  const isVariable = variable.test(family);
  if (isVariable) {
    family = family.replace(variable, '');
    weight = '100 900';
  }
  const m = family.match(/^(.+?)[-_ ]([A-Za-z]+)$/);
  if (m) {
    let suffix = m[2].toLowerCase();
    const italic = /(italic|oblique)$/.test(suffix);
    if (italic) suffix = suffix.replace(/(italic|oblique)$/, '');
    if (suffix in WEIGHTS) {
      family = m[1];
      if (!isVariable) weight = String(WEIGHTS[suffix]);
      if (italic) style = 'italic';
    }
  }
  // El fallback (nombre ilegible) también se limpia: si no, un control escondido en el
  // nombre del archivo volvería a colarse por esta vía
  family = sanitizeFamily(family) || sanitizeFamily(file) || 'Fuente';
  return { file, family, weight, style };
};

// Solo un archivo de fuente de la propia carpeta, sin subcarpetas ni archivos ocultos
const isFontName = (name) =>
  name === basename(name) && !name.startsWith('.') && Boolean(FONT_TYPES[extname(name).toLowerCase()]);

const listFonts = () => {
  if (!existsSync(FONTS_DIR)) return [];
  return readdirSync(FONTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && isFontName(e.name))
    .map((e) => parseFontFile(e.name))
    .sort((a, b) => a.family.localeCompare(b.family) || a.file.localeCompare(b.file));
};

export default () => {
  const router = Router();
  // Se crea vacía para que sea fácil encontrarla
  try {
    mkdirSync(FONTS_DIR, { recursive: true });
  } catch (err) {
    log.warn(`No se pudo crear ${FONTS_DIR}:`, err.message);
  }

  router.get('/', (req, res) => {
    try {
      res.json(listFonts());
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo leer la carpeta de fuentes') });
    }
  });

  router.get('/file/:name', (req, res) => {
    const name = req.params.name;
    if (!isFontName(name) || !existsSync(join(FONTS_DIR, name))) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.type(FONT_TYPES[extname(name).toLowerCase()]);
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(join(FONTS_DIR, name));
  });

  return router;
};
