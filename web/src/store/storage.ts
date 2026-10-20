// Persistencia común de las preferencias en localStorage. Si el almacenamiento no está
// disponible, las lecturas devuelven el valor por defecto y las escrituras se ignoran:
// la preferencia solo dura la sesión.
// Las claves marcadas con `synced` se guardan además en el servidor (prefsSync.ts) para que se
// apliquen en todos los dispositivos: aquí solo se avisa del cambio, sin depender de la API

export const readString = (key: string, fallback = ''): string => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

// Guardadas como 'true'/'false'
export const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};

// Un valor ausente o no numérico (o 0) da `fallback`; el resto pasa por `clamp`
export const readNumber = (key: string, fallback: number, clamp: (n: number) => number): number => {
  try {
    const value = Number(localStorage.getItem(key));
    return value ? clamp(value) : fallback;
  } catch {
    return fallback;
  }
};

const syncedKeys = new Set<string>();
let onSyncedChange: ((key: string, value: string | null) => void) | null = null;

// Marca la clave como compartida entre dispositivos; devuelve la propia clave
export const synced = (key: string) => {
  syncedKeys.add(key);
  return key;
};
export const getSyncedKeys = () => [...syncedKeys];
export const setSyncedChangeHandler = (handler: typeof onSyncedChange) => {
  onSyncedChange = handler;
};

export const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Escribe sin avisar al servidor (lo usa la sincronización al aplicar lo que llega de él)
export const writeRaw = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // almacenamiento no disponible: la preferencia solo dura la sesión
  }
};

// `null` borra la clave. Si es compartida y cambia de verdad, se avisa para subirla al servidor
export const save = (key: string, value: string | number | boolean | null) => {
  const text = value === null ? null : String(value);
  const changed = readRaw(key) !== text;
  writeRaw(key, text);
  if (changed && syncedKeys.has(key)) onSyncedChange?.(key, text);
};
