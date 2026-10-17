// Cálculo de rutas al renombrar y mover. Sin dependencias de React ni del editor, para poder
// probarlo aparte y tener la regla de las extensiones en un único sitio

export const fileName = (path: string) => path.split('/').pop() || path;

export const filePathParent = (path: string) =>
  path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';

// Renombrar dentro de la misma carpeta: a las notas sin extensión se les añade .md, para que
// sigan abriéndose como notas. Una carpeta nunca lleva extensión
export const renamedPath = (oldPath: string, newName: string, isFolder?: boolean) => {
  const ext = !isFolder && /\.md$/i.test(oldPath) && !/\.md$/i.test(newName) ? '.md' : '';
  const folder = filePathParent(oldPath);
  return `${folder ? folder + '/' : ''}${newName}${ext}`;
};

// Mover a otra carpeta conservando el nombre ('' es la raíz de la bóveda)
export const movedPath = (oldPath: string, folder: string) =>
  `${folder ? folder + '/' : ''}${fileName(oldPath)}`;
