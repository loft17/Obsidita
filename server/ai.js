import { AI_TIMEOUT_MS } from './limits.js';
import { createLogger } from './logger.js';
const log = createLogger('AI');

// Cliente mínimo para cualquier API compatible con OpenAI (POST {baseUrl}/chat/completions):
// DeepSeek, Gemini, OpenRouter, OpenAI, Ollama... Sin SDK: fetch nativo, una petición y una
// respuesta (sin streaming). Ni el texto de las notas ni las claves pasan nunca por el log

const SYSTEM_PROMPT =
  'Eres un editor de Markdown de Obsidian. Devuelve ÚNICAMENTE el texto resultante, sin explicaciones ni ' +
  'bloques de código envolventes. Conserva wikilinks [[...]], embeds ![[...]], frontmatter YAML, etiquetas ' +
  '#tag, callouts y el idioma original salvo que se pida lo contrario.';

// Error con un código estable que el cliente traduce (ai.error.<code>). `retry`: tiene sentido
// probar con el siguiente proveedor de `fallback`
export class AiError extends Error {
  constructor(code, message, { status = 502, retry = false, failed, detail } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retry = retry;
    if (failed) this.failed = failed;
    if (detail) this.detail = detail;
  }
}

// Motivo que da el proveedor en una respuesta de error (clave no válida, modelo inexistente,
// cuota agotada...). OpenAI y DeepSeek responden { error: { message } }; Gemini a veces lo
// envuelve en una lista. Va al usuario para que sepa qué corregir, pero nunca al log
const providerReason = async (res) => {
  const data = await res.json().catch(() => null);
  const body = Array.isArray(data) ? data[0] : data;
  const reason = body?.error?.message ?? body?.message ?? (typeof body?.error === 'string' ? body.error : '');
  return typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
};

// Fallos del proveedor que justifican probar con otro: clave rechazada o sin saldo, límite de
// uso, modelo o URL inexistentes, errores del servidor. Un 400 suele ser culpa de la petición
const RETRY_STATUS = new Set([401, 402, 403, 404, 408, 409, 429]);

// Si el modelo envuelve todo en un bloque de código, se le quita (salvo que el original ya
// fuera uno). También los saltos de línea de alrededor: se conservan los del texto original
const cleanResponse = (result, original) => {
  let text = result.trim();
  const fenced = /^(`{3,}|~{3,})[\w-]*\n([\s\S]*?)\n\1\s*$/.exec(text);
  if (fenced && !/^\s*(`{3,}|~{3,})/.test(original)) text = fenced[2].trim();
  if (!original.trim()) return text;
  const lead = /^\s*/.exec(original)[0];
  const trail = /\s*$/.exec(original)[0];
  return lead + text + trail;
};

// `content` suele ser un texto; algunos proveedores lo devuelven como lista de partes
const messageText = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  return null;
};

// `provider.apiKey` ya viene resuelta por la ruta (variable de entorno o clave guardada y
// descifrada). Sin ninguna de las dos (Ollama en local) no se manda clave
async function callProvider(name, provider, text, instruction, signal) {
  const { apiKey } = provider;
  if (provider.needsKey && !apiKey) {
    throw new AiError('noKey', `Falta la clave de ${name}`, { status: 500, retry: true });
  }

  // Cada proveedor tiene su propio plazo; la cancelación del cliente corta también la espera
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const started = Date.now();
  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Instrucción: ${instruction}\n\nTexto:\n${text}` },
        ],
        stream: false,
        ...(typeof provider.temperature === 'number' ? { temperature: provider.temperature } : {}),
      }),
      signal: controller.signal,
    });
    // Solo el código: el cuerpo de un error puede repetir parte del texto enviado
    log.info(`${name}: HTTP ${res.status} en ${Date.now() - started} ms`);
    if (!res.ok) {
      const reason = await providerReason(res);
      throw new AiError('providerError', `${name} respondió HTTP ${res.status}`, {
        retry: RETRY_STATUS.has(res.status) || res.status >= 500,
        detail: `HTTP ${res.status}${reason ? `: ${reason}` : ''}`,
      });
    }
    const result = messageText(await res.json().catch(() => null));
    if (result === null || !result.trim()) {
      throw new AiError('emptyResponse', `${name} no devolvió texto`, { retry: true });
    }
    return cleanResponse(result, text);
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (signal.aborted) throw new AiError('cancelled', 'Cancelado', { status: 499 });
    if (controller.signal.aborted) {
      log.warn(`${name}: sin respuesta en ${AI_TIMEOUT_MS / 1000} s`);
      throw new AiError('timeout', `${name} no respondió a tiempo`, { status: 504, retry: true });
    }
    log.warn(`${name}: error de red (${err.cause?.code || err.name})`);
    throw new AiError('network', `No se pudo conectar con ${name}`, { retry: true });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

// Pide la edición al proveedor elegido y, si falla, a los de `fallback` en orden (sin repetir
// ninguno). Devuelve el texto, quién respondió y quiénes fallaron antes
export async function editText(ai, { text, instruction, provider, signal }) {
  const order = [...new Set([provider, ...ai.fallback])].filter((name) => ai.providers[name]);
  const failed = [];
  let last;
  for (const name of order) {
    try {
      const result = await callProvider(name, ai.providers[name], text, instruction, signal);
      return { text: result, provider: name, failed: failed.map((f) => f.provider) };
    } catch (err) {
      if (!(err instanceof AiError) || !err.retry) throw err;
      failed.push({ provider: name, code: err.code });
      last = err;
    }
  }
  // Con un solo proveedor se da su error tal cual (sin clave, timeout...), que es más claro
  if (failed.length === 1) throw last;
  throw new AiError('allFailed', 'Todos los proveedores fallaron', { failed });
}
