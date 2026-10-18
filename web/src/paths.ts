// Utilidades de rutas del vault ('' es la raíz). Sin dependencias de React, del store ni del
// editor, para tener en un único sitio la regla de las extensiones al renombrar y mover

// true si `path` es `base` o está dentro de la carpeta `base`
export const isUnder = (path: string, base: string) => path === base || path.startsWith(base + '/');

// Último segmento de la ruta: el nombre del archivo o carpeta, con extensión
export const fileName = (path: string) => path.split('/').pop() || path;

// Nombre de la nota tal como se muestra (título): sin la extensión .md
export const noteTitle = (path: string) => fileName(path).replace(/\.md$/i, '');

// Carpeta que contiene la ruta ('' si está en la raíz)
export const parentFolder = (path: string) => (path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '');

// `name` dentro de `folder` ('' es la raíz)
export const joinPath = (folder: string, name: string) => `${folder ? folder + '/' : ''}${name}`;

// Renombrar dentro de la misma carpeta: a las notas sin extensión se les añade .md, para que
// sigan abriéndose como notas (así escribir "Nota.md" no da "Nota.md.md"). Una carpeta nunca
// lleva extensión
export const renamedPath = (oldPath: string, newName: string, isFolder?: boolean) => {
  const ext = !isFolder && /\.md$/i.test(oldPath) && !/\.md$/i.test(newName) ? '.md' : '';
  return joinPath(parentFolder(oldPath), newName + ext);
};

// Mover a otra carpeta conservando el nombre
export const movedPath = (oldPath: string, folder: string) => joinPath(folder, fileName(oldPath));

// Solo el markdown se edita como texto: cualquier otro archivo se leería en UTF-8 y al
// autoguardarlo se reescribiría corrompido (un PDF, un ZIP...)
export const isNote = (path: string) => /\.md$/i.test(path);
