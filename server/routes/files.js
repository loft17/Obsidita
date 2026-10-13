import express, { Router } from 'express';
import MarkdownIt from 'markdown-it';
import { ZipArchive } from 'archiver';
import { statSync, readdirSync } from 'fs';
import { join } from 'path';
import * as vault from '../vault.js';
import { prepareLinkUpdate } from '../links.js';
import { publicError, scriptHash } from '../security.js';
import { MAX_UPLOAD_MB } from '../limits.js';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Frontmatter YAML al inicio de la nota (se omite en la exportación)
const FRONTMATTER = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

const PRINT_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #222; max-width: 900px; margin: 0 auto; padding: 32px; }
  h1 { font-size: 28px; margin: 0 0 0.6em; }
  h2 { font-size: 22px; margin: 1em 0 0.5em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  h3 { font-size: 18px; margin: 0.8em 0 0.4em; }
  code { background: #f3f3f3; padding: 2px 5px; border-radius: 3px; font-family: Consolas, 'Courier New', monospace; font-size: 0.9em; }
  pre { background: #f3f3f3; padding: 12px; border-radius: 5px; white-space: pre-wrap; word-break: break-word; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 14px; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f3f3f3; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #ccc; margin: 2em 0; }
  @media print { body { padding: 0; } }
`;

const escapeHtml = (s) => md.utils.escapeHtml(s);

const PRINT_SCRIPT = "window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });";
// La página de exportación solo puede ejecutar su script de impresión
const PRINT_CSP = `default-src 'none'; script-src ${scriptHash(PRINT_SCRIPT)}; style-src 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'`;

export default (dataDir, getConfig) => {
  const router = Router();

  // Ejecuta una operación sobre la bóveda configurada y responde JSON
  const withVault = (handler) => (req, res) => {
    try {
      const cfg = getConfig();
      if (!cfg) return res.status(400).json({ error: 'Not configured' });
      handler(cfg, req, res);
    } catch (err) {
      res.status(400).json({ error: publicError(err) });
    }
  };

  router.get('/tree', withVault((cfg, req, res) => res.json(vault.listTree(cfg.vaultPath))));

  router.get('/read/:filePath', withVault((cfg, req, res) => {
    const content = vault.readFile(cfg.vaultPath, req.params.filePath);
    res.json({ content, version: vault.contentVersion(content) });
  }));

  // Archivos binarios del vault (imágenes adjuntas a las notas)
  router.get('/raw/:filePath', withVault((cfg, req, res) => {
    const fullPath = vault.resolveFile(cfg.vaultPath, req.params.filePath);
    // Un SVG abierto directamente no debe poder ejecutar scripts
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    });
    res.sendFile(fullPath, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(err.statusCode || 404).json({ error: 'Not found' });
    });
  }));

  router.get('/export-pdf/:filePath',withVault((cfg, req, res) => {
    const raw = vault.readFile(cfg.vaultPath, req.params.filePath);
    const body = raw.replace(FRONTMATTER, '');
    const title = escapeHtml(req.params.filePath.split('/').pop().replace(/\.md$/i, ''));
    res.set('Content-Security-Policy', PRINT_CSP);
    res.type('html').send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
<h1>${title}</h1>
${md.render(body)}
<script>${PRINT_SCRIPT}</script>
</body>
</html>`);
  }));

  // 409 si la nota ha cambiado desde `baseVersion`: el cliente decide qué versión conservar
  router.post('/write/:filePath', withVault((cfg, req, res) => {
    const { content, baseVersion } = req.body;
    if (typeof content !== 'string') throw new Error('Contenido no válido');
    try {
      const version = vault.writeFile(cfg.vaultPath, req.params.filePath, content, baseVersion);
      res.json({ success: true, version });
    } catch (err) {
      if (!(err instanceof vault.ConflictError)) throw err;
      res.status(409).json({ error: 'conflict', content: err.content, version: err.version });
    }
  }));

  // Sube un adjunto de la nota `note` (cuerpo binario); la carpeta destino sale de los ajustes
  router.post(
    '/upload',
    express.raw({ type: () => true, limit: MAX_UPLOAD_MB * 1024 * 1024 }),
    withVault((cfg, req, res) => {
      const note = String(req.query.note || '');
      const name = String(req.query.name || '');
      if (!name || !Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Archivo vacío');
      const folder = vault.attachmentFolder(cfg.vaultPath, note);
      res.json({ path: vault.saveAttachment(cfg.vaultPath, folder, name, req.body) });
    })
  );

  // Papelera: listar, restaurar a la ruta original, borrar definitivamente y vaciar.
  // Van por POST para no chocar con DELETE /:filePath (una nota llamada "trash")
  router.get('/trash', withVault((cfg, req, res) => res.json(vault.listTrash(cfg.vaultPath))));

  router.post('/trash/restore', withVault((cfg, req, res) => {
    res.json({ success: true, path: vault.restoreFromTrash(cfg.vaultPath, req.body.id) });
  }));

  router.post('/trash/delete', withVault((cfg, req, res) => {
    vault.purgeFromTrash(cfg.vaultPath, req.body.id);
    res.json({ success: true });
  }));

  router.post('/trash/empty', withVault((cfg, req, res) => {
    vault.emptyTrash(cfg.vaultPath);
    res.json({ success: true });
  }));

  router.delete('/:filePath', withVault((cfg, req, res) => {
    vault.deleteFile(cfg.vaultPath, req.params.filePath);
    res.json({ success: true });
  }));

  // `updated`: notas cuyos enlaces se han reescrito para seguir apuntando al archivo movido
  router.post('/rename', withVault((cfg, req, res) => {
    const { oldPath, newPath } = req.body;
    const updateLinks = prepareLinkUpdate(cfg.vaultPath, String(oldPath), String(newPath));
    vault.renameFile(cfg.vaultPath, oldPath, newPath);
    res.json({ success: true, updated: updateLinks() });
  }));

  router.post('/copy', withVault((cfg, req, res) => {
    res.json({ success: true, path: vault.copyFile(cfg.vaultPath, req.body.path) });
  }));

  router.post('/create-note', withVault((cfg, req, res) => {
    const { path, content = '' } = req.body;
    if (typeof content !== 'string') throw new Error('Contenido no válido');
    vault.createNote(cfg.vaultPath, path, content);
    res.json({ success: true });
  }));

  router.post('/create-folder', withVault((cfg, req, res) => {
    vault.createFolder(cfg.vaultPath, req.body.path);
    res.json({ success: true });
  }));

  // Descargar carpeta como ZIP
  router.get('/download-folder/:folderPath', withVault((cfg, req, res) => {
    const folderPath = req.params.folderPath;
    const fullPath = vault.resolveFile(cfg.vaultPath, folderPath);
    const stat = statSync(fullPath);

    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'No es una carpeta' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const folderName = folderPath.split('/').pop() || 'vault';
    const filename = `${folderName}-${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('Archiver error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: publicError(err, 'No se pudo crear el archivo ZIP') });
      } else {
        res.destroy(err);
      }
    });

    res.on('close', () => {
      if (!res.writableFinished) archive.abort();
    });

    archive.pipe(res);

    const addDirToArchive = (dirPath, arcPath = '') => {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;

        const entryPath = join(dirPath, entry.name);
        const archivePath = arcPath ? `${arcPath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          addDirToArchive(entryPath, archivePath);
        } else if (entry.isFile()) {
          archive.file(entryPath, { name: archivePath });
        }
      }
    };

    addDirToArchive(fullPath);
    archive.finalize();
  }));

  return router;
};
