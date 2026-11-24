import { Router } from 'express';
import { createLocalHistory } from '../localHistory.js';
import { publicError } from '../security.js';

// Historial local de las notas (ver localHistory.js). Ajustes: GET/POST /config
export default (dataDir, getConfig) => {
  const router = Router();
  const history = createLocalHistory(dataDir);

  const withVaultCheck = (handler) => (req, res) => {
    if (!getConfig()?.vaultPath) return res.status(400).json({ error: 'Not configured' });
    try {
      handler(req, res);
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo completar la operación') });
    }
  };

  router.get('/config', (req, res) => res.json(history.getConfig()));

  router.post('/config', (req, res) => {
    try {
      res.json(history.setConfig(req.body));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  router.get('/usage', (req, res) => res.json(history.usage()));

  router.get('/versions', withVaultCheck((req, res) => {
    res.json(history.list(String(req.query.path ?? '')));
  }));

  router.get('/version', withVaultCheck((req, res) => {
    res.json({ content: history.readVersion(String(req.query.path ?? ''), String(req.query.id ?? '')) });
  }));

  router.post('/delete', withVaultCheck((req, res) => {
    history.removeVersion(String(req.body?.path ?? ''), String(req.body?.id ?? ''));
    res.json({ success: true });
  }));

  // Sin `path`: vacía todo el historial. Con `path`: solo el de esa nota o carpeta
  router.post('/clear', withVaultCheck((req, res) => {
    const path = req.body?.path ? String(req.body.path) : '';
    history.clear(path);
    res.json({ success: true });
  }));

  return router;
};
