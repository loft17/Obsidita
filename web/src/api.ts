import { t } from './i18n';

const API_URL = '/api';

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
  checkStatus: async (): Promise<{ configured: boolean; minPasswordLength?: number }> => {
    const res = await fetch(`${API_URL}/setup/status`);
    return res.json();
  },
  init: async (setupToken: string, vaultPath: string, password: string, port: number = 3000) => {
    const res = await fetch(`${API_URL}/setup/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupToken, vaultPath, password, port }),
    });
    return res.json();
  },
};

export const authApi = {
  login: async (password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    // El formulario muestra `error` (contraseña incorrecta, demasiados intentos...)
    if (!res.ok) throw await res.json().catch(() => ({}));
    return res.json();
  },
  logout: async () => {
    const res = await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
    });
    return res.json();
  },
};

// La nota ha cambiado en el servidor desde la versión que se leyó: trae la versión actual
export class ConflictError extends Error {
  constructor(public content: string, public version: string) {
    super(t('conflict.title'));
  }
}

export const filesApi = {
  getTree: async () => {
    const res = await fetch(`${API_URL}/files/tree`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // `version` identifica el contenido leído; se pasa al guardar para detectar conflictos
  readFile: async (filePath: string): Promise<{ content: string; version: string }> => {
    const res = await fetch(`${API_URL}/files/read/${encodeURIComponent(filePath)}`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Con `baseVersion`, lanza ConflictError si la nota ha cambiado en el servidor desde entonces
  writeFile: async (filePath: string, content: string, baseVersion?: string): Promise<{ version: string }> => {
    const res = await fetch(`${API_URL}/files/write/${encodeURIComponent(filePath)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, baseVersion }),
    });
    if (res.status === 409) {
      const data = await res.json();
      throw new ConflictError(data.content, data.version);
    }
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  deleteFile: async (filePath: string) => {
    const res = await fetch(`${API_URL}/files/${encodeURIComponent(filePath)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // `updated`: notas cuyos enlaces ha reescrito el servidor para seguir el cambio de ruta
  renameFile: async (oldPath: string, newPath: string): Promise<{ updated: string[] }> => {
    const res = await fetch(`${API_URL}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  copyFile: async (path: string): Promise<{ path: string }> => {
    const res = await fetch(`${API_URL}/files/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // `content`: contenido inicial (vacía si se omite)
  createNote: async (path: string, content?: string) => {
    const res = await fetch(`${API_URL}/files/create-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Devuelve la ruta dentro del vault donde se ha guardado el adjunto
  uploadAttachment: async (notePath: string, file: Blob, name: string): Promise<{ path: string }> => {
    const params = new URLSearchParams({ note: notePath, name });
    const res = await fetch(`${API_URL}/files/upload?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  createFolder: async (path: string) => {
    const res = await fetch(`${API_URL}/files/create-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  downloadFolder: (path: string) => {
    return `${API_URL}/files/download-folder/${encodeURIComponent(path)}`;
  },
};

export interface TrashItem {
  id: string; // nombre dentro de .trash
  path: string; // ruta original en el vault
  name: string;
  isFolder: boolean;
  deletedAt: number;
}

const postJson = async (url: string, body?: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
};

export const trashApi = {
  list: async (): Promise<TrashItem[]> => {
    const res = await fetch(`${API_URL}/files/trash`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Devuelve la ruta donde ha quedado (otro nombre si la original ya estaba ocupada)
  restore: (id: string): Promise<{ path: string }> => postJson(`${API_URL}/files/trash/restore`, { id }),
  purge: (id: string) => postJson(`${API_URL}/files/trash/delete`, { id }),
  empty: () => postJson(`${API_URL}/files/trash/empty`),
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
  getUpdate: async (): Promise<UpdateStatus> => {
    const res = await fetch(`${API_URL}/settings/update`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  getNotes: async (): Promise<NotesConfig> => {
    const res = await fetch(`${API_URL}/settings/notes`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  setNotes: (changes: NotesConfigUpdate): Promise<NotesConfig> => postJson(`${API_URL}/settings/notes`, changes),
  getLimits: async (): Promise<ServerLimits> => {
    const res = await fetch(`${API_URL}/settings/limits`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  getVault: async (): Promise<{ vaultPath: string }> => {
    const res = await fetch(`${API_URL}/settings/vault`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Exige la contraseña actual además de la sesión
  setVault: async (vaultPath: string, password: string): Promise<{ vaultPath: string }> => {
    const res = await fetch(`${API_URL}/settings/vault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vaultPath, password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Cierra las demás sesiones; la actual recibe una cookie nueva
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await fetch(`${API_URL}/settings/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Cierra todas las sesiones, también la actual
  revokeSessions: async () => {
    const res = await fetch(`${API_URL}/settings/sessions/revoke`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  getAttachments: async (): Promise<{ attachmentFolderPath: string }> => {
    const res = await fetch(`${API_URL}/settings/attachments`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  setAttachments: async (attachmentFolderPath: string): Promise<{ attachmentFolderPath: string }> => {
    const res = await fetch(`${API_URL}/settings/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentFolderPath }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  downloadVaultUrl: (opts: { git?: boolean; trash?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.git) params.set('git', '1');
    if (opts.trash) params.set('trash', '1');
    const qs = params.toString();
    return `${API_URL}/settings/download-vault${qs ? `?${qs}` : ''}`;
  },
};

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
  get: async (): Promise<SyncConfig> => {
    const res = await fetch(`${API_URL}/sync`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  configure: async (changes: SyncConfigUpdate): Promise<SyncConfig> => {
    const res = await fetch(`${API_URL}/sync/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Espera a que termine; el resultado va en status (lastError / lastMessage)
  run: async (): Promise<SyncConfig> => {
    const res = await fetch(`${API_URL}/sync/run`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Historial de versiones de una nota (solo con la sincronización con GitHub activa)
  history: async (path: string): Promise<NoteCommit[]> => {
    const res = await fetch(`${API_URL}/sync/history?${new URLSearchParams({ path })}`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Contenido de la nota en ese commit y los cambios que introdujo (diff de git)
  version: async (path: string, commit: string): Promise<NoteCommit & { content: string; diff: string }> => {
    const res = await fetch(`${API_URL}/sync/history/version?${new URLSearchParams({ path, commit })}`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
};

export interface SearchMatch {
  line: number;
  text: string;
  start: number;
  length: number;
}

export interface SearchResult {
  path: string;
  name: string;
  nameMatch: boolean;
  total: number;
  matches: SearchMatch[];
}

export interface VaultTag {
  tag: string;
  paths: string[];
}

export const searchApi = {
  search: async (q: string, signal?: AbortSignal): Promise<SearchResult[]> => {
    const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  // Etiquetas del vault y notas en las que aparece cada una
  tags: async (): Promise<VaultTag[]> => {
    const res = await fetch(`${API_URL}/search/tags`);
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
};
