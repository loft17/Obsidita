import { readFileSync, writeFileSync, readdirSync, statSync, lstatSync, realpathSync, mkdirSync, renameSync, existsSync, copyFileSync, cpSync, rmSync } from 'fs';
import { join, resolve, relative, dirname, basename, extname, isAbsolute, sep } from 'path';
import { createHash } from 'crypto';

// Como existsSync, pero también cuenta los enlaces simbólicos rotos
const entryExists = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

const isInside = (root, target) => {
  const rel = relative(root, target);
  return !rel.startsWith('..') && !isAbsolute(rel);
};

const guardPath = (vaultPath, userPath) => {
  const root = resolve(vaultPath);
  const resolved = resolve(root, userPath);
  const rel = relative(root, resolved);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Path traversal attempt');
  }
  // .obsidian/ guarda los plugins de Obsidian de escritorio (código que se ejecuta en tu PC
  // al sincronizar) y sus datos (a veces tokens): no se puede leer ni modificar desde la web.
  // Los ajustes que sí necesita la web (app.json) se leen y escriben aparte, en readAppConfig/updateAppConfig
  // .git/ igual: sus hooks y su config (core.fsmonitor...) ejecutan código en el servidor
  // cada vez que la sincronización con GitHub lanza git
  if (['.obsidian', '.git'].includes(rel.split(sep)[0].toLowerCase())) {
    throw new Error('Ruta protegida');
  }
  // Los enlaces simbólicos no pueden sacar la ruta fuera de la bóveda: se resuelve
  // el ancestro más cercano que exista (la ruta final puede no existir aún al crear).
  // Un enlace roto hace fallar realpathSync, así que tampoco se puede escribir a través de él
  let existing = resolved;
  while (!entryExists(existing) && dirname(existing) !== existing) existing = dirname(existing);
  if (!isInside(realpathSync(root), realpathSync(existing))) {
    throw new Error('Path traversal attempt');
  }
  return resolved;
};

// Carpetas del sistema que nunca pueden ser (ni contener) un vault
const SYSTEM_DIRS = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64', '/libx32', '/proc', '/run', '/sbin', '/snap', '/sys', '/usr', '/var'];

// Valida la ruta de un vault nuevo y devuelve la ruta absoluta. Evita que desde la web
// se apunte el vault a "/", a carpetas del sistema, a una carpeta personal entera o a la
// carpeta de la app o a su data/ (código, contraseña, secreto de cookies, sesiones), o a una
// carpeta oculta (~/.ssh...), lo que daría acceso de lectura/escritura a todo eso. Con VAULTS_ROOT definido, el vault debe estar dentro.
export const checkVaultPath = (vaultPath, dataDir) => {
  const input = String(vaultPath ?? '').trim();
  if (!input || !isAbsolute(input)) throw new Error('La ruta debe ser absoluta');
  let full = resolve(input);
  // Si existe (o existe un ancestro), se resuelven los enlaces simbólicos
  let existing = full;
  while (!entryExists(existing) && dirname(existing) !== existing) existing = dirname(existing);
  try {
    full = join(realpathSync(existing), relative(existing, full));
  } catch {
    throw new Error('Ruta no válida');
  }

  const forbidden = () => new Error('Esa carpeta no se puede usar como vault');
  if (dirname(full) === full) throw forbidden(); // raíz del sistema
  for (const dir of SYSTEM_DIRS) {
    if (full === dir || isInside(dir, full)) throw forbidden();
  }
  // Carpetas personales completas (sí se permiten subcarpetas: /root/MiVault)
  if (full === '/root' || full === '/home' || dirname(full) === '/home') throw forbidden();
  // Ni la carpeta de la app (código del servidor: escribir en ella sería ejecutar código)
  // ni su carpeta data/ (contraseña, secreto de cookies, sesiones)
  const data = resolve(dataDir);
  const appDir = dirname(data);
  if (full === data || isInside(full, data) || isInside(data, full)) throw forbidden();
  if (full === appDir || isInside(full, appDir) || isInside(appDir, full)) throw forbidden();
  // Carpetas ocultas (~/.ssh, ~/.config, ~/.local...): guardan claves y configuración
  // que se ejecuta (authorized_keys, servicios de systemd, autostart...)
  if (full.split(sep).some((part) => part.startsWith('.'))) throw forbidden();

  const allowedRoot = process.env.VAULTS_ROOT;
  if (allowedRoot && !isInside(resolve(allowedRoot), full)) {
    throw new Error(`El vault debe estar dentro de ${resolve(allowedRoot)}`);
  }
  return full;
};

