import { Router } from 'express';
import { join } from 'path';
import { loadAi } from '../lazy.js';
import { AI_MAX_CHARS, AI_RATE_MAX } from '../limits.js';
import { createSecretBox } from '../secretBox.js';
import { writeFileAtomic } from '../dataFiles.js';
import { publicError } from '../security.js';
import { createLogger } from '../logger.js';
const log = createLogger('AI');

// Edición de notas con IA. La sección `ai` de config.json define los proveedores (URL + modelo +
// clave), el de por defecto, el orden de respaldo y las acciones rápidas. Se puede editar a mano
// o desde Ajustes → IA. La clave de cada proveedor sale de la variable de entorno `apiKeyEnv`
// o, si no, de `apiKeyEnc` (guardada desde la web, cifrada: ver server/secretBox.js).
// Sin proveedores la función queda oculta y el cliente de IA (server/ai.js) no se carga

const MAX_INSTRUCTION = 2000;
const MAX_PROVIDERS = 20;
const MAX_ACTIONS = 20;
const NAME = /^[\w.-]{1,40}$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

// Normaliza la sección `ai`: descarta proveedores sin URL http(s) o sin modelo, y nombres raros
export const readAiConfig = (cfg) => {
  const ai = cfg?.ai;
  if (!ai || typeof ai !== 'object') return null;
  const providers = {};
  for (const [name, p] of Object.entries(ai.providers ?? {})) {
    if (!NAME.test(name) || !p || typeof p.model !== 'string' || !p.model) continue;
    if (typeof p.baseUrl !== 'string' || !/^https?:\/\//i.test(p.baseUrl)) continue;
    providers[name] = p;
  }
  const names = Object.keys(providers);
  if (!names.length) return null;
  const actions = (Array.isArray(ai.actions) ? ai.actions : [])
    .filter((a) => a && typeof a.name === 'string' && a.name.trim() && typeof a.prompt === 'string' && a.prompt.trim())
    .map((a) => ({ name: a.name.trim(), prompt: a.prompt.trim(), ...(providers[a.provider] ? { provider: a.provider } : {}) }));
  return {
    providers,
    default: providers[ai.default] ? ai.default : names[0],
    fallback: (Array.isArray(ai.fallback) ? ai.fallback : []).filter((name) => providers[name]),
    actions,
  };
};

// Peticiones por sesión en el último minuto. Cada una cuesta dinero en la API del proveedor
const RATE_WINDOW = 60 * 1000;
const recent = new Map(); // sesión → marcas de tiempo
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of recent) {
    if (!times.some((t) => now - t < RATE_WINDOW)) recent.delete(key);
  }
}, RATE_WINDOW).unref();

const rateLimited = (key) => {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((t) => now - t < RATE_WINDOW);
  const limited = times.length >= AI_RATE_MAX;
  if (!limited) times.push(now);
  recent.set(key, times);
  return limited;
};

// Valida lo que llega de Ajustes → IA y devuelve la nueva sección `ai` (null: sin proveedores,
// la función se desactiva). Las claves solo se tocan si llegan: texto = guardar esta (cifrada),
// null = olvidar la guardada, ausente o vacío = conservar la que hubiera (también al renombrar,
// con `from`, el nombre anterior)
const buildAiSection = (body, previous, box) => {
  const fail = (msg) => {
    throw new Error(msg);
  };
  const input = body && typeof body === 'object' ? body : {};
  const list = Array.isArray(input.providers) ? input.providers : [];
  if (list.length > MAX_PROVIDERS) fail(`Como máximo ${MAX_PROVIDERS} proveedores`);
  const old = previous?.providers ?? {};
  const providers = {};
  for (const p of list) {
    const name = String(p?.name ?? '').trim();
    if (!NAME.test(name)) fail(`Nombre de proveedor no válido: "${name}" (letras, números, - _ .)`);
    if (providers[name]) fail(`Proveedor repetido: ${name}`);
    const baseUrl = String(p.baseUrl ?? '').trim();
    let url;
    try {
      url = new URL(baseUrl);
    } catch {
      url = null;
    }
    if (!url || !/^https?:$/.test(url.protocol) || baseUrl.length > 500) fail(`URL no válida en ${name}`);
    const model = String(p.model ?? '').trim();
    if (!model || model.length > 200) fail(`Falta el modelo de ${name}`);
    const apiKeyEnv = String(p.apiKeyEnv ?? '').trim();
    if (apiKeyEnv && !ENV_NAME.test(apiKeyEnv)) fail(`Nombre de variable no válido en ${name}`);

    const prev = old[typeof p.from === 'string' && old[p.from] ? p.from : name];
    const entry = { baseUrl, model };
    if (apiKeyEnv) entry.apiKeyEnv = apiKeyEnv;
    if (typeof prev?.temperature === 'number') entry.temperature = prev.temperature;
    if (typeof p.apiKey === 'string' && p.apiKey.trim()) {
      const key = p.apiKey.trim();
      if (key.length > 1000 || /[\s\x00-\x1f\x7f]/.test(key)) fail(`Clave no válida en ${name}`);
      entry.apiKeyEnc = box.encrypt(key);
    } else if (p.apiKey !== null && prev?.apiKeyEnc) {
      entry.apiKeyEnc = prev.apiKeyEnc;
    }
    providers[name] = entry;
  }
  const names = Object.keys(providers);
  if (!names.length) return null;

  const actions = Array.isArray(input.actions) ? input.actions : [];
  if (actions.length > MAX_ACTIONS) fail(`Como máximo ${MAX_ACTIONS} acciones`);
  return {
    default: providers[input.default] ? input.default : names[0],
    fallback: [...new Set(Array.isArray(input.fallback) ? input.fallback : [])].filter((n) => providers[n]),
    providers,
    actions: actions.map((a) => {
      const name = String(a?.name ?? '').trim();
      const prompt = String(a?.prompt ?? '').trim();
      if (!name || name.length > 60) fail('Cada acción necesita un nombre (máximo 60 caracteres)');
      if (!prompt || prompt.length > MAX_INSTRUCTION) fail(`Falta la instrucción de la acción ${name}`);
      return { name, prompt, ...(providers[a.provider] ? { provider: a.provider } : {}) };
    }),
  };
};

