// Límites configurables con variables de entorno (ver .env.example y el README).
// Un valor ausente o no válido (no numérico, cero o negativo) usa el de por defecto
const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  console.warn(`[Config] ${name}=${raw} no es válido; se usa ${fallback}`);
  return fallback;
};
const int = (name, fallback) => Math.floor(num(name, fallback));

const MB = 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;

// Tamaño de las peticiones
export const MAX_NOTE_MB = num('MAX_NOTE_MB', 20); // JSON: guardar una nota, etc.
export const MAX_UPLOAD_MB = num('MAX_UPLOAD_MB', 50); // adjunto subido

// Contraseña
export const MIN_PASSWORD_LENGTH = int('MIN_PASSWORD_LENGTH', 12);

// Búsqueda
export const SEARCH_MAX_QUERY_LENGTH = int('SEARCH_MAX_QUERY_LENGTH', 200);
export const SEARCH_MAX_FILE_BYTES = num('SEARCH_MAX_FILE_MB', 2) * MB; // las notas más grandes no se leen
export const SEARCH_MAX_SCANNED_BYTES = num('SEARCH_MAX_SCANNED_MB', 200) * MB; // total de notas indexadas para la búsqueda
// Búsquedas por IP y minuto. Cada una recorre el árbol del vault, así que no puede ser ilimitado;
// 120 deja sitio a escribir seguido (el cliente espera 250 ms entre consultas) sin rozar el límite
export const SEARCH_RATE_MAX = int('SEARCH_RATE_MAX', 120);
export const SEARCH_MAX_RESULTS = int('SEARCH_MAX_RESULTS', 200);
export const SEARCH_MAX_MATCHES_PER_FILE = int('SEARCH_MAX_MATCHES_PER_FILE', 5);

// Sesiones
export const SESSION_MAX_AGE = num('SESSION_MAX_DAYS', 30) * DAY;
export const SESSION_IDLE = num('SESSION_IDLE_DAYS', 7) * DAY;
