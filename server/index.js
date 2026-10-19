import './env.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, chmodSync, statSync, lstatSync, rmSync } from 'fs';
import setupRoutes from './routes/setup.js';
import authRoutes from './routes/auth.js';
import filesRoutes from './routes/files.js';
import searchRoutes from './routes/search.js';
import settingsRoutes from './routes/settings.js';
import syncRoutes from './routes/sync.js';
import fontsRoutes from './routes/fonts.js';
import { createSyncManager } from './sync.js';
import { invalidateSnapshot } from './searchIndex.js';
import { createSessionStore, createLoginLimiter } from './sessions.js';
import { loadCookieSecret } from './cookieSecret.js';
import { securityHeaders, csrfGuard } from './security.js';
import { MAX_NOTE_MB, MAX_UPLOAD_MB } from './limits.js';
import { createLogger } from './logger.js';
const log = createLogger('Server');

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const dataDir = join(__dirname, '..', 'data');

// data/ guarda el hash de la contraseña, el secreto de las cookies y las sesiones:
// solo el usuario que ejecuta la app puede leerla (también corrige instalaciones antiguas)
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
try {
  chmodSync(dataDir, 0o700);
  // Solo los archivos: quitarle los permisos de directorio a una subcarpeta de data/ la dejaría
  // inaccesible (el bit de ejecución es el que permite recorrerla)
  for (const f of readdirSync(dataDir)) {
    const file = join(dataDir, f);
    if (!lstatSync(file).isFile()) continue;
    // Temporales de una escritura atómica interrumpida (ver server/dataFiles.js)
    if (f.startsWith('.') && f.endsWith('.tmp')) rmSync(file, { force: true });
    else chmodSync(file, 0o600);
  }
} catch (err) {
  createLogger('Security').warn('No se pudieron ajustar los permisos de data/:', err.message);
}
// COOKIE_SECRET tiene prioridad sobre data/.secret (ver server/cookieSecret.js). Un archivo
// vacío, truncado o corrupto se regenera: aceptarlo tal cual rompía el login (secreto vacío)
// o dejaba la firma de la cookie al alcance de cualquiera (secreto débil)
const cookieSecret = loadCookieSecret(join(dataDir, '.secret'));

const sessions = createSessionStore(dataDir);
// Sincronización con GitHub / Dropbox / Google Drive (también la periódica)
const syncManager = createSyncManager(dataDir, () => getConfig());
// Compartido por el login y por las acciones que piden la contraseña (cambiar el vault)
const loginLimiter = createLoginLimiter();

// Detrás de un proxy inverso (nginx, Caddy...) define TRUST_PROXY=1 para que req.ip
// sea la IP real del cliente (la usa el límite de intentos de login)
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

const distPath = join(__dirname, '..', 'web', 'dist');

// Middleware
app.disable('x-powered-by');
app.use(securityHeaders(distPath));
app.use('/api', csrfGuard);
// El JSON se lee antes de comprobar la sesión, así que por defecto solo se aceptan cuerpos
// pequeños. Las notas (/api/files) pueden ser grandes: se leen con MAX_NOTE_MB más abajo,
// después de la comprobación de sesión
const apiPath = (req) => req.originalUrl.split('?')[0].toLowerCase();
const isFilesApi = (req) => apiPath(req).startsWith('/api/files/');
const smallJson = express.json({ limit: '100kb' });
app.use((req, res, next) => (isFilesApi(req) ? next() : smallJson(req, res, next)));
app.use(cookieParser(cookieSecret));

// Check if configured
// Se consulta en cada petición: solo se vuelve a leer y parsear config.json cuando cambia
// (fecha de modificación, tamaño o inodo), así que los cambios se siguen aplicando al instante
const configPath = join(dataDir, 'config.json');
let configCache = { key: null, value: null };
const getConfig = () => {
  let st;
  try {
    st = statSync(configPath, { bigint: true });
  } catch {
    configCache = { key: null, value: null };
    return null;
  }
  const key = `${st.ino}:${st.size}:${st.mtimeNs}`;
  if (configCache.key === key) return configCache.value;
  let value = null;
  try {
    value = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    log.error('Error reading config:', e);
  }
  configCache = { key, value };
  return value;
};

// Serve static web files (before auth middleware so they're always accessible)
// Los archivos de assets/ llevan un hash en el nombre: el navegador los guarda un año sin
// volver a preguntar. index.html se revalida siempre para recoger cada build nueva.
// Si el build dejó una versión comprimida (.br / .gz, ver vite.config.ts) se envía esa
const ENCODINGS = [
  ['br', '.br'],
  ['gzip', '.gz'],
];

// ¿Acepta el cliente esta codificación? Un `br;q=0` significa "no acepto brotli": con un
// `includes('br')` a secas se le enviaría igualmente y no podría descomprimirlo
const acceptsEncoding = (header, encoding) => {
  let wildcard = null;
  for (const part of header.split(',')) {
    const [rawName, ...params] = part.split(';');
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const q = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith('q='));
    const quality = q ? Number(q.slice(2)) : 1;
    if (name === encoding) return quality > 0;
    if (name === '*') wildcard = quality;
  }
  return wildcard !== null && wildcard > 0;
};

