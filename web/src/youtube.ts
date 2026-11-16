// Vídeos de YouTube en las notas: ![[youtube:ID]] o ![[youtube:https://youtu.be/ID]]
const ID = /^[A-Za-z0-9_-]{11}$/;
const FROM_URL = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

// ID del vídeo si el destino de la incrustación es de YouTube; si no, null
export function youtubeId(target: string): string | null {
  const m = /^youtube:\s*(.+)$/i.exec(target.trim());
  if (!m) return null;
  const value = m[1].trim();
  if (ID.test(value)) return value;
  return FROM_URL.exec(value)?.[1] ?? null;
}
