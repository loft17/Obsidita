import { t } from './i18n';
import type { TreeItem, TrashItem, SearchResult } from './types';

const API_URL = '/api';

// Cuerpo JSON de una respuesta de error: el servidor siempre manda `error`; el resto depende del caso
export type ErrorBody = { error?: string } & Record<string, unknown>;

// Error de una respuesta HTTP no satisfactoria. `status` permite reaccionar al código (401, 409,
// 429...) y `data` guarda el cuerpo JSON tal cual lo envió el servidor
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: ErrorBody = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// La nota ha cambiado en el servidor desde la versión que se leyó: trae la versión actual
export class ConflictError extends ApiError {
  constructor(
    public content: string,
    public version: string,
    data: ErrorBody = {},
  ) {
    super(t('conflict.title'), 409, data);
    this.name = 'ConflictError';
  }
}

// El servidor limita las búsquedas por minuto (SEARCH_RATE_MAX) y responde 429 con `Retry-After`
// (segundos). Se distingue del resto de errores para no perder lo que ya se tenía en pantalla
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    public retryAfterMs: number,
    data: ErrorBody = {},
  ) {
    super(message, 429, data);
    this.name = 'RateLimitError';
  }
}

// `Retry-After` → milisegundos. Admite también la forma con fecha HTTP. Sin cabecera válida se
// usa un minuto, que es la ventana del servidor
export function parseRetryAfter(value: string | null, fallbackMs = 60_000): number {
  if (value === null || value.trim() === '') return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? fallbackMs : Math.max(0, date - Date.now());
}

// Convierte una respuesta de error en la subclase de ApiError que corresponda. El cuerpo puede no
// ser JSON (proxy, 502...): entonces el mensaje es `HTTP <código>`. Un 413 sin JSON lo ha
// devuelto el proxy (client_max_body_size de nginx), no el servidor: se explica en el mensaje
const toApiError = async (res: Response): Promise<ApiError> => {
  const data: ErrorBody = await res.json().catch(() => ({}));
  const message = data.error || (res.status === 413 ? t('app.proxyTooLarge') : `HTTP ${res.status}`);
  if (res.status === 429) return new RateLimitError(message, parseRetryAfter(res.headers.get('Retry-After')), data);
  if (res.status === 409 && typeof data.version === 'string')
    return new ConflictError(data.content as string, data.version, data);
  return new ApiError(message, res.status, data);
};

type RequestOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
  // Se serializa como JSON y añade la cabecera Content-Type
  json?: unknown;
};

// Igual que request() pero devuelve la Response, para los casos que miran el código antes (304)
async function send(path: string, { json, headers, ...init }: RequestOptions = {}): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });
  if (!res.ok && res.status !== 304) throw await toApiError(res);
  return res;
}

// Petición a la API: lanza ApiError (o una subclase) si la respuesta no es ok; si no, devuelve el JSON
async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  return res.json();
}

const post = <T = unknown>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json: json ?? {} });

export interface ServerLimits {
  maxNoteMB: number;
  maxUploadMB: number;
  minPasswordLength: number;
  searchMaxQueryLength: number;
  searchMaxFileMB: number;
  searchMaxScannedMB: number;
  searchRateMax: number;
  searchMaxResults: number;
  searchMaxMatchesPerFile: number;
  sessionMaxDays: number;
  sessionIdleDays: number;
}

export const setupApi = {
  // minPasswordLength: mínimo que exige el servidor (configurable con MIN_PASSWORD_LENGTH)
  // siteTitle: título de la web elegido en Preferencias (vacío = el predeterminado)
  checkStatus: (): Promise<{ configured: boolean; minPasswordLength?: number; siteTitle?: string }> =>
    request('/setup/status'),
  // Lanza ApiError si el servidor rechaza la configuración (403 del token, 400 del puerto...)
  init: (setupToken: string, vaultPath: string, password: string, port: number = 3000) =>
    post<{ success?: boolean; error?: string }>('/setup/init', { setupToken, vaultPath, password, port }),
};

