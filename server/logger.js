// Logger mínimo con niveles. LOG_LEVEL = debug | info | warn | error | silent; sin definir,
// warn en producción (NODE_ENV=production) e info en el resto. Cada línea lleva la hora, el
// nivel y el ámbito (createLogger('Sync') → [Sync]). debug/info van a stdout; warn/error a stderr.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// Se resuelve en la primera llamada y no al importar: env.js usa el logger antes de cargar el
// .env, así que LOG_LEVEL y NODE_ENV todavía no estarían definidos
let threshold;
const getThreshold = () => {
  if (threshold !== undefined) return threshold;
  const fallback = process.env.NODE_ENV === 'production' ? 'warn' : 'info';
  const raw = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (raw && !(raw in LEVELS)) {
    threshold = LEVELS[fallback];
    write('warn', 'Config', [`LOG_LEVEL=${process.env.LOG_LEVEL} no es válido; se usa ${fallback}`]);
    return threshold;
  }
  threshold = LEVELS[raw || fallback];
  return threshold;
};

const write = (level, scope, args) => {
  const prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)}${scope ? ` [${scope}]` : ''}`;
  const out = level === 'warn' || level === 'error' ? console.error : console.log;
  out(prefix, ...args);
};

export const createLogger = (scope) => {
  const log = (level) => (...args) => {
    if (LEVELS[level] >= getThreshold()) write(level, scope, args);
  };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
};

export default createLogger();
