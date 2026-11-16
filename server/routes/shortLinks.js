import { Router } from 'express';
import { publicError } from '../security.js';
import { listLinks, findLink, createLink, removeLink } from '../shortLinks.js';

// Gestión de enlaces cortos (solo con sesión: el montaje de /api ya lo exige)
export default (dataDir) => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ links: listLinks(dataDir) });
  });

  // `code` es opcional: sin él se genera uno aleatorio
  router.post('/', (req, res) => {
    try {
      const { path, code } = req.body ?? {};
      res.json({ link: createLink(dataDir, { path, code }) });
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo crear el enlace') });
    }
  });

  // Resuelve un código a su ruta; la app lo usa al abrir /<código>
  router.get('/:code', (req, res) => {
    const link = findLink(dataDir, req.params.code);
    if (!link) return res.status(404).json({ error: 'Enlace no encontrado' });
    res.json({ path: link.path });
  });

  router.delete('/:code', (req, res) => {
    try {
      removeLink(dataDir, req.params.code);
      res.json({ success: true });
    } catch (err) {
      res.status(404).json({ error: publicError(err, 'No se pudo borrar el enlace') });
    }
  });

  return router;
};
