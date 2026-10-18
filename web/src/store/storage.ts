// Persistencia común de las preferencias en localStorage. Si el almacenamiento no está
// disponible, las lecturas devuelven el valor por defecto y las escrituras se ignoran:
// la preferencia solo dura la sesión

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

// `null` borra la clave
export const save = (key: string, value: string | number | boolean | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  } catch {
    // almacenamiento no disponible: la preferencia solo dura la sesión
  }
};
