import { Router } from 'express';
import { mkdirSync, existsSync, statSync, readdirSync } from 'fs';
import { readdir, lstat } from 'fs/promises';
import { join } from 'path';
import * as vault from '../vault.js';
import { publicError } from '../security.js';
import { verifyPassword, hashPassword, MIN_PASSWORD_LENGTH } from '../password.js';
import { sessionCookie } from '../sessions.js';
import * as limits from '../limits.js';
import { loadZipArchive, ZIP_LEVEL } from '../lazy.js';
import { getUpdateStatus } from '../updates.js';
import { DEFAULT_UPLOAD_EXTENSIONS, parseUploadExtensions, uploadExtensions } from '../uploads.js';
import { writeFileAtomic, backupData } from '../dataFiles.js';
import { createLogger } from '../logger.js';
const log = createLogger('Settings');

export default (dataDir, getConfig, limiter, sessions) => {
  const router = Router();
  const configPath = join(dataDir, 'config.json');

  router.get('/vault', (req, res) => {
    res.json({ vaultPath: getConfig()?.vaultPath || '' });
  });

  // Límites del servidor (variables de entorno): solo lectura, se muestran en Preferencias
  router.get('/limits', (req, res) => {
    const MB = 1024 * 1024;
    const DAY = 24 * 60 * 60 * 1000;
    res.json({
      maxNoteMB: limits.MAX_NOTE_MB,
      maxUploadMB: limits.MAX_UPLOAD_MB,
      minPasswordLength: limits.MIN_PASSWORD_LENGTH,
      searchMaxQueryLength: limits.SEARCH_MAX_QUERY_LENGTH,
      searchMaxFileMB: limits.SEARCH_MAX_FILE_BYTES / MB,
      searchMaxScannedMB: limits.SEARCH_MAX_SCANNED_BYTES / MB,
      searchRateMax: limits.SEARCH_RATE_MAX,
      searchMaxResults: limits.SEARCH_MAX_RESULTS,
      searchMaxMatchesPerFile: limits.SEARCH_MAX_MATCHES_PER_FILE,
      sessionMaxDays: limits.SESSION_MAX_AGE / DAY,
      sessionIdleDays: limits.SESSION_IDLE / DAY,
    });
  });

  // ¿Hay una versión nueva en GitHub? Se muestra en "Acerca de" y como aviso al entrar
  router.get('/update', async (req, res) => {
    res.json(await getUpdateStatus());
  });

  // Tamaño del vault para "Acerca de": suma todo lo que hay dentro (también .obsidian, .trash
  // y .git, que ocupan disco igual), sin seguir enlaces simbólicos. Las cuentas de notas y
  // archivos solo incluyen lo visible en el árbol. Asíncrono para no bloquear con vaults grandes
  router.get('/vault-stats', async (req, res) => {
    const cfg = getConfig();
    if (!cfg?.vaultPath) return res.status(400).json({ error: 'Not configured' });
    const stats = { size: 0, notes: 0, files: 0, folders: 0 };
    const walk = async (dir, hidden) => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const fullPath = join(dir, entry.name);
        const isHidden = hidden || entry.name.startsWith('.');
        if (entry.isDirectory()) {
          if (!isHidden) stats.folders++;
          await walk(fullPath, isHidden);
        } else if (entry.isFile()) {
          try {
            stats.size += (await lstat(fullPath)).size;
          } catch {
            continue;
          }
          if (isHidden) continue;
          if (entry.name.endsWith('.md')) stats.notes++;
          else stats.files++;
        }
      }
    };
    await walk(cfg.vaultPath, false);
    res.json(stats);
  });

  // getConfig relee config.json en cada petición, así que el cambio se aplica al instante.
  // Cambiar el vault da acceso a otra carpeta del servidor, así que además de la sesión
  // exige la contraseña actual (con el mismo límite de intentos que el login)
  router.post('/vault', async (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const attempt = limiter.begin(req.ip);
    const { wait } = attempt;
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${Math.ceil(wait / 60)} min` });
    }
    try {
      if (!(await verifyPassword(req.body?.password, cfg.passwordHash))) {
        attempt.fail();
        return res.status(403).json({ error: 'Contraseña incorrecta' });
      }
      attempt.succeed();
    } catch (err) {
      return res.status(500).json({ error: publicError(err, 'No se pudo cambiar la ruta') });
    } finally {
      attempt.release();
    }
    let full;
    try {
      full = vault.checkVaultPath(req.body?.vaultPath, dataDir);
    } catch (err) {
      return res.status(400).json({ error: publicError(err) });
    }
    try {
      if (existsSync(full) && !statSync(full).isDirectory()) {
        return res.status(400).json({ error: 'La ruta existe pero no es una carpeta' });
      }
      mkdirSync(full, { recursive: true });
      backupData(dataDir, 'vault-path');
      writeFileAtomic(configPath, JSON.stringify({ ...cfg, vaultPath: full }, null, 2));
      res.json({ vaultPath: full });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo cambiar la ruta') });
    }
  });

  // Cambiar la contraseña exige la actual (con el límite de intentos del login) y cierra
  // todas las sesiones salvo la de quien la cambia, que recibe una cookie nueva
  router.post('/password', async (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const attempt = limiter.begin(req.ip);
    const { wait } = attempt;
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${Math.ceil(wait / 60)} min` });
    }
    const { currentPassword, newPassword } = req.body ?? {};
    try {
      if (!(await verifyPassword(currentPassword, cfg.passwordHash))) {
        attempt.fail();
        return res.status(403).json({ error: 'Contraseña incorrecta' });
      }
      attempt.succeed();
      if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `La contraseña nueva debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
      }
      const passwordHash = await hashPassword(newPassword);
      backupData(dataDir, 'password');
      writeFileAtomic(configPath, JSON.stringify({ ...getConfig(), passwordHash }, null, 2));
      sessions.destroyAll();
      res.cookie('token', sessions.create(), sessionCookie(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo cambiar la contraseña') });
    } finally {
      attempt.release();
    }
  });

  // Cierra todas las sesiones abiertas, también la actual
  router.post('/sessions/revoke', (req, res) => {
    backupData(dataDir, 'revoke-sessions');
    sessions.destroyAll();
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: req.secure });
    res.json({ success: true });
  });

  // Título de la web (pestaña del navegador y pantalla de login). Vacío = el predeterminado
  const MAX_SITE_TITLE = 60;
  router.post('/site-title', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const siteTitle = String(req.body?.siteTitle ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (siteTitle.length > MAX_SITE_TITLE) {
      return res.status(400).json({ error: `El título no puede superar los ${MAX_SITE_TITLE} caracteres` });
    }
    try {
      const { siteTitle: _, ...rest } = cfg;
      writeFileAtomic(configPath, JSON.stringify(siteTitle ? { ...rest, siteTitle } : rest, null, 2));
      res.json({ siteTitle });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Mostrar imágenes externas (https) en las notas. Desactivado por defecto: cargarlas revela
  // la IP al servidor que las aloja. Lo aplica la CSP (security.js), que relee config.json
  router.get('/remote-images', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json({ remoteImages: cfg.remoteImages === true });
  });

  router.post('/remote-images', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const remoteImages = req.body?.remoteImages === true;
    try {
      const { remoteImages: _, ...rest } = cfg;
      writeFileAtomic(configPath, JSON.stringify(remoteImages ? { ...rest, remoteImages } : rest, null, 2));
      res.json({ remoteImages });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Extensiones que se pueden subir al explorador. Vacío o null = las predeterminadas
  router.get('/uploads', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json({ extensions: uploadExtensions(cfg), defaults: DEFAULT_UPLOAD_EXTENSIONS });
  });

  router.post('/uploads', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    let extensions;
    try {
      extensions = parseUploadExtensions(req.body?.extensions);
    } catch (err) {
      return res.status(400).json({ error: publicError(err) });
    }
    try {
      const { uploadExtensions: _, ...rest } = cfg;
      writeFileAtomic(configPath, JSON.stringify(extensions.length ? { ...rest, uploadExtensions: extensions } : rest, null, 2));
      res.json({ extensions: uploadExtensions(extensions.length ? { uploadExtensions: extensions } : null), defaults: DEFAULT_UPLOAD_EXTENSIONS });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Ubicación de los adjuntos nuevos, en el mismo formato que Obsidian (attachmentFolderPath)
  router.get('/attachments', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json({ attachmentFolderPath: vault.readAppConfig(cfg.vaultPath).attachmentFolderPath ?? '/' });
  });

  router.post('/attachments', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const value = String(req.body?.attachmentFolderPath ?? '/').trim().replace(/\\/g, '/');
    const parts = value.split('/');
    if (parts.includes('..') || parts.some((p) => ['.obsidian', '.git'].includes(p.toLowerCase()))) {
      return res.status(400).json({ error: 'Ruta no válida' });
    }
    try {
      vault.updateAppConfig(cfg.vaultPath, { attachmentFolderPath: value || '/' });
      res.json({ attachmentFolderPath: value || '/' });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Notas diarias y plantillas, en los mismos archivos que sus plugins en Obsidian de escritorio
  // (.obsidian/daily-notes.json y .obsidian/templates.json). Las claves ausentes usan el valor por defecto
  const readNotesConfig = (vaultPath) => {
    const daily = vault.readObsidianConfig(vaultPath, 'daily-notes.json');
    const templates = vault.readObsidianConfig(vaultPath, 'templates.json');
    const str = (v) => (typeof v === 'string' ? v : '');
    return {
      dailyNotes: { folder: str(daily.folder), format: str(daily.format), template: str(daily.template) },
      templates: { folder: str(templates.folder), dateFormat: str(templates.dateFormat), timeFormat: str(templates.timeFormat) },
    };
  };

  // Ruta dentro del vault: sin "..", ni .obsidian/.git; sin barras al principio ni al final
  const cleanVaultPath = (value) => {
    const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const parts = path.split('/');
    if (parts.includes('..') || parts.some((p) => ['.obsidian', '.git'].includes(p.toLowerCase()))) {
      throw new Error('Ruta no válida');
    }
    return path;
  };

  // Formato de fecha (moment.js); puede incluir "/" para crear subcarpetas, pero no ".."
  const cleanFormat = (value) => {
    const format = String(value ?? '').trim();
    if (format.split('/').includes('..') || format.length > 100) throw new Error('Formato no válido');
    return format;
  };

  router.get('/notes', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json(readNotesConfig(cfg.vaultPath));
  });

  router.post('/notes', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const { dailyNotes, templates } = req.body ?? {};
    try {
      const daily = {};
      if (dailyNotes?.folder !== undefined) daily.folder = cleanVaultPath(dailyNotes.folder);
      if (dailyNotes?.format !== undefined) daily.format = cleanFormat(dailyNotes.format);
      if (dailyNotes?.template !== undefined) daily.template = cleanVaultPath(dailyNotes.template).replace(/\.md$/i, '');
      const tpl = {};
      if (templates?.folder !== undefined) tpl.folder = cleanVaultPath(templates.folder);
      if (templates?.dateFormat !== undefined) tpl.dateFormat = cleanFormat(templates.dateFormat);
      if (templates?.timeFormat !== undefined) tpl.timeFormat = cleanFormat(templates.timeFormat);
      if (Object.keys(daily).length) vault.updateObsidianConfig(cfg.vaultPath, 'daily-notes.json', daily);
      if (Object.keys(tpl).length) vault.updateObsidianConfig(cfg.vaultPath, 'templates.json', tpl);
      res.json(readNotesConfig(cfg.vaultPath));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Descargar el vault completo como ZIP. Se envía por streaming: el navegador lo guarda
  // directamente sin cargarlo en memoria. .git y .trash se excluyen salvo ?git=1 / ?trash=1
  router.get('/download-vault', async (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });

    const excluded = new Set();
    if (req.query.git !== '1') excluded.add('.git');
    if (req.query.trash !== '1') excluded.add('.trash');

    try {
      const ZipArchive = await loadZipArchive();
      const vaultPath = cfg.vaultPath;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `vault-${timestamp}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const archive = new ZipArchive({ zlib: { level: ZIP_LEVEL } });

      archive.on('error', (err) => {
        log.error('Archiver error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: publicError(err, 'No se pudo crear el archivo ZIP') });
        } else {
          // Ya se envió parte del ZIP: cortar la conexión para que la descarga falle en vez de quedar corrupta
          res.destroy(err);
        }
      });

      // Si el usuario cancela la descarga, dejar de comprimir
      res.on('close', () => {
        if (!res.writableFinished) archive.abort();
      });

      archive.pipe(res);

      // Función recursiva para agregar archivos y carpetas
      const addDirToArchive = (dirPath, arcPath = '') => {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          // Los enlaces simbólicos podrían sacar la descarga fuera del vault
          if (entry.isSymbolicLink()) continue;
          if (!arcPath && excluded.has(entry.name)) continue;

          const fullPath = join(dirPath, entry.name);
          const archivePath = arcPath ? `${arcPath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            addDirToArchive(fullPath, archivePath);
          } else if (entry.isFile()) {
            archive.file(fullPath, { name: archivePath });
          }
        }
      };

      addDirToArchive(vaultPath);
      archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: publicError(err, 'No se pudo descargar el vault') });
      }
    }
  });

  return router;
};
