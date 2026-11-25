import { Router } from 'express';
import { mkdirSync, existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { readdir, lstat } from 'fs/promises';
import { join } from 'path';
import * as vault from '../vault.js';
import { publicError } from '../security.js';
import { verifyPassword, hashPassword, MIN_PASSWORD_LENGTH } from '../password.js';
import { sessionCookie } from '../sessions.js';
import {
  otpEnabled,
  checkSecondFactor,
  enableOtpConfig,
  regenerateRecoveryCodes,
  newOtpSecret,
  otpUri,
  validOtpSecret,
  verifyEnrollmentCode,
} from '../otp.js';
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

  // Verificación en dos pasos (TOTP). Para activarla: se genera una clave, se confirma con un
  // código de la app y se muestran los códigos de recuperación (solo una vez). Desactivarla o
  // generar códigos nuevos exige la contraseña y un código (de la app o de recuperación)
  router.get('/otp', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json({ enabled: otpEnabled(cfg), recoveryLeft: cfg.otp?.recovery?.length ?? 0 });
  });

  // Devuelve la clave y un QR (SVG como data: URL, permitido por la CSP en img-src) para
  // escanearlo con la app del móvil. La librería se carga solo aquí, al configurar
  router.post('/otp/setup', async (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    if (otpEnabled(cfg)) return res.status(409).json({ error: 'La verificación en dos pasos ya está activada' });
    const secret = newOtpSecret();
    const uri = otpUri(secret);
    let qr = null;
    try {
      const { default: QRCode } = await import('qrcode');
      const svg = await QRCode.toString(uri, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
      qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    } catch (err) {
      log.warn('No se pudo generar el QR de la verificación en dos pasos:', err.message);
    }
    res.json({ secret, uri, qr });
  });

  router.post('/otp/enable', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    if (otpEnabled(cfg)) return res.status(409).json({ error: 'La verificación en dos pasos ya está activada' });
    const secret = String(req.body?.secret ?? '').replace(/[\s-]/g, '').toUpperCase();
    if (!validOtpSecret(secret)) return res.status(400).json({ error: 'Clave no válida' });
    if (!verifyEnrollmentCode(secret, req.body?.code)) {
      return res.status(400).json({ error: 'Código incorrecto. Revisa la hora del móvil y prueba con el código actual' });
    }
    try {
      const next = enableOtpConfig(cfg, dataDir, secret);
      backupData(dataDir, 'otp-enable');
      writeFileAtomic(configPath, JSON.stringify(next.cfg, null, 2));
      res.json({ enabled: true, recoveryCodes: next.recoveryCodes });
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo activar la verificación en dos pasos') });
    }
  });

  // Acciones sensibles del segundo factor (desactivar, códigos nuevos): exigen la contraseña y un
  // código de la app o de recuperación, con el mismo límite de intentos que el login.
  // `action(cfg)` recibe la configuración verificada y devuelve { cfg, body } para guardar y responder
  const withOtpConfirmation = async (req, res, action) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    if (!otpEnabled(cfg)) return res.status(409).json({ error: 'La verificación en dos pasos no está activada' });
    const attempt = limiter.begin(req.ip);
    const { wait } = attempt;
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${Math.ceil(wait / 60)} min` });
    }
    try {
      const { password, code } = req.body ?? {};
      if (!(await verifyPassword(password, cfg.passwordHash))) {
        attempt.fail();
        return res.status(403).json({ error: 'Contraseña incorrecta' });
      }
      const check = checkSecondFactor(cfg, dataDir, code);
      if (!check.ok) {
        attempt.fail();
        return res.status(403).json({ error: 'Código incorrecto' });
      }
      attempt.succeed();
      const next = action(check.cfg);
      backupData(dataDir, 'otp');
      writeFileAtomic(configPath, JSON.stringify(next.cfg, null, 2));
      res.json(next.body);
    } catch (err) {
      res.status(500).json({ error: publicError(err, 'No se pudo guardar') });
    } finally {
      attempt.release();
    }
  };

  router.post('/otp/disable', (req, res) =>
    withOtpConfirmation(req, res, (cfg) => {
      const { otp: _, ...rest } = cfg;
      return { cfg: rest, body: { enabled: false } };
    })
  );

  router.post('/otp/recovery', (req, res) =>
    withOtpConfirmation(req, res, (cfg) => {
      const next = regenerateRecoveryCodes(cfg);
      return { cfg: next.cfg, body: { recoveryCodes: next.recoveryCodes } };
    })
  );

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

  // Preferencias de la interfaz (tema, fuentes, modo de las notas...) en data/prefs.json: el
  // navegador las guarda también en localStorage, pero estas mandan para que se apliquen igual
  // en todos los dispositivos. `prefs: null` = aún no hay ninguna guardada (el primer navegador
  // que entra sube las suyas). Clave → texto; se cambian por partes y `null` borra la clave
  const prefsPath = join(dataDir, 'prefs.json');
  const MAX_PREFS = 100;
  const MAX_PREF_LENGTH = 10000;
  const PREF_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
  const readPrefs = () => {
    try {
      const prefs = JSON.parse(readFileSync(prefsPath, 'utf8'));
      return prefs && typeof prefs === 'object' && !Array.isArray(prefs) ? prefs : null;
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn('No se pudo leer prefs.json:', err.message);
      return null;
    }
  };

  router.get('/prefs', (req, res) => {
    res.json({ prefs: readPrefs() });
  });

  // CSS propio en data/custom.css: lo editas tú en el servidor y la app lo carga encima del
  // tema al iniciar sesión (recarga la página tras cambiarlo). Sin el archivo, 204 vacío
  const customCssPath = join(dataDir, 'custom.css');
  router.get('/custom-css', (req, res) => {
    if (!existsSync(customCssPath)) return res.status(204).end();
    res.type('text/css');
    res.set('Cache-Control', 'no-store');
    res.sendFile(customCssPath);
  });
  // Guardar desde Ajustes → Apariencia. Vacío = sin CSS propio (el archivo queda vacío)
  const MAX_CUSTOM_CSS = 64 * 1024;
  router.post('/custom-css', (req, res) => {
    const css = req.body?.css;
    if (typeof css !== 'string') return res.status(400).json({ error: 'CSS no válido' });
    if (css.length > MAX_CUSTOM_CSS) return res.status(400).json({ error: 'El CSS es demasiado largo (máximo 64 KB)' });
    try {
      writeFileAtomic(customCssPath, css);
      res.json({ ok: true });
    } catch (err) {
      log.error('No se pudo guardar data/custom.css:', err.message);
      res.status(500).json({ error: 'No se pudo guardar el CSS' });
    }
  });

  router.post('/prefs', (req, res) => {
    const changes = req.body;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: 'Preferencias no válidas' });
    }
    const prefs = { ...readPrefs() };
    for (const [key, value] of Object.entries(changes)) {
      if (!PREF_KEY.test(key)) return res.status(400).json({ error: `Clave no válida: ${key}` });
      if (value === null) delete prefs[key];
      else if (typeof value === 'string' && value.length <= MAX_PREF_LENGTH) prefs[key] = value;
      else return res.status(400).json({ error: `Valor no válido: ${key}` });
    }
    if (Object.keys(prefs).length > MAX_PREFS) return res.status(400).json({ error: 'Demasiadas preferencias' });
    try {
      writeFileAtomic(prefsPath, JSON.stringify(prefs, null, 2));
      res.json({ prefs });
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

  // Vídeos de YouTube incrustados (![[youtube:ID]]). Desactivado por defecto: el vídeo se carga
  // desde YouTube y ese servidor ve tu IP. Lo aplica la CSP (security.js) tras recargar
  router.get('/youtube-embeds', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    res.json({ youtubeEmbeds: cfg.youtubeEmbeds === true });
  });

  router.post('/youtube-embeds', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    const youtubeEmbeds = req.body?.youtubeEmbeds === true;
    try {
      const { youtubeEmbeds: _, ...rest } = cfg;
      writeFileAtomic(configPath, JSON.stringify(youtubeEmbeds ? { ...rest, youtubeEmbeds } : rest, null, 2));
      res.json({ youtubeEmbeds });
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
  // directamente sin cargarlo en memoria. .git y .trash se excluyen salvo ?git=1 / ?trash=1.
  // ?data=1 añade la carpeta data/ de la app (configuración, sesiones, sync; sin copias de seguridad)
  router.get('/download-vault', async (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });

    const excluded = new Set();
    if (req.query.git !== '1') excluded.add('.git');
    if (req.query.trash !== '1') excluded.add('.trash');
    const includeData = req.query.data === '1';

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

      if (includeData) {
        // Solo los archivos sueltos de data/: se omiten las copias de seguridad (data/backups) y los temporales
        for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
          if (!entry.isFile() || entry.name.endsWith('.tmp')) continue;
          archive.file(join(dataDir, entry.name), { name: `data/${entry.name}` });
        }
      }

      archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: publicError(err, 'No se pudo descargar el vault') });
      }
    }
  });

  return router;
};