const toVaultPath =(vaultPath, fullPath) => relative(resolve(vaultPath), fullPath).split('\\').join('/');

export const resolveFile = (vaultPath, filePath) => guardPath(vaultPath, filePath);

export const readFile =(vaultPath, filePath) => {
  const fullPath = guardPath(vaultPath, filePath);
  return readFileSync(fullPath, 'utf8');
};

// Versión de una nota: hash de su contenido. Sirve para detectar que ha cambiado
// en otro sitio (otro dispositivo, la sincronización, Obsidian de escritorio...)
export const contentVersion = (content) => createHash('sha1').update(content, 'utf8').digest('hex');

export class ConflictError extends Error {
  constructor(content) {
    super('La nota ha cambiado en otro sitio');
    this.content = content;
    this.version = contentVersion(content);
  }
}

// Con `baseVersion` (la versión que leyó el cliente), solo escribe si la nota no ha
// cambiado desde entonces; si ha cambiado, lanza ConflictError con el contenido actual.
// Si la nota ya no existe se vuelve a crear: así no se pierde lo escrito.
export const writeFile = (vaultPath, filePath, content, baseVersion) => {
  const fullPath = guardPath(vaultPath, filePath);
  if (baseVersion && existsSync(fullPath)) {
    const current = readFileSync(fullPath, 'utf8');
    if (contentVersion(current) !== baseVersion && current !== content) throw new ConflictError(current);
  }
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
  return contentVersion(content);
};

// Papelera: lo borrado se mueve a .trash/ como "nombre.ext.<timestamp>.deleted".
// La ruta original de cada elemento se apunta en .trash/.index.json para poder restaurarlo
const TRASH_INDEX = '.index.json';
const DELETED_SUFFIX = /\.(\d+)\.deleted$/;

// Carpeta .trash, comprobando que no es un enlace simbólico que saque las operaciones fuera del vault
const trashDir = (vaultPath, create = false) => {
  const root = resolve(vaultPath);
  const dir = join(root, '.trash');
  if (create) mkdirSync(dir, { recursive: true });
  if (!entryExists(dir)) return null;
  if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) throw new Error('Papelera no válida');
  return dir;
};

const readTrashIndex = (dir) => {
  try {
    const index = JSON.parse(readFileSync(join(dir, TRASH_INDEX), 'utf8'));
    return index && typeof index === 'object' && !Array.isArray(index) ? index : {};
  } catch {
    return {};
  }
};

const writeTrashIndex = (dir, index) => writeFileSync(join(dir, TRASH_INDEX), JSON.stringify(index, null, 2), 'utf8');

// Elemento de la papelera a partir de su nombre (sin barras ni ocultos: no puede salir de .trash)
const trashEntry = (dir, id) => {
  const name = String(id ?? '');
  if (!name || name.startsWith('.') || /[\\/]/.test(name)) throw new Error('Elemento no válido');
  const full = join(dir, name);
  if (!entryExists(full)) throw new Error('El elemento ya no está en la papelera');
  if (lstatSync(full).isSymbolicLink()) throw new Error('Elemento no válido');
  return full;
};

export const deleteFile = (vaultPath, filePath) => {
  const fullPath = guardPath(vaultPath, filePath);
  if (!entryExists(fullPath)) throw new Error('El archivo no existe');
  const dir = trashDir(vaultPath, true);
  const deletedAt = Date.now();
  let id = `${basename(fullPath)}.${deletedAt}.deleted`;
  for (let n = 1; entryExists(join(dir, id)); n++) id = `${basename(fullPath)}.${deletedAt}-${n}.deleted`;
  renameSync(fullPath, join(dir, id));
  const index = readTrashIndex(dir);
  index[id] = { path: toVaultPath(vaultPath, fullPath), deletedAt };
  writeTrashIndex(dir, index);
};

