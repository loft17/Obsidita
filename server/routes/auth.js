import { Router } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sessionCookie } from '../sessions.js';
import { verifyPassword } from '../password.js';
import { createLogger } from '../logger.js';
const log = createLogger('Auth');

export default (dataDir, sessions, limiter) => {
  const router = Router();
  const configPath = join(dataDir, 'config.json');

  router.post('/login', async (req, res) => {
    const attempt = limiter.begin(req.ip);
    const { wait } = attempt;
    if (wait) {
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: `Demasiados intentos. Prueba de nuevo en ${Math.ceil(wait / 60)} min` });
    }

    const { password } = req.body ?? {};
    if (!password || typeof password !== 'string') {
      attempt.release();
      return res.status(400).json({ error: 'Missing password' });
    }

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));

      if (!(await verifyPassword(password, config.passwordHash))) {
        attempt.fail();
        return res.status(401).json({ error: 'Contraseña incorrecta' });
      }
      attempt.succeed();

      // Set signed cookie with a fresh, revocable session token
      res.cookie('token', sessions.create(), sessionCookie(req));

      res.json({ success: true });
    } catch (err) {
      log.error('Login error:', err);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    } finally {
      attempt.release();
    }
  });

  router.post('/logout', (req, res) => {
    sessions.destroy(req.signedCookies.token);
    res.clearCookie('token', { httpOnly: true, sameSite: 'strict', secure: req.secure });
    res.json({ success: true });
  });

  return router;
};
