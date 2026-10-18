// Logger mínimo con niveles para el navegador (el del servidor está en server/logger.js).
// VITE_LOG_LEVEL = debug | info | warn | error | silent, fijado al compilar; sin definir,
// warn en el build de producción y debug en desarrollo
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = keyof typeof LEVELS;

const isLevel = (v: unknown): v is Level => typeof v === 'string' && v in LEVELS;
const configured = String(import.meta.env.VITE_LOG_LEVEL ?? '')
  .trim()
  .toLowerCase();
const threshold = LEVELS[isLevel(configured) ? configured : import.meta.env.PROD ? 'warn' : 'debug'];

const SINKS = { debug: console.debug, info: console.info, warn: console.warn, error: console.error };

export const createLogger = (scope?: string) => {
  const log =
    (level: Exclude<Level, 'silent'>) =>
    (...args: unknown[]) => {
      if (LEVELS[level] < threshold) return;
      if (scope) SINKS[level](`[${scope}]`, ...args);
      else SINKS[level](...args);
    };
  return { debug: log('debug'), info: log('info'), warn: log('warn'), error: log('error') };
};

export default createLogger();
