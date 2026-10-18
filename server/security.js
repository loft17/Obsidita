import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { createLogger } from './logger.js';
const log = createLogger('Error');

// Hash CSP ('sha256-...') de un script inline
export const scriptHash = (code) => `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`;

// Hashes de los <script> inline de index.html (p. ej. el que aplica el tema antes de pintar),
// calculados al arrancar para que la CSP siga siendo válida tras cada build
const inlineScriptHashes = (distPath) => {
  const indexPath = join(distPath, 'index.html');
  if (!existsSync(indexPath)) return [];
  const html = readFileSync(indexPath, 'utf8');
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => scriptHash(m[1]));
};

// Cabeceras de seguridad para todas las respuestas (las rutas pueden sobrescribir la CSP,
// como /api/files/raw o la exportación a PDF)
export const securityHeaders = (distPath) => {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes(distPath).join(' ')}`.trim(),
    // React (atributos style) y CodeMirror inyectan estilos en línea
    "style-src 'self' 'unsafe-inline'",
    // Las imágenes externas revelan tu IP a su servidor (píxeles de rastreo), así que
    // se bloquean salvo con REMOTE_IMAGES=1
    `img-src 'self' data: blob:${process.env.REMOTE_IMAGES === '1' ? ' https:' : ''}`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  return (req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    // HSTS solo por HTTPS (detrás de un proxy, req.secure requiere TRUST_PROXY)
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
};

// Protección CSRF: las peticiones que modifican algo deben venir de la propia web.
// Complementa SameSite=Strict de la cookie (que no todos los navegadores antiguos respetan)
// y cubre /api/files/upload, que acepta cualquier Content-Type
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfGuard = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('Sec-Fetch-Site') === 'cross-site') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  // Origin debe coincidir en esquema, nombre y puerto: otra web del mismo servidor en otro
  // puerto es otro origen. Detrás de un proxy, req.protocol y el host salen de
  // X-Forwarded-Proto y X-Forwarded-Host con TRUST_PROXY
  const origin = req.get('Origin');
  if (origin) {
    const trusted = req.app.get('trust proxy fn')(req.socket.remoteAddress, 0);
    const host = (trusted && req.get('X-Forwarded-Host')?.split(',')[0].trim()) || req.get('Host');
    let expected;
    try {
      expected = new URL(`${req.protocol}://${host}`).origin;
    } catch {
      expected = null;
    }
    if (origin !== expected) {
      return res.status(403).json({ error: 'Origen no permitido' });
    }
  }
  next();
};

// Mensaje de error apto para el cliente: los errores del sistema de archivos llevan
// rutas absolutas del servidor, así que se traducen a un texto genérico y se registran aparte
const FS_ERRORS = {
  ENOENT: 'No encontrado',
  EACCES: 'Permiso denegado',
  EPERM: 'Permiso denegado',
  EEXIST: 'Ya existe',
  ENOTDIR: 'Ruta no válida',
  EISDIR: 'Ruta no válida',
  ENOTEMPTY: 'La carpeta no está vacía',
  ENAMETOOLONG: 'Nombre demasiado largo',
  ENOSPC: 'No queda espacio en disco',
};

export const publicError = (err, fallback = 'Error en la operación') => {
  if (err && typeof err.code === 'string') {
    log.error(err);
    return FS_ERRORS[err.code] || fallback;
  }
  // Errores propios (validaciones) con mensaje pensado para el usuario
  return err?.message || fallback;
};
