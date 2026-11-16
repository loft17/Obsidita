// Tipos de datos compartidos entre la API, el store y los componentes

// Entrada del árbol del vault (/files/tree)
export interface TreeItem {
  type: 'folder' | 'file' | 'other';
  path: string;
  name: string;
}

// Elemento de la papelera (/files/trash)
export interface TrashItem {
  id: string; // nombre dentro de .trash
  path: string; // ruta original en el vault
  name: string;
  isFolder: boolean;
  deletedAt: number;
}

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

// Marcador: un archivo, un encabezado de una nota o una carpeta (data/bookmarks.json)
export type BookmarkType = 'file' | 'heading' | 'folder';

export interface Bookmark {
  id: string;
  type: BookmarkType;
  path: string;
  heading?: string; // solo en los de tipo heading
  label?: string; // nombre propio; vacío = el nombre del archivo o encabezado
  group?: string; // nombre de un grupo de BookmarkStore.groups
  createdAt?: number;
}

export interface BookmarkStore {
  groups: string[];
  items: Bookmark[];
}