export default (dataDir, getConfig) => {
  const router = Router();
  const configPath = join(dataDir, 'config.json');
  const box = createSecretBox(join(dataDir, '.ai-secret'));

  // Claves de cada proveedor: primero la variable de entorno, después la guardada desde la web
  const resolveKeys = (ai) => {
    const providers = {};
    for (const [name, p] of Object.entries(ai.providers)) {
      const fromEnv = p.apiKeyEnv ? process.env[p.apiKeyEnv]?.trim() : '';
      providers[name] = {
        ...p,
        apiKey: fromEnv || (p.apiKeyEnc ? box.decrypt(p.apiKeyEnc) : '') || '',
        needsKey: Boolean(p.apiKeyEnv || p.apiKeyEnc),
      };
    }
    return { ...ai, providers };
  };

  // Ajustes → IA. Con URLs y modelos (es la configuración), pero nunca las claves: solo si hay
  // una guardada, si se puede descifrar y si la variable de entorno está definida
  const publicSettings = () => {
    const ai = getConfig()?.ai;
    const list = Object.entries(ai?.providers ?? {}).map(([name, p]) => ({
      name,
      baseUrl: p?.baseUrl ?? '',
      model: p?.model ?? '',
      apiKeyEnv: p?.apiKeyEnv ?? '',
      envKey: Boolean(p?.apiKeyEnv && process.env[p.apiKeyEnv]?.trim()),
      hasKey: Boolean(p?.apiKeyEnc),
      keyError: Boolean(p?.apiKeyEnc) && box.decrypt(p.apiKeyEnc) === null,
    }));
    return {
      default: ai?.default ?? '',
      fallback: Array.isArray(ai?.fallback) ? ai.fallback : [],
      providers: list,
      actions: Array.isArray(ai?.actions) ? ai.actions : [],
      keysSecretFromEnv: Boolean(process.env.AI_KEYS_SECRET?.trim()),
    };
  };

  router.get('/settings', (req, res) => res.json(publicSettings()));

  router.post('/settings', (req, res) => {
    const cfg = getConfig();
    if (!cfg) return res.status(400).json({ error: 'Not configured' });
    try {
      const ai = buildAiSection(req.body, cfg.ai, box);
      const { ai: _, ...rest } = cfg;
      writeFileAtomic(configPath, JSON.stringify(ai ? { ...rest, ai } : rest, null, 2));
      res.json(publicSettings());
    } catch (err) {
      res.status(400).json({ error: publicError(err, 'No se pudo guardar') });
    }
  });

  // Lo que necesita la interfaz: nombres de proveedores y acciones. Nunca URLs ni claves
  router.get('/config', (req, res) => {
    const ai = readAiConfig(getConfig());
    if (!ai) return res.json({ enabled: false });
    res.json({
      enabled: true,
      providers: Object.keys(ai.providers),
      default: ai.default,
      actions: ai.actions,
      maxChars: AI_MAX_CHARS,
    });
  });

  router.post('/edit', async (req, res) => {
    const ai = readAiConfig(getConfig());
    if (!ai) return res.status(404).json({ error: 'La edición con IA no está configurada', code: 'notConfigured' });
    // `test`: prueba de conexión desde Ajustes, solo con ese proveedor (sin respaldo)
    const { text, instruction, provider = ai.default, test = false } = req.body ?? {};
    if (typeof text !== 'string' || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: 'Falta la instrucción', code: 'badRequest' });
    }
    if (instruction.length > MAX_INSTRUCTION) {
      return res.status(400).json({ error: 'Instrucción demasiado larga', code: 'instructionTooLong' });
    }
    if (text.length > AI_MAX_CHARS) {
      return res.status(413).json({ error: `Texto demasiado largo (máximo ${AI_MAX_CHARS} caracteres)`, code: 'tooLong' });
    }
    if (typeof provider !== 'string' || !ai.providers[provider]) {
      return res.status(400).json({ error: 'Proveedor desconocido', code: 'unknownProvider' });
    }
    if (rateLimited(req.signedCookies.token)) {
      res.set('Retry-After', String(RATE_WINDOW / 1000));
      return res.status(429).json({ error: 'Demasiadas peticiones a la IA. Espera un momento', code: 'rateLimited' });
    }

    // Si el cliente cancela (o cierra la página) se deja de esperar al proveedor
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const { editText } = await loadAi();
      const resolved = resolveKeys(test === true ? { ...ai, fallback: [] } : ai);
      const result = await editText(resolved, { text, instruction: instruction.trim(), provider, signal: controller.signal });
      res.json(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!err.code) log.error(err);
      res.status(err.status || 500).json({
        error: err.code ? err.message : 'Error interno',
        code: err.code || 'internal',
        ...(err.failed ? { failed: err.failed } : {}),
        ...(err.detail ? { detail: err.detail } : {}),
      });
    }
  });

  return router;
};
