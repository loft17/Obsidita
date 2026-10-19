import { spawn } from 'child_process';
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { opendir } from 'fs/promises';
import { join } from 'path';
import { writeFileAtomic } from './dataFiles.js';
import { createLogger } from './logger.js';
const log = createLogger('Sync');

// Sincronización del vault con un repositorio de GitHub (git).
// La configuración y el token viven en data/sync.json; el token nunca sale hacia el cliente

export const PROVIDERS = ['none', 'github'];
export const INTERVALS = [0, 5, 15, 30, 60, 180, 1440];
const COMMAND_TIMEOUT = 10 * 60 * 1000;

const DEFAULTS = {
  provider: 'none',
  interval: 0,
  github: { repo: '', branch: 'main', token: '', authorName: 'Obsidita', authorEmail: 'obsidita@localhost' },
  status: { lastSync: null, lastAttempt: null, lastError: null, lastMessage: null },
};

// Ejecuta un comando sin shell (los argumentos nunca se interpretan) y devuelve stdout.
// Un fallo lanza un Error con la salida de error, sin el token y recortada
const run = (cmd, args, { cwd, env, input, secrets = [] } = {}) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, timeout: COMMAND_TIMEOUT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      reject(new Error(err.code === 'ENOENT' ? `${cmd} no está instalado en el servidor` : `No se pudo ejecutar ${cmd}`));
    });
    child.on('close', (code) => {
      if (code === 0) return resolvePromise(stdout);
      let msg = (stderr || stdout).trim() || `${cmd} terminó con código ${code}`;
      for (const s of secrets) if (s) msg = msg.split(s).join('***');
      const err = new Error(msg.length > 600 ? `…${msg.slice(-600)}` : msg);
      err.exitCode = code;
      reject(err);
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });

// ---------- GitHub ----------

// Acepta "usuario/repo" o la URL https de GitHub. Solo github.com y solo https: el token
// no puede acabar en otro servidor y se descartan transportes peligrosos (ext::, file://...)
export const normalizeGithubRepo = (value) => {
  const input = String(value ?? '').trim().replace(/\/+$/, '');
  const m =
    input.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/) ||
    input.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/i);
  if (!m || m[2] === '.' || m[2] === '..') throw new Error('Repositorio no válido. Usa "usuario/repositorio" o su URL https de GitHub');
  return `https://github.com/${m[1]}/${m[2]}.git`;
};

export const validBranch = (value) => {
  const b = String(value ?? '').trim();
  if (!/^[A-Za-z0-9._/-]{1,100}$/.test(b) || b.startsWith('-') || b.startsWith('/') || b.endsWith('/') ||
      b.endsWith('.lock') || b.includes('..') || b.includes('//')) {
    throw new Error('Nombre de rama no válido');
  }
  return b;
};

// La configuración pasa por variables de entorno (GIT_CONFIG_*), que tienen prioridad sobre
// .git/config: el token no se guarda en el repositorio ni aparece en la lista de procesos,
// y se desactivan los hooks y el fsmonitor por si el vault ya traía un .git preparado
const gitEnv = (opts) => {
  const entries = [
    ['core.hooksPath', '/dev/null'],
    ['core.fsmonitor', 'false'],
    ['core.quotePath', 'false'],
    ['user.name', opts.authorName || DEFAULTS.github.authorName],
    ['user.email', opts.authorEmail || DEFAULTS.github.authorEmail],
  ];
  if (opts.token) {
    const basic = Buffer.from(`x-access-token:${opts.token}`).toString('base64');
    entries.push(['http.https://github.com/.extraHeader', `Authorization: Basic ${basic}`]);
  }
  const env = { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: String(entries.length) };
  entries.forEach(([k, v], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = k;
    env[`GIT_CONFIG_VALUE_${i}`] = v;
  });
  return env;
};

// ¿Hay algún archivo visible en el vault? Se ignoran los ocultos (.git, .obsidian, .trash...)
const hasVisibleFiles = async (dir) => {
  for await (const entry of await opendir(dir)) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() || (await hasVisibleFiles(join(dir, entry.name)))) return true;
  }
  return false;
};

