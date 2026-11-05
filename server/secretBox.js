import { existsSync, readFileSync, renameSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { validSecret } from './cookieSecret.js';
import { writeFileAtomic } from './dataFiles.js';
import { createLogger } from './logger.js';
const log = createLogger('Security');

// Cifrado de los secretos que se guardan desde la web (claves de API de la IA y token de GitHub),
// con AES-256-GCM. La clave sale de SECRETS_KEY (64 caracteres hexadecimales) o, si no está, de
// data/.secrets-key, que se genera la primera vez. AI_KEYS_SECRET es el nombre anterior y sigue
// funcionando. Con la variable de entorno la clave no está junto a los datos cifrados: una copia
// de data/ (o de config.json o sync.json) no basta para leerlos.
// Cambiar la clave deja ilegibles los secretos guardados: hay que volver a escribirlos

const PREFIX = 'v1.';
const KEY_FILE = '.secrets-key';
const LEGACY_KEY_FILE = '.ai-secret'; // nombre anterior de data/.secrets-key
const ENV_NAMES = ['SECRETS_KEY', 'AI_KEYS_SECRET'];

// Variable de entorno que define la clave (la primera con valor), o null
export const secretsKeyEnv = () => ENV_NAMES.find((name) => process.env[name]?.trim()) ?? null;

const loadKey = (dataDir) => {
  const keyPath = join(dataDir, KEY_FILE);
  const envName = secretsKeyEnv();
  if (envName) {
    const secret = validSecret(process.env[envName]);
    if (secret) return Buffer.from(secret, 'hex');
    log.warn(`${envName} no es válido (se esperan 64 caracteres hexadecimales); se usa data/${KEY_FILE}`);
  }
  // Instalaciones anteriores: la clave estaba en data/.ai-secret. Se renombra, así es la misma clave
  const legacyPath = join(dataDir, LEGACY_KEY_FILE);
  if (!existsSync(keyPath) && existsSync(legacyPath)) renameSync(legacyPath, keyPath);
  if (existsSync(keyPath)) {
    const secret = validSecret(readFileSync(keyPath, 'utf8'));
    if (secret) return Buffer.from(secret, 'hex');
    log.warn(`data/${KEY_FILE} no contiene una clave válida; se genera otra y los secretos guardados dejarán de valer`);
  }
  const secret = crypto.randomBytes(32).toString('hex');
  writeFileAtomic(keyPath, secret);
  return Buffer.from(secret, 'hex');
};

export const createSecretBox = (dataDir) => {
  // Se lee la primera vez que hace falta: sin secretos guardados no se crea el archivo
  let key;
  const getKey = () => (key ??= loadKey(dataDir));

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
