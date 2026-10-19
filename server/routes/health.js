import express from 'express';
import { stat, access } from 'fs/promises';
import { constants } from 'fs';
import { current as version } from '../updates.js';

// Comprobación de salud para el proxy inverso, Docker (HEALTHCHECK) o un monitor externo.
// Es pública (sin sesión), así que no devuelve rutas ni nada del vault: solo si está
// configurado, si el vault se puede leer y escribir, la versión y el tiempo en marcha.
//   200 → todo bien, o aún sin configurar (el proceso responde y espera al setup)
//   503 → configurado, pero el vault no existe, no es una carpeta o no tiene permisos

// Un vault en un disco de red caído puede dejar colgado el stat: mejor responder 503 a tiempo
const VAULT_TIMEOUT = 3000;

const checkVault = async (vaultPath) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), VAULT_TIMEOUT);
  });
  const check = (async () => {
    if (!(await stat(vaultPath)).isDirectory()) return false;
    await access(vaultPath, constants.R_OK | constants.W_OK);
    return true;
  })().catch(() => false);
  try {
    return await Promise.race([check, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

export default function healthRoutes(getConfig) {
  const router = express.Router();

  // router.get también responde a HEAD (curl -I, algunos balanceadores)
  router.get('/', async (req, res) => {
    const cfg = getConfig();
    const configured = Boolean(cfg?.vaultPath);
    const vault = configured ? await checkVault(cfg.vaultPath) : null;
    const ok = !configured || vault;
    res.set('Cache-Control', 'no-store');
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'error',
      configured,
      vault,
      version,
      uptime: Math.round(process.uptime()),
    });
  });

  return router;
}
