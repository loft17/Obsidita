import { existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { validSecret } from './cookieSecret.js';
import { writeFileAtomic } from './dataFiles.js';
import { createLogger } from './logger.js';
const log = createLogger('Security');

// Cifrado de las claves de API que se guardan desde la web (AES-256-GCM). La clave de cifrado
// sale de AI_KEYS_SECRET (64 caracteres hexadecimales) o, si no está, de data/.ai-secret, que
// se genera la primera vez. Con la variable de entorno la clave no está junto a los datos
// cifrados: una copia de data/ (o de config.json) no basta para leer las claves de API.
// Cambiar la clave de cifrado deja ilegibles las guardadas: hay que volver a escribirlas

const PREFIX = 'v1.';

const loadKey = (keyPath) => {
  const fromEnv = process.env.AI_KEYS_SECRET;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    const secret = validSecret(fromEnv);
    if (secret) return Buffer.from(secret, 'hex');
    log.warn('AI_KEYS_SECRET no es válido (se esperan 64 caracteres hexadecimales); se usa data/.ai-secret');
  }
  if (existsSync(keyPath)) {
    const secret = validSecret(readFileSync(keyPath, 'utf8'));
    if (secret) return Buffer.from(secret, 'hex');
    log.warn(`${keyPath} no contiene una clave válida; se genera otra y las claves de API guardadas dejarán de valer`);
  }
  const secret = crypto.randomBytes(32).toString('hex');
  writeFileAtomic(keyPath, secret);
  return Buffer.from(secret, 'hex');
};

export const createSecretBox = (keyPath) => {
  // Se lee la primera vez que hace falta: sin claves guardadas no se crea el archivo
  let key;
  const getKey = () => (key ??= loadKey(keyPath));

  return {
    encrypt(text) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
      const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
    },
    // null si no se puede descifrar (clave de cifrado cambiada, valor manipulado o corrupto)
    decrypt(value) {
      if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
      try {
        const raw = Buffer.from(value.slice(PREFIX.length), 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
};