export const authApi = {
  // El formulario muestra el `error` del servidor (contraseña incorrecta, demasiados intentos...)
  login: (password: string) => post('/auth/login', { password }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const filesApi = {
  getTree: (): Promise<TreeItem[]> => request('/files/tree'),
  // `version` identifica el contenido leído; se pasa al guardar para detectar conflictos.
  // Con `knownVersion` (ya se tiene la nota), el servidor responde `unchanged` si sigue igual,
  // sin devolver el contenido
  readFile: async (
    filePath: string,
    knownVersion?: string,
  ): Promise<{ content: string; version: string; unchanged?: boolean }> => {
    const query = knownVersion ? `?version=${encodeURIComponent(knownVersion)}` : '';
    const res = await send(`/files/read/${encodeURIComponent(filePath)}${query}`);
    if (res.status === 304) return { content: '', version: knownVersion!, unchanged: true };
    return res.json();
  },
  // Con `baseVersion`, lanza ConflictError si la nota ha cambiado en el servidor desde entonces
  writeFile: (filePath: string, content: string, baseVersion?: string): Promise<{ version: string }> =>
    post(`/files/write/${encodeURIComponent(filePath)}`, { content, baseVersion }),
  deleteFile: (filePath: string) => request(`/files/${encodeURIComponent(filePath)}`, { method: 'DELETE' }),
  // `updated`: notas cuyos enlaces ha reescrito el servidor para seguir el cambio de ruta
  renameFile: (oldPath: string, newPath: string): Promise<{ updated: string[] }> =>
    post('/files/rename', { oldPath, newPath }),
  copyFile: (path: string): Promise<{ path: string }> => post('/files/copy', { path }),
  // `content`: contenido inicial (vacía si se omite)
  createNote: (path: string, content?: string) => post('/files/create-note', { path, content }),
  // Devuelve la ruta dentro del vault donde se ha guardado el adjunto
  uploadAttachment: (notePath: string, file: Blob, name: string): Promise<{ path: string }> =>
    upload(new URLSearchParams({ note: notePath, name }), file),
  // Sube un archivo (nota o imagen) a la carpeta `folder` ('' = raíz); devuelve la ruta guardada
  uploadToFolder: (folder: string, file: Blob, name: string): Promise<{ path: string }> =>
    upload(new URLSearchParams({ folder, name }), file),
  createFolder: (path: string) => post('/files/create-folder', { path }),
  downloadFolder: (path: string) => {
    return `${API_URL}/files/download-folder/${encodeURIComponent(path)}`;
  },
};

// El archivo va tal cual en el cuerpo; nombre y destino, en la query
const upload = (params: URLSearchParams, file: Blob) =>
  request<{ path: string }>(`/files/upload?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

export const trashApi = {
  list: (): Promise<TrashItem[]> => request('/files/trash'),
  // Devuelve la ruta donde ha quedado (otro nombre si la original ya estaba ocupada)
  restore: (id: string): Promise<{ path: string }> => post('/files/trash/restore', { id }),
  purge: (id: string) => post('/files/trash/delete', { id }),
  empty: () => post('/files/trash/empty'),
};

// Ajustes de los plugins de notas diarias y plantillas de Obsidian ('' = valor por defecto)
export interface NotesConfig {
  dailyNotes: { folder: string; format: string; template: string };
  templates: { folder: string; dateFormat: string; timeFormat: string };
}

export interface NotesConfigUpdate {
  dailyNotes?: Partial<NotesConfig['dailyNotes']>;
  templates?: Partial<NotesConfig['templates']>;
}

export interface UpdateStatus {
  enabled: boolean;
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  url: string;
}

export const settingsApi = {
  getUpdate: (): Promise<UpdateStatus> => request('/settings/update'),
  getNotes: (): Promise<NotesConfig> => request('/settings/notes'),
  setNotes: (changes: NotesConfigUpdate): Promise<NotesConfig> => post('/settings/notes', changes),
  getLimits: (): Promise<ServerLimits> => request('/settings/limits'),
  getVault: (): Promise<{ vaultPath: string }> => request('/settings/vault'),
  // Exige la contraseña actual además de la sesión
  setVault: (vaultPath: string, password: string): Promise<{ vaultPath: string }> =>
    post('/settings/vault', { vaultPath, password }),
  // Cierra las demás sesiones; la actual recibe una cookie nueva
  changePassword: (currentPassword: string, newPassword: string) =>
    post('/settings/password', { currentPassword, newPassword }),
  // Cierra todas las sesiones, también la actual
  revokeSessions: () => request('/settings/sessions/revoke', { method: 'POST' }),
  setSiteTitle: (siteTitle: string): Promise<{ siteTitle: string }> => post('/settings/site-title', { siteTitle }),
  getUploads: (): Promise<UploadExtensions> => request('/settings/uploads'),
  // Lista vacía = volver a las predeterminadas (notas e imágenes)
  setUploads: (extensions: string): Promise<UploadExtensions> => post('/settings/uploads', { extensions }),
  getAttachments: (): Promise<{ attachmentFolderPath: string }> => request('/settings/attachments'),
  setAttachments: (attachmentFolderPath: string): Promise<{ attachmentFolderPath: string }> =>
    post('/settings/attachments', { attachmentFolderPath }),
  downloadVaultUrl: (opts: { git?: boolean; trash?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.git) params.set('git', '1');
    if (opts.trash) params.set('trash', '1');
    const qs = params.toString();
    return `${API_URL}/settings/download-vault${qs ? `?${qs}` : ''}`;
  },
};

export interface UploadExtensions {
  extensions: string[];
  defaults: string[];
}

export type SyncProvider = 'none' | 'github';

export interface SyncConfig {
  provider: SyncProvider;
  interval: number;
  github: { repo: string; branch: string; authorName: string; authorEmail: string; hasToken: boolean };
  status: {
    running: boolean;
    lastSync: string | null;
    lastAttempt: string | null;
    lastError: string | null;
    lastMessage: string | null;
  };
}

// El token se envía solo al cambiarlo (string vacío = no tocar, null = borrar)
export interface SyncConfigUpdate {
  provider?: SyncProvider;
  interval?: number;
  github?: Partial<{ repo: string; branch: string; authorName: string; authorEmail: string; token: string | null }>;
}

// Commit de git que ha tocado una nota; `path` es la ruta que tenía la nota en ese commit
export interface NoteCommit {
  hash: string;
  date: number;
  author: string;
  message: string;
  path: string;
}

export const syncApi = {
  get: (): Promise<SyncConfig> => request('/sync'),
  configure: (changes: SyncConfigUpdate): Promise<SyncConfig> => post('/sync/config', changes),
  // Espera a que termine; el resultado va en status (lastError / lastMessage)
  run: (): Promise<SyncConfig> => request('/sync/run', { method: 'POST' }),
  // Historial de versiones de una nota (solo con la sincronización con GitHub activa)
  history: (path: string): Promise<NoteCommit[]> => request(`/sync/history?${new URLSearchParams({ path })}`),
  // Contenido de la nota en ese commit y los cambios que introdujo (diff de git)
  version: (path: string, commit: string): Promise<NoteCommit & { content: string; diff: string }> =>
    request(`/sync/history/version?${new URLSearchParams({ path, commit })}`),
};

export interface VaultTag {
  tag: string;
  paths: string[];
}

// Espera cancelable: se rechaza con AbortError si se aborta antes (al cambiar la consulta o
// cerrar el panel), para no seguir reintentando en segundo plano
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Ante un 429 espera lo que indique `Retry-After` (con algo de margen para el redondeo) y repite,
// hasta `retries` veces: una ráfaga de búsquedas se resume sola en vez de dejar el panel en error
async function withRetry<T>(
  run: () => Promise<T>,
  signal: AbortSignal | undefined,
  retries: number,
  onWait?: (ms: number) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (!(err instanceof RateLimitError) || attempt >= retries) throw err;
      const wait = Math.min(err.retryAfterMs + 250, 5 * 60_000);
      onWait?.(wait);
      await sleep(wait, signal);
    }
  }
}

export const searchApi = {
  // `onWait` se llama antes de cada espera por el límite, para poder avisar al usuario
  search: async (
    q: string,
    signal?: AbortSignal,
    opts: { retries?: number; onWait?: (ms: number) => void } = {},
  ): Promise<SearchResult[]> => {
    const { retries = 1, onWait } = opts;
    return withRetry(() => request(`/search?q=${encodeURIComponent(q)}`, { signal }), signal, retries, onWait);
  },
  // Etiquetas del vault y notas en las que aparece cada una
  tags: async (
    opts: { signal?: AbortSignal; retries?: number; onWait?: (ms: number) => void } = {},
  ): Promise<VaultTag[]> => {
    const { signal, retries = 1, onWait } = opts;
    return withRetry(() => request('/search/tags', { signal }), signal, retries, onWait);
  },
};