const precompressed = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!/\.(js|css|svg)$/.test(req.path) || req.path.includes('..')) return next();
  const accepted = req.get('Accept-Encoding') || '';
  for (const [encoding, ext] of ENCODINGS) {
    if (!acceptsEncoding(accepted, encoding)) continue;
    const file = join(distPath, 'assets', req.path + ext);
    if (!existsSync(file)) continue;
    res.set({ 'Content-Encoding': encoding, Vary: 'Accept-Encoding', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.type(extname(req.path));
    return res.sendFile(file, { maxAge: '1y', immutable: true }, (err) => err && next(err));
  }
  next();
};
if (existsSync(distPath)) {
  app.use('/assets', precompressed);
  app.use('/assets', express.static(join(distPath, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  app.use(
    express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      },
    })
  );
}

// Routes
app.use('/api/setup', setupRoutes(dataDir, sessions));
app.use('/api/auth', authRoutes(dataDir, sessions, loginLimiter));

// Protected routes (require login)
// Montado en '/api' (Express no distingue mayúsculas, así que también cubre '/API/...').
// /api/setup y /api/auth ya respondieron arriba; todo lo demás de la API exige sesión.
// Sin configurar tampoco se deja pasar: alguien podría dejar preparada, p. ej., la
// sincronización con su repositorio de GitHub antes de que hagas el setup
app.use('/api', (req, res, next) => {
  if (!getConfig()) return res.status(503).json({ error: 'Not configured' });
  if (!sessions.isValid(req.signedCookies.token)) {
    createLogger('Auth').info(`Unauthorized access attempt to ${req.method} ${req.originalUrl}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Lo que modifica algo (guardar, renombrar, borrar, sincronizar, cambiar el vault...) invalida
// el recorrido del vault que reutiliza la búsqueda
app.use('/api', (req, res, next) => {
  // También al terminar: una búsqueda hecha mientras tanto (p. ej. durante una sincronización) no vale
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    invalidateSnapshot();
    res.on('finish', invalidateSnapshot);
  }
  next();
});

app.use('/api/settings', settingsRoutes(dataDir, getConfig, loginLimiter, sessions));
// Al guardar una nota el cuerpo es JSON, pero /api/files/upload lo recibe en crudo: si el
// archivo subido llega con Content-Type: application/json, el parser de aquí se lo comería
// antes de que la ruta lo vea y la subida fallaría con "Archivo vacío"
const noteJson = express.json({ limit: MAX_NOTE_MB * 1024 * 1024 });
app.use(
  '/api/files',
  (req, res, next) => (req.path.toLowerCase() === '/upload' ? next() : noteJson(req, res, next)),
  filesRoutes(dataDir, getConfig)
);
app.use('/api/search', searchRoutes(dataDir, getConfig));
app.use('/api/sync', syncRoutes(syncManager, getConfig));
app.use('/api/fonts', fontsRoutes());

// Cualquier /api que no haya casado es un 404 en JSON. Si cayera en el fallback del SPA
// devolvería index.html con un 200 y el cliente fallaría al leer el mensaje de error
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

// SPA fallback (serve index.html for client-side routing)
if (existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Errores no controlados (p. ej. JSON malformado): sin trazas ni rutas internas en la respuesta
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) createLogger('Error').error(err);
  if (status === 413) {
    if (!isFilesApi(req)) return res.status(413).json({ error: 'Petición demasiado grande' });
    const max = apiPath(req).startsWith('/api/files/upload') ? MAX_UPLOAD_MB : MAX_NOTE_MB;
    return res.status(413).json({ error: `Demasiado grande (máximo ${max} MB)` });
  }
  res.status(status).json({ error: status >= 500 ? 'Error interno' : 'Petición no válida' });
});

// Solo números de puerto válidos: un texto se interpretaría como un socket de Unix
const validPort = (p) => {
  const n = Number(p);
  return p !== '' && p != null && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
};
const port = validPort(getConfig()?.port) ?? validPort(process.env.PORT) ?? 3000;
// HOST=127.0.0.1 para escuchar solo en local (detrás de un proxy inverso con HTTPS);
// sin definir, escucha en todas las interfaces
const host = process.env.HOST || undefined;
app.listen(port, host, () => {
  const cfg = getConfig();
  log.info(`Obsidita listening on http://${host || 'localhost'}:${port}`);
  if (cfg) {
    log.info(`Vault: ${cfg.vaultPath}`);
  } else {
    log.info('Setup required');
  }
  // Avisos de despliegue inseguro
  if (process.getuid?.() === 0) {
    createLogger('Security').warn('La app se está ejecutando como root: si alguien consigue entrar, controla todo el servidor. Usa un usuario sin privilegios.');
  }
  if (!host) {
    createLogger('Security').warn('Escuchando en todas las interfaces por HTTP (sin cifrar). Define HOST=127.0.0.1 y pon delante un proxy con HTTPS (Caddy, nginx).');
  }
});
