import { Router } from 'express';
import { publicError } from '../security.js';
import { getBookmarks, saveBookmarks, mergeBookmarks } from '../bookmarks.js';
import { importFromObsidian, exportToObsidian } from '../obsidianBookmarks.js';

// Marcadores de la web (data/bookmarks.json) y su intercambio con .obsidian/bookmarks.json
export default (dataDir, getConfig) => {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(getBookmarks(dataDir));
  });

  // Reemplaza la lista entera (orden, grupos y etiquetas incluidos)
  router.put('/', (req, res) => {
    try {
      res.json(saveBookmarks(dataDir, req.body));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudieron guardar los marcadores') });
    }
  });

  // Trae los marcadores de .obsidian/bookmarks.json y los añade a los actuales (sin duplicados)
  router.post('/obsidian/import', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    try {
      const incoming = importFromObsidian(cfg.vaultPath);
      const { added, skipped, store } = mergeBookmarks(dataDir, incoming);
      res.json({ added, skipped: skipped + incoming.skipped, store });
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo importar desde Obsidian') });
    }
  });

  // Escribe los marcadores en .obsidian/bookmarks.json (conserva lo que Obsidian tenga ajeno a ellos)
  router.post('/obsidian/export', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    try {
      res.json(exportToObsidian(cfg.vaultPath, getBookmarks(dataDir)));
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo exportar a Obsidian') });
    }
  });

  return router;
};
