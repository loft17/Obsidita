import { Router } from 'express';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { checkVaultPath } from '../vault.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../password.js';
import { publicError } from '../security.js';
import { writeFileAtomic, backupData } from '../dataFiles.js';
import { createLogger } from '../logger.js';
const log = createLogger('Setup');

export default (dataDir, sessions) => {
  const router = Router();
  const configPath = join(dataDir, 'config.json');

  // Token de un solo uso para la configuración inicial: sin él, cualquiera que llegue
  // antes que tú a la web podría configurarla (elegir vault y contraseña). Se muestra
  // en la consola del servidor al arrancar sin configurar, o en cuanto falte config.json
  // (si se borra data/ con el servidor en marcha)
  let setupToken = null;
  const ensureSetupToken = () => {
    if (existsSync(configPath)) {
      setupToken = null;
      return;
    }
    if (setupToken) return;
    setupToken = crypto.randomBytes(12).toString('hex');
    // En warn para que se vea también en producción (con LOG_LEVEL=warn): sin él no se puede configurar
    log.warn(
      `\n==================================================\n  Token de configuración inicial: ${setupToken}\n==================================================`
    );
  };
  ensureSetupToken();

  const validSetupToken = (value) => {
    ensureSetupToken();
    if (!setupToken || typeof value !== 'string') return false;
    const a = Buffer.from(value.trim());
    const b = Buffer.from(setupToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };

  router.get('/status', (req, res) => {
    ensureSetupToken();
    // minPasswordLength: el formulario de la web valida con el mismo mínimo que el servidor
    // siteTitle es público: se muestra en la pantalla de login y en la pestaña del navegador
    let siteTitle = '';
    try {
      if (existsSync(configPath)) siteTitle = JSON.parse(readFileSync(configPath, 'utf8')).siteTitle || '';
    } catch {
      // config.json ilegible: se usa el título por defecto
    }
    res.json({ configured: existsSync(configPath), minPasswordLength: MIN_PASSWORD_LENGTH, siteTitle });
  });

  router.post('/init', async (req, res) => {
    if (existsSync(configPath)) {
      return res.status(400).json({ error: 'Already configured' });
    }

    if (!validSetupToken(req.body?.setupToken)) {
      return res.status(403).json({ error: 'Token de configuración incorrecto (míralo en la consola del servidor)' });
    }

    const { password, port } = req.body;
    if (!req.body.vaultPath || !password) {
      return res.status(400).json({ error: 'Missing fields: vaultPath and password required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` });
    }
    const portNumber = port === undefined || port === null || port === '' ? 3000 : Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
      return res.status(400).json({ error: 'Puerto no válido' });
    }
    let vaultPath;
    try {
      vaultPath = checkVaultPath(req.body.vaultPath, dataDir);
    } catch (err) {
      return res.status(400).json({ error: publicError(err) });
    }

    try {
      log.debug(`Creating vault directory: ${vaultPath}`);
      // Create vault dir if it doesn't exist
      mkdirSync(vaultPath, { recursive: true });
      log.debug('Vault directory created successfully');

      // Hash password with scrypt
      log.debug('Hashing password...');
      const passwordHash = await hashPassword(password);
      log.debug('Password hashed successfully');

      // Create config
      log.debug(`Creating data directory: ${dataDir}`);
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });

      const config = {
        vaultPath,
        passwordHash,
        port: portNumber,
        createdAt: new Date().toISOString(),
      };

      // Se borran las sesiones y sync.json de la configuración anterior: antes, copia de seguridad
      backupData(dataDir, 'setup');
      log.debug(`Writing config to: ${configPath}`);
      writeFileAtomic(configPath, JSON.stringify(config, null, 2));
      setupToken = null;
      // Las sesiones de una configuración anterior no valen para la nueva
      sessions.destroyAll();
      // Ni su sincronización (repositorio y token de GitHub): se configura de nuevo con sesión
      rmSync(join(dataDir, 'sync.json'), { force: true });
      log.info('Configuration saved successfully');

      res.json({ success: true });
    } catch (err) {
      log.error('Error:', err);
      res.status(500).json({ error: publicError(err, 'Error al configurar') });
    }
  });

  return router;
};
