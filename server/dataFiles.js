import { openSync, writeSync, fsyncSync, closeSync, renameSync, rmSync, mkdirSync, readdirSync, lstatSync, copyFileSync, chmodSync } from 'fs';
import { join, dirname, basename } from 'path';
import crypto from 'crypto';
import { createLogger } from './logger.js';
const log = createLogger('Data');

const BACKUP_DIR = 'backups';
const MAX_BACKUPS = 10; // se conservan las copias más recientes

// Escritura atómica: se escribe en un temporal junto al destino, se fuerza a disco y se
// renombra encima. Un corte o un fallo a mitad deja el archivo anterior intacto en lugar
// de uno vacío o truncado (rename en el mismo directorio es atómico)
export const writeFileAtomic = (path, data, mode = 0o600) => {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  let fd;
  try {
    fd = openSync(tmp, 'wx', mode);
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, path);
  } catch (err) {
    if (fd !== undefined) closeSync(fd);
    rmSync(tmp, { force: true });
    throw err;
  }
};

// Copia de seguridad de los archivos de data/ (config, sesiones, sync, secreto) antes de
// una operación destructiva, en data/backups/<fecha>-<motivo>/. Nunca impide la operación:
// si falla solo se avisa en el log. Devuelve la carpeta creada o null
export const backupData = (dataDir, reason) => {
  try {
    const files = readdirSync(dataDir).filter((f) => !f.endsWith('.tmp') && lstatSync(join(dataDir, f)).isFile());
    if (!files.length) return null;
    const root = join(dataDir, BACKUP_DIR);
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = join(root, `${stamp}-${reason.replace(/[^a-z0-9-]/gi, '_')}`);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    for (const f of files) {
      const dest = join(dir, f);
      copyFileSync(join(dataDir, f), dest);
      chmodSync(dest, 0o600);
    }
    // Rotación: los nombres empiezan por la fecha ISO, así que el orden alfabético es el cronológico
    const old = readdirSync(root).sort().slice(0, -MAX_BACKUPS);
    for (const d of old) rmSync(join(root, d), { recursive: true, force: true });
    log.info(`Copia de seguridad de data/ en ${dir}`);
    return dir;
  } catch (err) {
    log.warn('No se pudo hacer la copia de seguridad de data/:', err.message);
    return null;
  }
};
