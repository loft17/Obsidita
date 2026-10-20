import { getLang } from './i18n';

// Tamaño legible en el idioma de la interfaz: 1,5 MB
export const formatBytes = (bytes: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toLocaleString(getLang(), { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
};
