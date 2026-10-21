import { ApiError } from './api';
import { t, type MessageKey } from './i18n';

// Errores del servidor de IA con código propio → texto traducido. Lo usan la barra de IA y
// Ajustes → IA (los dos se descargan aparte, así que esto no va en la carga inicial)
const ERROR_KEYS: Record<string, MessageKey> = {
  notConfigured: 'ai.error.notConfigured',
  unknownProvider: 'ai.error.unknownProvider',
  noKey: 'ai.error.noKey',
  timeout: 'ai.error.timeout',
  network: 'ai.error.network',
  providerError: 'ai.error.providerError',
  emptyResponse: 'ai.error.emptyResponse',
  allFailed: 'ai.error.allFailed',
  tooLong: 'ai.error.tooLong',
  instructionTooLong: 'ai.error.instructionTooLong',
  rateLimited: 'ai.error.rateLimited',
};

export function aiErrorMessage(err: unknown, maxChars = 0) {
  if (!(err instanceof ApiError)) return t('ai.error.network');
  const key = ERROR_KEYS[String(err.data.code)];
  const failed = Array.isArray(err.data.failed) ? (err.data.failed as { provider: string }[]) : [];
  const text = key ? t(key, { max: maxChars, providers: failed.map((f) => f.provider).join(', ') }) : err.message;
  // Lo que respondió el proveedor (HTTP 400: API key not valid...), para saber qué corregir
  return typeof err.data.detail === 'string' ? `${text} (${err.data.detail})` : text;
}
