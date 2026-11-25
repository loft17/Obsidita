import crypto from 'crypto';
import { createSecretBox } from './secretBox.js';

// Verificación en dos pasos (TOTP, RFC 6238: SHA-1, 6 dígitos, paso de 30 s), compatible con
// Google Authenticator, Aegis, 1Password... No usa dependencias: solo `crypto` de Node.
// El secreto se guarda cifrado (secretBox) en config.json → otp. Los códigos de recuperación
// se guardan como hash SHA-256 y cada uno sirve una sola vez.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30; // segundos por código
const DIGITS = 6;
const WINDOW = 1; // se admite el código del paso anterior y del siguiente (desfase de reloj)
const RECOVERY_COUNT = 8;
export const OTP_ISSUER = 'Obsidita';

const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of String(str).toUpperCase().replace(/[\s=-]/g, '')) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Clave no válida');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
};

const hotp = (key, counter) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
};

// Último paso aceptado (en memoria): un mismo código no sirve dos veces, ni siquiera en la ventana
let lastStep = -Infinity;

// Comprueba un código TOTP de 6 dígitos. Devuelve true si es válido (y lo consume)
const verifyTotp = (key, code) => {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 1000 / STEP);
  const given = Buffer.from(code);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const step = now + d;
    if (step <= lastStep) continue;
    if (crypto.timingSafeEqual(Buffer.from(hotp(key, step)), given)) {
      lastStep = step;
      return true;
    }
  }
  return false;
};

// Código de recuperación: 8 caracteres base32 en dos grupos (XXXX-XXXX)
const normalizeRecovery = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
const hashRecovery = (code) => crypto.createHash('sha256').update(normalizeRecovery(code)).digest('hex');

const newRecoveryCodes = () => {
  const codes = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    const raw = base32Encode(crypto.randomBytes(5));
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return { codes, hashes: codes.map(hashRecovery) };
};

// Secreto nuevo para configurar la app (base32, 160 bits)
export const newOtpSecret = () => base32Encode(crypto.randomBytes(20));

// Clave de la app de autenticación (otpauth://) para copiarla o abrirla
export const otpUri = (secret, label = OTP_ISSUER) =>
  `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(OTP_ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;

// Comprueba que un secreto en base32 tiene una longitud razonable (≥ 80 bits)
export const validOtpSecret = (secret) => {
  try {
    return base32Decode(secret).length >= 10;
  } catch {
    return false;
  }
};

// Comprueba un código TOTP contra un secreto en claro (para activar la verificación)
export const verifyEnrollmentCode = (secret, code) => verifyTotp(base32Decode(secret), String(code ?? '').trim());

export const otpEnabled = (cfg) => cfg?.otp?.enabled === true;

// Guarda un secreto y devuelve la configuración nueva junto con los códigos de recuperación
// (en claro, solo para mostrarlos una vez)
export const enableOtpConfig = (cfg, dataDir, secret) => {
  const { codes, hashes } = newRecoveryCodes();
  const secretEnc = createSecretBox(dataDir).encrypt(secret);
  return { cfg: { ...cfg, otp: { enabled: true, secretEnc, recovery: hashes } }, recoveryCodes: codes };
};

export const regenerateRecoveryCodes = (cfg) => {
  const { codes, hashes } = newRecoveryCodes();
  return { cfg: { ...cfg, otp: { ...cfg.otp, recovery: hashes } }, recoveryCodes: codes };
};

// Comprueba el segundo factor: 6 dígitos = código de la app; cualquier otra cosa = código de
// recuperación (que se gasta al usarse). Devuelve { ok, cfg } donde cfg es la configuración a
// guardar (distinta solo si se gastó un código de recuperación)
export const checkSecondFactor = (cfg, dataDir, input) => {
  const code = String(input ?? '').trim();
  if (!code || !cfg?.otp?.enabled) return { ok: false, cfg };

  if (/^\d{6}$/.test(code)) {
    let secret;
    try {
      secret = base32Decode(createSecretBox(dataDir).decrypt(cfg.otp.secretEnc) ?? '');
    } catch {
      return { ok: false, cfg };
    }
    return { ok: secret.length > 0 && verifyTotp(secret, code), cfg };
  }

  const hash = hashRecovery(code);
  const recovery = cfg.otp.recovery ?? [];
  const index = recovery.findIndex((h) => h.length === hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash)));
  if (index < 0) return { ok: false, cfg };
  return { ok: true, cfg: { ...cfg, otp: { ...cfg.otp, recovery: recovery.filter((_, i) => i !== index) } } };
};