// Contenido de la papelera, lo más reciente primero. Lo borrado antes de existir el índice
// (o desde Obsidian de escritorio) no tiene ruta original: se restaura en la raíz
export const listTrash = (vaultPath) => {
  const dir = trashDir(vaultPath);
  if (!dir) return [];
  const index = readTrashIndex(dir);
  const items = [];
  for (const id of readdirSync(dir)) {
    if (id.startsWith('.')) continue;
    const full = join(dir, id);
    const lstat = lstatSync(full);
    if (lstat.isSymbolicLink()) continue;
    const meta = index[id];
    const suffix = id.match(DELETED_SUFFIX);
    const path = typeof meta?.path === 'string' ? meta.path : suffix ? id.slice(0, suffix.index) : id;
    items.push({
      id,
      path,
      name: path.split('/').pop(),
      isFolder: lstat.isDirectory(),
      deletedAt: Number(meta?.deletedAt) || (suffix ? Number(suffix[1]) : lstat.mtimeMs),
    });
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
};

// Devuelve a su ruta original; si ya hay algo ahí, como "Nombre 1.md", "Nombre 2.md"...
// Si la carpeta original ya no existe se vuelve a crear
export const restoreFromTrash = (vaultPath, id) => {
  const dir = trashDir(vaultPath);
  if (!dir) throw new Error('La papelera está vacía');
  const src = trashEntry(dir, id);
  const item = listTrash(vaultPath).find((i) => i.id === id);
  let dest;
  try {
    dest = guardPath(vaultPath, item.path);
  } catch {
    // Ruta original no válida (o protegida): a la raíz del vault
    dest = guardPath(vaultPath, basename(item.path));
  }
  const ext = item.isFolder ? '' : extname(dest);
  const base = basename(dest, ext);
  for (let n = 1; entryExists(dest); n++) dest = join(dirname(dest), `${base} ${n}${ext}`);
  mkdirSync(dirname(dest), { recursive: true });
  renameSync(src, dest);
  const index = readTrashIndex(dir);
  delete index[id];
  writeTrashIndex(dir, index);
  return toVaultPath(vaultPath, dest);
};

// Borrado definitivo de un elemento de la papelera
export const purgeFromTrash = (vaultPath, id) => {
  const dir = trashDir(vaultPath);
  if (!dir) throw new Error('La papelera está vacía');
  rmSync(trashEntry(dir, id), { recursive: true, force: true });
  const index = readTrashIndex(dir);
  delete index[id];
  writeTrashIndex(dir, index);
};

// Vacía la papelera (los archivos ocultos de .trash no se tocan)
export const emptyTrash = (vaultPath) => {
  const dir = trashDir(vaultPath);
  if (!dir) return;
  for (const id of readdirSync(dir)) {
    if (!id.startsWith('.')) rmSync(join(dir, id), { recursive: true, force: true });
  }
  writeTrashIndex(dir, {});
};

export const renameFile = (vaultPath, oldPath, newPath) => {
  const oldFull = guardPath(vaultPath, oldPath);
  const newFull = guardPath(vaultPath, newPath);
  if (oldFull === newFull) return;
  if (!existsSync(oldFull)) throw new Error('El archivo no existe');
  // Una carpeta no puede moverse dentro de sí misma ni de sus subcarpetas
  if (newFull.toLowerCase().startsWith(oldFull.toLowerCase() + sep)) {
    throw new Error('No se puede mover una carpeta dentro de sí misma');
  }
  // Permite cambiar solo mayúsculas/minúsculas en sistemas que no distinguen
  if (existsSync(newFull) && oldFull.toLowerCase() !== newFull.toLowerCase()) {
    throw new Error('Ya existe un archivo con ese nombre');
  }
  mkdirSync(dirname(newFull), { recursive: true });
  renameSync(oldFull, newFull);
};

// Copia el archivo o carpeta junto al original como "Nombre 1.md", "Nombre 2.md"...
export const copyFile = (vaultPath, filePath) => {
  const srcFull = guardPath(vaultPath, filePath);
  if (!existsSync(srcFull)) throw new Error('El archivo no existe');
  const isDir = statSync(srcFull).isDirectory();
  const ext = isDir ? '' : extname(srcFull);
  const base = basename(srcFull, ext);
  let n = 1;
  let destFull;
  // entryExists y no existsSync: un enlace simbólico roto cuenta como ocupado (si no, se
  // escribiría a través de él, fuera del vault)
  do {
    destFull = join(dirname(srcFull), `${base} ${n}${ext}`);
    n++;
  } while (entryExists(destFull));
  if (isDir) cpSync(srcFull, destFull, { recursive: true });
  else copyFileSync(srcFull, destFull);
  return toVaultPath(vaultPath, destFull);
};

// Ajustes de Obsidian compartidos con la app de escritorio. Solo se tocan estos archivos de .obsidian/:
// app.json (carpeta de adjuntos), daily-notes.json (notas diarias) y templates.json (plantillas)
const OBSIDIAN_CONFIGS = ['app.json', 'daily-notes.json', 'templates.json'];

const obsidianConfigPath = (vaultPath, file) => {
  if (!OBSIDIAN_CONFIGS.includes(file)) throw new Error('Ajuste no válido');
  return join(resolve(vaultPath), '.obsidian', file);
};

export const readObsidianConfig = (vaultPath, file) => {
  try {
    const data = JSON.parse(readFileSync(obsidianConfigPath(vaultPath, file), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
};

export const updateObsidianConfig = (vaultPath, file, changes) => {
  const path = obsidianConfigPath(vaultPath, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...readObsidianConfig(vaultPath, file), ...changes }, null, 2), 'utf8');
};

export const readAppConfig = (vaultPath) => readObsidianConfig(vaultPath, 'app.json');

export const updateAppConfig = (vaultPath, changes) => updateObsidianConfig(vaultPath, 'app.json', changes);

// Carpeta (ruta dentro del vault) donde se guardan los adjuntos de `notePath`,
// según `attachmentFolderPath` de Obsidian:
//   "/" → raíz · "./" → carpeta de la nota · "./sub" → subcarpeta de la nota · "dir" → carpeta fija
export const attachmentFolder = (vaultPath, notePath) => {
  const setting = String(readAppConfig(vaultPath).attachmentFolderPath ?? '/').trim();
  const noteDir = notePath.split('/').slice(0, -1).join('/');
  let folder;
  if (setting === '' || setting === '/') folder = '';
  else if (setting === '.' || setting === './') folder = noteDir;
  else if (setting.startsWith('./')) folder = [noteDir, setting.slice(2)].filter(Boolean).join('/');
  else folder = setting;
  return folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
};

// Guarda un adjunto sin sobrescribir: "imagen.png", "imagen 1.png"...
export const saveAttachment = (vaultPath, folder, fileName, data) => {
  const safeName = basename(fileName.replace(/\\/g, '/')).replace(/[<>:"|?*\x00-\x1f]/g, '') || 'adjunto';
  const ext = extname(safeName);
  const base = basename(safeName, ext);
  let fullPath = guardPath(vaultPath, folder ? `${folder}/${safeName}` : safeName);
  // Con entryExists, un enlace simbólico roto cuenta como ocupado y no se escribe a través de él
  for (let n = 1; entryExists(fullPath); n++) {
    fullPath = join(dirname(fullPath), `${base} ${n}${ext}`);
  }
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
  return toVaultPath(vaultPath, fullPath);
};

// `content`: contenido inicial (p. ej. una plantilla); vacía por defecto
export const createNote = (vaultPath, filePath, content = '') => {
  const fullPath = guardPath(vaultPath, filePath);
  if (existsSync(fullPath)) throw new Error('Ya existe un archivo con ese nombre');
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
};

export const createFolder = (vaultPath, folderPath) => {
  const fullPath = guardPath(vaultPath, folderPath);
  if (existsSync(fullPath)) throw new Error('Ya existe una carpeta con ese nombre');
  mkdirSync(fullPath, { recursive: true });
};

export const listTree = (vaultPath) => {
  const tree = [];
  const walk = (dir, parentPath = '') => {
    // El tipo de cada entrada sale de readdir (sin un lstat por archivo); solo las notas
    // necesitan un stat (tamaño y fecha). Si el sistema de archivos no informa del tipo, se pide
    const items = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of items) {
      const item = entry.name;
      if (item === '.trash' || item.startsWith('.')) continue;
      const fullPath = join(dir, item);
      const known = entry.isFile() || entry.isDirectory() || entry.isSymbolicLink();
      const type = known ? entry : lstatSync(fullPath);
      // Los enlaces simbólicos no se muestran: podrían apuntar fuera de la bóveda o crear ciclos
      if (type.isSymbolicLink()) continue;
      const path = parentPath ? `${parentPath}/${item}` : item;
      if (type.isDirectory()) {
        tree.push({ type: 'folder', path, name: item });
        walk(fullPath, path);
      } else if (item.endsWith('.md')) {
        const stat = statSync(fullPath);
        tree.push({ type: 'file', path, name: item, size: stat.size, mtime: stat.mtimeMs });
      } else {
        tree.push({ type: 'other', path, name: item });
      }
    }
  };
  walk(vaultPath);
  return tree;
};
