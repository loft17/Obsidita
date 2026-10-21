// Ajustes → IA: proveedores, por defecto, respaldo y acciones rápidas (la sección `ai` de
// config.json). Las claves se escriben aquí y el servidor las guarda cifradas; nunca vuelven
import { useEffect, useState } from 'react';
import { aiApi, type AiSettings as Settings, type AiSettingsUpdate } from '../api';
import { reloadAiConfig } from '../ai';
import { aiErrorMessage } from '../aiErrors';
import { Trans, useT } from '../i18n';

const errorStyle = { color: 'var(--text-error, #e5484d)' };
const fieldStyle = { flex: '0 1 320px', minWidth: 0 };
const rowButtons = { display: 'flex', gap: 6, flexWrap: 'wrap' as const };

// Puntos de partida: URL y modelo se pueden cambiar después
const PRESETS = [
  {
    label: 'DeepSeek',
    name: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  {
    label: 'Gemini',
    name: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
  },
  {
    label: 'OpenAI',
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
  },
  {
    label: 'OpenRouter',
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-chat',
  },
  {
    label: 'Ollama',
    name: 'ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
  },
];

// Proveedor en edición. `id` es estable aunque cambie el nombre: el de por defecto, el respaldo
// y las acciones se refieren a él por `id` y se traducen a nombres al guardar
interface DraftProvider {
  id: number;
  from?: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  apiKey: string;
  forgetKey: boolean;
  hasKey: boolean;
  keyError: boolean;
  envKey: boolean;
}

interface DraftAction {
  id: number;
  name: string;
  prompt: string;
  provider: number | null;
}

interface Draft {
  providers: DraftProvider[];
  defaultId: number | null;
  fallback: number[];
  actions: DraftAction[];
}

let nextId = 1;

const toDraft = (s: Settings): Draft => {
  const providers = s.providers.map((p) => ({
    ...p,
    id: nextId++,
    from: p.name,
    apiKey: '',
    forgetKey: false,
  }));
  const idOf = (name?: string) => providers.find((p) => p.name === name)?.id ?? null;
  return {
    providers,
    defaultId: idOf(s.default) ?? providers[0]?.id ?? null,
    fallback: s.fallback.map(idOf).filter((id): id is number => id !== null),
    actions: s.actions.map((a) => ({
      id: nextId++,
      name: a.name,
      prompt: a.prompt,
      provider: idOf(a.provider),
    })),
  };
};

const toUpdate = (d: Draft): AiSettingsUpdate => {
  const nameOf = (id: number | null) => d.providers.find((p) => p.id === id)?.name.trim() ?? '';
  return {
    providers: d.providers.map((p) => ({
      name: p.name.trim(),
      from: p.from,
      baseUrl: p.baseUrl.trim(),
      model: p.model.trim(),
      apiKeyEnv: p.apiKeyEnv.trim(),
      ...(p.forgetKey ? { apiKey: null } : p.apiKey.trim() ? { apiKey: p.apiKey.trim() } : {}),
    })),
    default: nameOf(d.defaultId),
    // El respaldo sigue el orden de la lista de proveedores
    fallback: d.providers.filter((p) => d.fallback.includes(p.id)).map((p) => p.name.trim()),
    actions: d.actions.map((a) => ({
      name: a.name.trim(),
      prompt: a.prompt.trim(),
      ...(a.provider !== null && nameOf(a.provider) ? { provider: nameOf(a.provider) } : {}),
    })),
  };
};

export default function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  // Resultado de "Probar" por proveedor
  const [tests, setTests] = useState<Record<number, { error: boolean; text: string } | 'running'>>({});
  // Proveedores y acciones desplegados para editarlos; el resto se muestra en una línea
  const [open, setOpen] = useState<Set<number>>(new Set());
  const t = useT();

  const apply = (s: Settings) => {
    setSettings(s);
    setDraft(toDraft(s));
    setDirty(false);
    setTests({});
    setOpen(new Set());
  };

  useEffect(() => {
    aiApi
      .getSettings()
      .then(apply)
      .catch((err) => setMessage({ error: true, text: err.message }));
  }, []);

  if (!draft || !settings) {
    return message ? (
      <div className="setting-desc" style={errorStyle}>
        {message.text}
      </div>
    ) : null;
  }

  const change = (fn: (d: Draft) => Draft) => {
    setDraft(fn(draft));
    setDirty(true);
    setMessage(null);
  };

  const updateProvider = (id: number, patch: Partial<DraftProvider>) =>
    change((d) => ({
      ...d,
      providers: d.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  const addProvider = (preset: (typeof PRESETS)[number] | null) => {
    const base = preset?.name ?? 'proveedor';
    let name = base;
    for (let n = 2; draft.providers.some((p) => p.name === name); n++) name = `${base}-${n}`;
    const p: DraftProvider = {
      id: nextId++,
      name,
      baseUrl: preset?.baseUrl ?? '',
      model: preset?.model ?? '',
      apiKeyEnv: '',
      apiKey: '',
      forgetKey: false,
      hasKey: false,
      keyError: false,
      envKey: false,
    };
    change((d) => ({
      ...d,
      providers: [...d.providers, p],
      defaultId: d.defaultId ?? p.id,
    }));
    // Uno nuevo hay que rellenarlo: se abre ya desplegado
    setOpen((s) => new Set(s).add(p.id));
  };

  const toggleOpen = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const removeProvider = (id: number) =>
    change((d) => {
      const providers = d.providers.filter((p) => p.id !== id);
      return {
        providers,
        defaultId: d.defaultId === id ? (providers[0]?.id ?? null) : d.defaultId,
        fallback: d.fallback.filter((f) => f !== id),
        actions: d.actions.map((a) => (a.provider === id ? { ...a, provider: null } : a)),
      };
    });

  const moveProvider = (index: number, delta: number) =>
    change((d) => {
      const providers = [...d.providers];
      const [p] = providers.splice(index, 1);
      providers.splice(index + delta, 0, p);
      return { ...d, providers };
    });

  const toggleFallback = (id: number, on: boolean) =>
    change((d) => ({
      ...d,
      fallback: on ? [...d.fallback, id] : d.fallback.filter((f) => f !== id),
    }));

  const updateAction = (id: number, patch: Partial<DraftAction>) =>
    change((d) => ({
      ...d,
      actions: d.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      apply(await aiApi.saveSettings(toUpdate(draft)));
      setMessage({ error: false, text: t('common.saved') });
      reloadAiConfig();
    } catch (err) {
      setMessage({ error: true, text: (err as Error).message });
    }
    setBusy(false);
  };

  // Prueba la configuración guardada con una petición mínima, solo a ese proveedor
  const test = async (p: DraftProvider) => {
    setTests((s) => ({ ...s, [p.id]: 'running' }));
    try {
      await aiApi.edit({
        text: 'OK',
        instruction: 'Devuelve el texto tal cual.',
        provider: p.name,
        test: true,
      });
      setTests((s) => ({
        ...s,
        [p.id]: { error: false, text: t('aiSettings.testOk') },
      }));
    } catch (err) {
      setTests((s) => ({
        ...s,
        [p.id]: { error: true, text: aiErrorMessage(err) },
      }));
    }
  };

  // Resumen de la clave en la línea plegada
  const keySummary = (p: DraftProvider) => {
    if (p.envKey) return p.apiKeyEnv;
    if (p.forgetKey) return t('aiSettings.keyShort.forget');
    if (p.keyError) return t('aiSettings.keyShort.unreadable');
    if (p.hasKey || p.apiKey.trim()) return t('aiSettings.keyShort.saved');
    return t('aiSettings.keyShort.none');
  };

  const keyStatus = (p: DraftProvider) => {
    if (p.envKey) return t('aiSettings.key.fromEnv', { env: p.apiKeyEnv });
    if (p.forgetKey) return t('aiSettings.key.willForget');
    if (p.keyError) return t('aiSettings.key.unreadable');
    if (p.hasKey) return t('aiSettings.key.saved');
    return t('aiSettings.key.none');
  };

  return (
    <>
      <div className="setting-desc" style={{ marginBottom: 12 }}>
        <Trans k="aiSettings.intro" values={{ endpoint: <code>/chat/completions</code> }} />
      </div>

      <h3 className="settings-heading settings-heading-first">{t('aiSettings.providers')}</h3>
      {draft.providers.length === 0 && (
        <div className="setting-desc" style={{ marginBottom: 12 }}>
          {t('aiSettings.noProviders')}
        </div>
      )}
      {draft.providers.map((p, i) => {
        const result = tests[p.id];
        const isOpen = open.has(p.id);
        return (
          <div className="settings-group" key={p.id} style={{ marginBottom: 12 }}>
            <div className="setting-item" style={isOpen ? undefined : { borderBottom: 'none' }}>
              <div className="setting-info">
                <div className="setting-name">{p.name.trim() || '—'}</div>
                <div className="setting-desc" style={p.keyError && !p.forgetKey && !p.envKey ? errorStyle : undefined}>
                  {[p.model.trim(), keySummary(p)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={rowButtons}>
                <button onClick={() => toggleOpen(p.id)} aria-expanded={isOpen} disabled={busy}>
                  {isOpen ? t('common.close') : t('aiSettings.edit')}
                </button>
                <button onClick={() => removeProvider(p.id)} disabled={busy}>
                  {t('common.delete')}
                </button>
              </div>
            </div>
            {isOpen && (
              <>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">{t('aiSettings.name')}</div>
                  </div>
                  <input
                    className="setting-input"
                    style={fieldStyle}
                    value={p.name}
                    onChange={(e) => updateProvider(p.id, { name: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">{t('aiSettings.baseUrl')}</div>
                  </div>
                  <input
                    className="setting-input"
                    style={fieldStyle}
                    type="url"
                    placeholder="https://api.example.com/v1"
                    value={p.baseUrl}
                    onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">{t('aiSettings.model')}</div>
                  </div>
                  <input
                    className="setting-input"
                    style={fieldStyle}
                    value={p.model}
                    onChange={(e) => updateProvider(p.id, { model: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">{t('aiSettings.key')}</div>
                    <div className="setting-desc" style={p.keyError && !p.forgetKey ? errorStyle : undefined}>
                      {keyStatus(p)}
                    </div>
                  </div>
                  <input
                    className="setting-input"
                    style={fieldStyle}
                    type="password"
                    autoComplete="off"
                    placeholder={p.hasKey && !p.forgetKey ? `•••••••• (${t('aiSettings.key.savedShort')})` : 'sk-…'}
                    value={p.apiKey}
                    onChange={(e) =>
                      updateProvider(p.id, {
                        apiKey: e.target.value,
                        forgetKey: false,
                      })
                    }
                    disabled={busy}
                  />
                </div>
                <div className="setting-item">
                  <div className="setting-info">
                    <div className="setting-name">{t('aiSettings.keyEnv')}</div>
                    <div className="setting-desc">{t('aiSettings.keyEnv.desc')}</div>
                  </div>
                  <input
                    className="setting-input"
                    style={fieldStyle}
                    placeholder="DEEPSEEK_API_KEY"
                    value={p.apiKeyEnv}
                    onChange={(e) => updateProvider(p.id, { apiKeyEnv: e.target.value })}
                    disabled={busy}
                  />
                </div>
                <div className="setting-item" style={{ borderBottom: 'none' }}>
                  <div className="setting-info">
                    {result && (
                      <div
                        className="setting-desc"
                        style={result !== 'running' && result.error ? errorStyle : undefined}
                        role="status"
                      >
                        {result === 'running' ? t('ai.loading') : result.text}
                      </div>
                    )}
                  </div>
                  <div style={rowButtons}>
                    <button onClick={() => moveProvider(i, -1)} disabled={busy || i === 0} title={t('aiSettings.up')}>
                      ↑
                    </button>
                    <button
                      onClick={() => moveProvider(i, 1)}
                      disabled={busy || i === draft.providers.length - 1}
                      title={t('aiSettings.down')}
                    >
                      ↓
                    </button>
                    {p.hasKey && !p.forgetKey && (
                      <button onClick={() => updateProvider(p.id, { forgetKey: true, apiKey: '' })} disabled={busy}>
                        {t('aiSettings.forgetKey')}
                      </button>
                    )}
                    <button
                      onClick={() => test(p)}
                      disabled={busy || dirty || !p.from || result === 'running'}
                      title={dirty || !p.from ? t('sync.saveFirst') : undefined}
                    >
                      {t('aiSettings.test')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
      <div className="setting-item" style={{ borderBottom: 'none' }}>
        <div className="setting-info">
          <div className="setting-name">{t('aiSettings.add')}</div>
        </div>
        <select
          value=""
          disabled={busy}
          onChange={(e) => {
            const value = e.target.value;
            if (value) addProvider(PRESETS.find((p) => p.name === value) ?? null);
          }}
        >
          <option value="">{t('aiSettings.addChoose')}</option>
          {PRESETS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.label}
            </option>
          ))}
          <option value="custom">{t('aiSettings.custom')}</option>
        </select>
      </div>

      {draft.providers.length > 0 && (
        <>
          <h3 className="settings-heading">{t('aiSettings.usage')}</h3>
          <div className="settings-group">
            <div className="setting-item">
              <div className="setting-info">
                <div className="setting-name">{t('aiSettings.default')}</div>
              </div>
              <select
                value={draft.defaultId ?? ''}
                disabled={busy}
                onChange={(e) => change((d) => ({ ...d, defaultId: Number(e.target.value) }))}
              >
                {draft.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="setting-item" style={{ borderBottom: 'none', alignItems: 'flex-start' }}>
              <div className="setting-info">
                <div className="setting-name">{t('aiSettings.fallback')}</div>
                <div className="setting-desc">{t('aiSettings.fallback.desc')}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {draft.providers.map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={draft.fallback.includes(p.id)}
                      disabled={busy}
                      onChange={(e) => toggleFallback(p.id, e.target.checked)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <h3 className="settings-heading">{t('aiSettings.actions')}</h3>
          {draft.actions.map((a) => {
            const isOpen = open.has(a.id);
            const providerName = draft.providers.find((p) => p.id === a.provider)?.name;
            return (
              <div className="settings-group" key={a.id} style={{ marginBottom: 12 }}>
                <div className="setting-item" style={isOpen ? undefined : { borderBottom: 'none' }}>
                  <div className="setting-info">
                    <div className="setting-name">{a.name.trim() || '—'}</div>
                    <div className="setting-desc">{providerName ?? t('aiSettings.actionProvider.default')}</div>
                  </div>
                  <div style={rowButtons}>
                    <button onClick={() => toggleOpen(a.id)} aria-expanded={isOpen} disabled={busy}>
                      {isOpen ? t('common.close') : t('aiSettings.edit')}
                    </button>
                    <button
                      onClick={() =>
                        change((d) => ({
                          ...d,
                          actions: d.actions.filter((x) => x.id !== a.id),
                        }))
                      }
                      disabled={busy}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <>
                    <div className="setting-item">
                      <div className="setting-info">
                        <div className="setting-name">{t('aiSettings.actionName')}</div>
                      </div>
                      <input
                        className="setting-input"
                        style={fieldStyle}
                        value={a.name}
                        onChange={(e) => updateAction(a.id, { name: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div className="setting-item">
                      <div className="setting-info">
                        <div className="setting-name">{t('aiSettings.actionPrompt')}</div>
                      </div>
                      <textarea
                        className="setting-input"
                        style={{ ...fieldStyle, minHeight: 90, resize: 'vertical' }}
                        rows={4}
                        value={a.prompt}
                        onChange={(e) => updateAction(a.id, { prompt: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div className="setting-item" style={{ borderBottom: 'none' }}>
                      <div className="setting-info">
                        <div className="setting-name">{t('aiSettings.actionProvider')}</div>
                      </div>
                      <select
                        value={a.provider ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          updateAction(a.id, {
                            provider: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      >
                        <option value="">{t('aiSettings.actionProvider.default')}</option>
                        {draft.providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div className="setting-item" style={{ borderBottom: 'none' }}>
            <div className="setting-info" />
            <button
              disabled={busy}
              onClick={() => {
                const id = nextId++;
                change((d) => ({
                  ...d,
                  actions: [...d.actions, { id, name: '', prompt: '', provider: null }],
                }));
                // Una nueva hay que rellenarla: se abre ya desplegada
                setOpen((s) => new Set(s).add(id));
              }}
            >
              {t('aiSettings.addAction')}
            </button>
          </div>
        </>
      )}

      <div className="setting-item" style={{ borderBottom: 'none' }}>
        <div className="setting-info">
          {message && (
            <div className="setting-desc" style={message.error ? errorStyle : undefined}>
              {message.text}
            </div>
          )}
        </div>
        <button onClick={save} disabled={busy || !dirty}>
          {t('common.save')}
        </button>
      </div>

      <div className="setting-desc" style={{ marginTop: 8 }}>
        {settings.keysSecretFromEnv ? (
          t('aiSettings.encryption.env')
        ) : (
          <Trans
            k="aiSettings.encryption.file"
            values={{
              file: <code>data/.ai-secret</code>,
              env: <code>AI_KEYS_SECRET</code>,
            }}
          />
        )}
      </div>
    </>
  );
}