// commit de los cambios locales → rebase sobre la rama remota → push.
// En un conflicto gana la versión local (-X theirs en un rebase son los commits propios);
// si aun así no se puede resolver (p. ej. borrado frente a modificación), se aborta sin tocar nada
export const syncGithub = async (vaultPath, opts) => {
  const { url, branch, token } = opts;
  const env = gitEnv(opts);
  const secrets = [token, token && Buffer.from(`x-access-token:${token}`).toString('base64')];
  const git = (args, extra = {}) => run('git', args, { cwd: vaultPath, env, secrets, ...extra });
  const ok = (args) => git(args).then(() => true, () => false);

  if (!existsSync(join(vaultPath, '.git'))) await git(['init', '-q', '-b', branch]);
  const currentUrl = await git(['remote', 'get-url', 'origin']).then((s) => s.trim(), () => null);
  if (currentUrl === null) await git(['remote', 'add', 'origin', url]);
  else if (currentUrl !== url) await git(['remote', 'set-url', 'origin', url]);

  // La papelera no se versiona (exclusión local: no modifica las notas ni el .gitignore del vault)
  const excludePath = join(vaultPath, '.git', 'info', 'exclude');
  const exclude = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  if (!exclude.split('\n').includes('.trash/')) {
    mkdirSync(join(vaultPath, '.git', 'info'), { recursive: true });
    appendFileSync(excludePath, `${exclude && !exclude.endsWith('\n') ? '\n' : ''}.trash/\n`);
  }

  // Asegura estar en la rama configurada
  const head = await git(['symbolic-ref', '--short', '-q', 'HEAD']).then((s) => s.trim(), () => '');
  const hasHead = await ok(['rev-parse', '-q', '--verify', 'HEAD']);
  if (head !== branch) {
    if (!hasHead) await git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
    else if (await ok(['rev-parse', '-q', '--verify', `refs/heads/${branch}`])) await git(['checkout', '-q', branch]);
    else await git(['checkout', '-q', '-b', branch]);
  }

  const remoteRef = `refs/remotes/origin/${branch}`;
  const remoteExists = (await git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`])).trim() !== '';
  if (remoteExists) await git(['fetch', '-q', 'origin', `+refs/heads/${branch}:${remoteRef}`]);

  // Primera sincronización contra un repositorio con contenido: se adopta su historial sin
  // perder nada local (los archivos locales ganan; los que solo están en remoto se recuperan).
  // Lo mismo si el vault está vacío pero conserva un .git antiguo (p. ej. tras borrar las notas
  // con `rm -rf *`): sin esto se registraría el borrado de todo y se subiría a GitHub
  if (remoteExists && (!(await ok(['rev-parse', '-q', '--verify', 'HEAD'])) || !(await hasVisibleFiles(vaultPath)))) {
    await git(['reset', '-q', remoteRef]);
    const missing = await git(['ls-files', '-z', '--deleted']);
    if (missing) await git(['checkout', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: missing });
  }

  await git(['add', '-A']);
  const changed = !(await ok(['diff', '--cached', '--quiet']));
  if (changed) {
    const date = new Date().toISOString().replace('T', ' ').slice(0, 16);
    await git(['commit', '-q', '-m', `Obsidita: ${date}`]);
  }
  if (!(await ok(['rev-parse', '-q', '--verify', 'HEAD']))) return 'Nada que sincronizar';

  let pulled = 0;
  if (remoteExists) {
    pulled = Number((await git(['rev-list', '--count', `HEAD..${remoteRef}`])).trim()) || 0;
    if (pulled) {
      try {
        await git(['rebase', '-q', '-X', 'theirs', remoteRef]);
      } catch (err) {
        await git(['rebase', '--abort']).catch(() => {});
        throw new Error(`Conflicto al integrar los cambios de GitHub; resuélvelo a mano en el servidor. ${err.message}`);
      }
    }
  }
  const ahead = remoteExists ? Number((await git(['rev-list', '--count', `${remoteRef}..HEAD`])).trim()) || 0 : 1;
  if (ahead) await git(['push', '-q', 'origin', `HEAD:refs/heads/${branch}`]);

  const parts = [];
  if (pulled) parts.push(`${pulled} commit(s) descargados`);
  if (ahead) parts.push(changed ? 'cambios subidos' : 'commits subidos');
  return parts.length ? parts.join(', ') : 'Sin cambios';
};

// ---------- Historial de una nota ----------

const HISTORY_LIMIT = 200;
const COMMIT_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

// Solo lectura: sin token, sin hooks ni fsmonitor, y las rutas se toman literalmente (sin comodines)
const historyGit = (vaultPath, args) =>
  run('git', args, { cwd: vaultPath, env: { ...gitEnv({}), GIT_LITERAL_PATHSPECS: '1' } });

// Commits que han tocado la nota (siguiendo los renombrados), del más reciente al más antiguo.
// `path` es la ruta que tenía la nota en ese commit
export const noteHistory = async (vaultPath, relPath) => {
  if (!existsSync(join(vaultPath, '.git'))) return [];
  const hasHead = await historyGit(vaultPath, ['rev-parse', '-q', '--verify', 'HEAD']).then(() => true, () => false);
  if (!hasHead) return [];
  const out = await historyGit(vaultPath, [
    'log', '--follow', '--diff-filter=d', '-z', '--name-only', `-n${HISTORY_LIMIT}`,
    '--format=%x1e%H%x1f%at%x1f%an%x1f%s', '--', relPath,
  ]);
  return out
    .split('\x1e')
    .filter(Boolean)
    .map((chunk) => {
      const [header, files = ''] = chunk.split('\0');
      const [hash, time, author, ...subject] = header.split('\x1f');
      return { hash, date: Number(time) * 1000, author, message: subject.join('\x1f'), path: files.replace(/^\n/, '') };
    })
    .filter((c) => COMMIT_RE.test(c.hash) && c.path);
};

// Contenido de la nota en un commit de su historial y los cambios que introdujo ese commit
export const noteAtCommit = async (vaultPath, relPath, commit, maxBytes) => {
  if (!COMMIT_RE.test(String(commit))) throw new Error('Versión no válida');
  const entry = (await noteHistory(vaultPath, relPath)).find((c) => c.hash === commit);
  if (!entry) throw new Error('Esa versión no está en el historial de la nota');
  const spec = `${commit}:${entry.path}`;
  const size = Number((await historyGit(vaultPath, ['cat-file', '-s', spec])).trim());
  if (size > maxBytes) throw new Error('La versión es demasiado grande para mostrarla');
  const content = await historyGit(vaultPath, ['cat-file', 'blob', spec]);
  // Los commits iniciales no tienen padre: --root muestra todo el archivo como añadido
  const diff = await historyGit(vaultPath, [
    'show', '--root', '--format=', '--no-color', '--no-ext-diff', '--no-textconv', commit, '--', entry.path,
  ]).catch(() => '');
  return { ...entry, content, diff: diff.length > maxBytes ? '' : diff };
};

// ---------- Gestor ----------

export const createSyncManager = (dataDir, getConfig) => {
  const configPath = join(dataDir, 'sync.json');
  let running = null;

  const load = () => {
    let saved = {};
    try {
      if (existsSync(configPath)) saved = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      log.error('No se pudo leer sync.json:', err.message);
    }
    return {
      provider: PROVIDERS.includes(saved.provider) ? saved.provider : 'none',
      interval: INTERVALS.includes(saved.interval) ? saved.interval : 0,
      github: { ...DEFAULTS.github, ...saved.github },
      status: { ...DEFAULTS.status, ...saved.status },
    };
  };

  const save = (cfg) => writeFileAtomic(configPath, JSON.stringify(cfg, null, 2));

  const updateStatus = (changes) => {
    const cfg = load();
    cfg.status = { ...cfg.status, ...changes };
    save(cfg);
  };

  // Lo que ve el cliente: nunca los tokens, solo si existen
  const publicConfig = () => {
    const cfg = load();
    const { token, ...github } = cfg.github;
    return {
      provider: cfg.provider,
      interval: cfg.interval,
      github: { ...github, hasToken: Boolean(token) },
      status: { ...cfg.status, running: Boolean(running) },
    };
  };

  // Valida y guarda; el token solo se cambia si llega (string vacío = no tocar,
  // null = borrar)
  const configure = (body = {}) => {
    const cfg = load();
    if (body.provider !== undefined) {
      if (!PROVIDERS.includes(body.provider)) throw new Error('Servicio no válido');
      cfg.provider = body.provider;
    }
    if (body.interval !== undefined) {
      if (!INTERVALS.includes(Number(body.interval))) throw new Error('Intervalo no válido');
      cfg.interval = Number(body.interval);
    }
    const gh = body.github;
    if (gh) {
      if (gh.repo !== undefined) cfg.github.repo = gh.repo ? normalizeGithubRepo(gh.repo) : '';
      if (gh.branch !== undefined) cfg.github.branch = validBranch(gh.branch || 'main');
      for (const k of ['authorName', 'authorEmail']) {
        if (gh[k] !== undefined) {
          const v = String(gh[k]).trim();
          if (v.length > 200 || /[\r\n\0<>]/.test(v)) throw new Error('Autor no válido');
          cfg.github[k] = v || DEFAULTS.github[k];
        }
      }
      if (gh.token === null) cfg.github.token = '';
      else if (typeof gh.token === 'string' && gh.token.trim()) {
        const t = gh.token.trim();
        if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) throw new Error('Token de GitHub no válido');
        cfg.github.token = t;
      }
    }
    save(cfg);
    return publicConfig();
  };

  const doSync = async () => {
    const app = getConfig();
    if (!app) throw new Error('Not configured');
    const cfg = load();
    if (cfg.provider === 'github') {
      const gh = cfg.github;
      if (!gh.repo) throw new Error('Falta el repositorio de GitHub');
      if (!gh.token) throw new Error('Falta el token de GitHub');
      return syncGithub(app.vaultPath, { ...gh, url: gh.repo });
    }
    throw new Error('La sincronización está desactivada');
  };

  // Una sola sincronización a la vez: si ya hay una en marcha, se espera a esa
  const syncNow = () => {
    if (running) return running;
    const startedAt = new Date().toISOString();
    running = doSync()
      .then((message) => {
        updateStatus({ lastSync: new Date().toISOString(), lastAttempt: startedAt, lastError: null, lastMessage: message });
      })
      .catch((err) => {
        log.error(err.message);
        updateStatus({ lastAttempt: startedAt, lastError: err.message });
      })
      .finally(() => {
        running = null;
      })
      .then(publicConfig);
    return running;
  };

  // Sincronización periódica: cada minuto se comprueba si toca
  const tick = () => {
    const cfg = load();
    if (running || cfg.provider === 'none' || !cfg.interval || !getConfig()) return;
    const last = cfg.status.lastAttempt ? Date.parse(cfg.status.lastAttempt) : 0;
    if (Date.now() - last >= cfg.interval * 60 * 1000) syncNow();
  };
  const timer = setInterval(tick, 60 * 1000);
  timer.unref();

  // El historial de las notas sale del repositorio git del vault: solo con la sincronización
  // con GitHub activa
  const history = (relPath) => {
    const app = getConfig();
    if (!app) throw new Error('Not configured');
    if (load().provider !== 'github') throw new Error('El historial necesita la sincronización con GitHub');
    return noteHistory(app.vaultPath, relPath);
  };

  const versionAt = (relPath, commit, maxBytes) => {
    const app = getConfig();
    if (!app) throw new Error('Not configured');
    if (load().provider !== 'github') throw new Error('El historial necesita la sincronización con GitHub');
    return noteAtCommit(app.vaultPath, relPath, commit, maxBytes);
  };

  return { publicConfig, configure, syncNow, history, versionAt };
};
