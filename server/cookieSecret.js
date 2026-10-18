import { existsSync, readFileSync, writeFileSync } from 'fs';
import crypto from 'crypto';
import { createLogger } from './logger.js';
const log = createLogger('Security');

// El secreto firma la cookie de sesión (cookie-parser). Si es vacío o débil, la firma
// deja de ser una garantía:
//   - Vacío (""): cookie-parser lo interpreta como «sin secreto». Entonces req.signedCookies
//     siempre queda vacío y `res.cookie(..., { signed: true })` lanza una excepción, así que
//     el login deja de funcionar (bloqueo total, no falsificación).
//   - Corto o truncado (p. ej. media escritura): la app arranca y aparentemente va bien, pero
//     el secreto es adivinable por fuerza bruta y cualquiera puede falsificar la firma.
// Solo un secreto de 64 caracteres hexadecimales (32 bytes) es aceptable.
const SECRET_BYTES = 32;
const SECRET_PATTERN = /^[0-9a-f]{64}$/i;
const generated = () => crypto.randomBytes(SECRET_BYTES).toString('hex');

// ¿Tiene la forma esperada (64 hex)? Devuelve el secreto normalizado o null
export const validSecret = (raw) => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return SECRET_PATTERN.test(value) ? value.toLowerCase() : null;
};

// Carga el secreto de las cookies. Prioridad: COOKIE_SECRET (variable de entorno, que es lo
// que documenta .env.example) y, si no, data/.secret. Si la variable de entorno existe pero
// no es válida se avisa y se usa el archivo: es preferible arrancar con un secreto bueno del
// disco que quedarse sin sesiones (o con una firma débil) por una variable mal copiada.
export const loadCookieSecret = (secretPath) => {
  const fromEnv = process.env.COOKIE_SECRET;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    const secret = validSecret(fromEnv);
    if (secret) return secret;
    log.warn(
      `COOKIE_SECRET no es válido (se esperan ${SECRET_BYTES * 2} caracteres hexadecimales); se ignora`
    );
  }

  if (existsSync(secretPath)) {
    const raw = readFileSync(secretPath, 'utf8');
    const secret = validSecret(raw);
    if (secret) return secret;
    // Existe pero no sirve (vacío, truncado o corrupto): se regenera en lugar de aceptarlo
    log.warn(
      `${secretPath} no contiene un secreto válido (se esperan ${SECRET_BYTES * 2} caracteres ` +
        'hexadecimales); se genera uno nuevo y las sesiones abiertas dejarán de valer'
    );
  }

  const secret = generated();
  writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
};
