// Barra de edición con IA (Ctrl/Cmd+K, el botón ✨ de la barra del editor o el menú de la nota).
// Se descarga con import() la primera vez que se abre, junto con el diff y sus estilos.
// La respuesta se aplica directamente en el editor, en una única transacción (un solo Ctrl+Z) y
// con el autoguardado de siempre. Durante 5 minutos se guarda en memoria la nota de antes para
// poder deshacerlo con el botón aunque se haya cambiado de nota. El servidor nunca escribe la nota
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type ChangeSpec, type Text } from '@codemirror/state';
import { isolateHistory, undo } from '@codemirror/commands';
import { aiApi, type AiAction } from '../api';
import { closeAiBar, useAiStore } from '../ai';
import { diffText } from '../aiDiff';
import { notify } from '../toast';
import { t as translate, useT } from '../i18n';
import { aiErrorMessage } from '../aiErrors';
import { readString, writeRaw } from '../store/storage';
import { IconSparkles } from './Icons';
import '../styles/ai.css';

interface Range {
  from: number;
  to: number;
}

// Estado en el editor mientras se espera: el tramo que se edita (sigue a los cambios del
// documento) y si ha cambiado desde que se envió (`touched`: la respuesta ya no le corresponde)
interface AiField {
  range: Range | null;
  deco: DecorationSet;
  touched: boolean;
}

const setAi = StateEffect.define<Range | null>();

// Se resalta el tramo que se está editando (la selección deja de verse sin el foco)
const scopeMark = Decoration.mark({ class: 'cm-ai-scope' });
const buildDeco = (range: Range | null) =>
  range && range.from < range.to ? Decoration.set([scopeMark.range(range.from, range.to)]) : Decoration.none;

const aiField = StateField.define<AiField>({
  create: () => ({ range: null, deco: Decoration.none, touched: false }),
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setAi)) return { range: e.value, deco: buildDeco(e.value), touched: false };
    }
    if (!tr.docChanged || !value.range) return value;
    const { from, to } = value.range;
    let touched = value.touched;
    tr.changes.iterChangedRanges((fromA, toA) => {
      if (fromA <= to && toA >= from) touched = true;
    });
    const start = tr.changes.mapPos(from, 1);
    const range = { from: start, to: Math.max(start, tr.changes.mapPos(to, -1)) };
    return { range, deco: value.deco.map(tr.changes), touched };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// Solo hay una barra abierta a la vez: el listener del editor avisa a la que está montada
let onEditorUpdate: ((u: ViewUpdate) => void) | null = null;
const aiExtension = [aiField, EditorView.updateListener.of((u) => onEditorUpdate?.(u))];

const ensureExtension = (view: EditorView) => {
  if (!view.state.field(aiField, false)) view.dispatch({ effects: StateEffect.appendConfig.of(aiExtension) });
};

// Último cambio aplicado: la nota antes y después, para deshacerlo durante UNDO_MS aunque se haya
// cambiado de nota (el historial del editor se pierde al cerrarla). Solo en memoria, sin servidor
const UNDO_MS = 5 * 60 * 1000;
interface Applied {
  path: string;
  before: string;
  after: string;
  // Documento justo después de aplicar: si sigue siendo el mismo, se deshace con el historial
  doc: Text;
  expires: number;
  // Para Reintentar: el tramo y el texto originales, y la petición
  range: Range;
  original: string;
  selection: boolean;
  req: Request;
}
let lastApplied: Applied | null = null;
const currentApplied = (path: string) =>
  lastApplied && lastApplied.path === path && lastApplied.expires > Date.now() ? lastApplied : null;

// Último proveedor usado en este navegador
const PROVIDER_KEY = 'aiProvider';

const countWords = (text: string) => text.match(/[\p{L}\p{N}_]+/gu)?.length ?? 0;

const describeScope = (view: EditorView | null) => {
  const sel = view?.state.selection.main;
  if (!view || !sel || sel.empty) return { selection: false, words: 0 };
  return { selection: true, words: countWords(view.state.sliceDoc(sel.from, sel.to)) };
};

// Cambios mínimos para pasar de `a` a `b` empezando en `from`: así el cursor y el scroll se
// conservan fuera de lo que cambia. Van todos en la misma transacción
function changesFor(from: number, a: string, b: string): ChangeSpec[] {
  const changes: { from: number; to: number; insert: string }[] = [];
  let pos = from;
  let current: { from: number; to: number; insert: string } | null = null;
  for (const op of diffText(a, b)) {
    if (op.type === 'eq') {
      current = null;
      pos += op.text.length;
      continue;
    }
    if (!current) {
      current = { from: pos, to: pos, insert: '' };
      changes.push(current);
    }
    if (op.type === 'del') {
      pos += op.text.length;
      current.to = pos;
    } else current.insert += op.text;
  }
  return changes;
}

interface Request {
  text: string;
  instruction: string;
  provider: string;
}

interface Job {
  range: Range;
  original: string;
  selection: boolean;
  // Última petición, para Reintentar tras un error
  last: Request | null;
}

type Phase = 'idle' | 'loading';

export default function AiBar({ viewRef, filePath }: { viewRef: RefObject<EditorView | null>; filePath: string }) {
  const config = useAiStore((s) => s.config);
  const focusRequest = useAiStore((s) => s.focusRequest);
  const providers = config?.enabled ? config.providers : [];
  const actions: AiAction[] = config?.enabled ? config.actions : [];
  const maxChars = config?.enabled ? config.maxChars : 0;
  const t = useT();

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [instruction, setInstruction] = useState('');
  const [provider, setProvider] = useState(() => {
    const saved = readString(PROVIDER_KEY);
    return providers.includes(saved) ? saved : config?.enabled ? config.default : '';
  });
  const [scope, setScope] = useState(() => describeScope(viewRef.current));
  // Cambio que se puede deshacer con el botón (se vuelve a pintar cuando caduca)
  const [applied, setApplied] = useState(() => currentApplied(filePath));
  const jobRef = useRef<Job | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearEditor = () => {
    const view = viewRef.current;
    if (view?.state.field(aiField, false)) view.dispatch({ effects: setAi.of(null) });
  };

  // La nota ha cambiado mientras se esperaba: no se aplica nada
  const markStale = () => {
    jobRef.current = null;
    clearEditor();
    setPhase('idle');
    setMessage({ text: translate('ai.changed'), error: true });
  };

  useEffect(() => {
    // Si el módulo ya estaba descargado, la barra se monta antes de que el editor cree su vista
    // (los efectos de los hijos van primero): se repite en cuanto termine el montaje
    const init = () => {
      const view = viewRef.current;
      if (!view) return;
      ensureExtension(view);
      if (!jobRef.current) setScope(describeScope(view));
    };
    init();
    const timer = window.setTimeout(init);
    onEditorUpdate = (u) => {
      if (u.selectionSet && !jobRef.current) setScope(describeScope(u.view));
    };
    return () => {
      clearTimeout(timer);
      onEditorUpdate = null;
      abortRef.current?.abort();
      clearEditor();
    };
    // Solo al montar: la barra se monta de nuevo con cada editor
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [focusRequest]);

  // Pasados los 5 minutos desaparece el botón Deshacer
  useEffect(() => {
    if (!applied) return;
    const id = window.setTimeout(() => setApplied(currentApplied(filePath)), applied.expires - Date.now());
    return () => clearTimeout(id);
  }, [applied, filePath]);

  const request = async (job: Job, req: Request) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    job.last = req;
    setPhase('loading');
    setMessage(null);
    try {
      const res = await aiApi.edit(req, controller.signal);
      if (jobRef.current !== job) return;
      if (res.failed.length) {
        notify('ai', translate('ai.fallback', { used: res.provider, failed: res.failed.join(', ') }), 'info');
      }
      apply(job, req, res.text);
    } catch (err) {
      if (controller.signal.aborted || jobRef.current !== job) return;
      setMessage({ text: aiErrorMessage(err, maxChars), error: true });
      setPhase('idle');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const apply = (job: Job, req: Request, text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const field = view.state.field(aiField, false);
    if (!field?.range || field.touched || view.state.sliceDoc(field.range.from, field.range.to) !== job.original) {
      return markStale();
    }
    const range = field.range;
    jobRef.current = null;
    setPhase('idle');
    if (text === job.original) {
      clearEditor();
      setMessage({ text: translate('ai.noChanges'), error: false });
      return;
    }
    const before = view.state.doc.toString();
    view.dispatch({
      changes: changesFor(range.from, job.original, text),
      effects: setAi.of(null),
      // Con una selección, queda seleccionado el texto nuevo: la siguiente instrucción lo afina
      selection: job.selection ? { anchor: range.from, head: range.from + text.length } : undefined,
      // Un paso propio en el historial: Ctrl+Z deshace justo esto, sin mezclarlo con lo escrito antes
      annotations: isolateHistory.of('full'),
      userEvent: 'input',
      scrollIntoView: true,
    });
    lastApplied = {
      path: filePath,
      before,
      after: view.state.doc.toString(),
      doc: view.state.doc,
      expires: Date.now() + UNDO_MS,
      range,
      original: job.original,
      selection: job.selection,
      req,
    };
    setApplied(lastApplied);
    setInstruction('');
    setScope(describeScope(view));
    setMessage({ text: translate('ai.applied'), error: false });
  };

  // Deshace el último cambio de la IA. Si el editor no ha cambiado desde entonces, con su
  // historial (Ctrl+Y lo rehace); si se ha cambiado de nota y vuelto, con la copia de antes
  const undoApplied = (): boolean => {
    const view = viewRef.current;
    const last = currentApplied(filePath);
    if (!view || !last) return false;
    if (view.state.doc === last.doc) {
      undo(view);
    } else if (view.state.doc.toString() === last.after) {
      view.dispatch({
        changes: changesFor(0, last.after, last.before),
        annotations: isolateHistory.of('full'),
        userEvent: 'input',
        scrollIntoView: true,
      });
    } else {
      setMessage({ text: translate('ai.cantUndo'), error: true });
      return false;
    }
    lastApplied = null;
    setApplied(null);
    setScope(describeScope(view));
    setMessage({ text: translate('ai.undone'), error: false });
    return true;
  };

  const send = (text: string, prov: string) => {
    const view = viewRef.current;
    if (!view || !text.trim() || !prov) return;
    const sel = view.state.selection.main;
    const range = sel.empty ? { from: 0, to: view.state.doc.length } : { from: sel.from, to: sel.to };
    start(view, { range, original: view.state.sliceDoc(range.from, range.to), selection: !sel.empty }, text, prov);
  };

  const start = (view: EditorView, target: Omit<Job, 'last'>, text: string, prov: string) => {
    if (maxChars && target.original.length > maxChars) {
      setMessage({ text: translate('ai.error.tooLong', { max: maxChars }), error: true });
      return;
    }
    const job: Job = { ...target, last: null };
    jobRef.current = job;
    ensureExtension(view);
    view.dispatch({ effects: setAi.of(job.range) });
    request(job, { text: job.original, instruction: text.trim(), provider: prov });
  };

  // Tras un error repite la petición; tras aplicar un cambio, lo deshace y la repite
  const retry = () => {
    const job = jobRef.current;
    if (job?.last) return request(job, job.last);
    const view = viewRef.current;
    const last = currentApplied(filePath);
    if (!view || !last || !undoApplied()) return;
    start(
      view,
      { range: last.range, original: last.original, selection: last.selection },
      last.req.instruction,
      last.req.provider,
    );
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    jobRef.current = null;
    clearEditor();
    setPhase('idle');
  };

  const close = () => {
    closeAiBar();
    viewRef.current?.focus();
  };

  // Esc también con el foco en el editor: cancela la petición o cierra la barra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (!viewRef.current?.dom.contains(e.target as Node)) return;
      e.preventDefault();
      if (phase === 'loading') cancel();
      else close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const runAction = (action: AiAction) => {
    const prov = action.provider && providers.includes(action.provider) ? action.provider : provider;
    send(action.prompt, prov);
  };

  const job = jobRef.current;
  const shownScope = job ? { selection: job.selection, words: countWords(job.original) } : scope;
  const loading = phase === 'loading';

  // Segundos de espera: algunos modelos tardan más de un minuto y la barra no debe parecer colgada
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  return (
    <div className="ai-bar" role="region" aria-label={t('ai.title')}>
      <div className="ai-bar-row">
        <IconSparkles size={16} className="ai-bar-icon" />
        <input
          ref={inputRef}
          type="text"
          className="ai-bar-input"
          value={instruction}
          placeholder={t('ai.placeholder')}
          aria-label={t('ai.instruction')}
          enterKeyHint="send"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!loading) send(instruction, provider);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (loading) cancel();
              else close();
            }
          }}
        />
        {providers.length > 1 && (
          <select
            className="ai-bar-provider"
            value={provider}
            aria-label={t('ai.provider')}
            title={t('ai.provider')}
            onChange={(e) => {
              setProvider(e.target.value);
              writeRaw(PROVIDER_KEY, e.target.value);
            }}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="ai-bar-close"
          title={t('common.close')}
          aria-label={t('common.close')}
          onClick={close}
        >
          ✕
        </button>
      </div>
      <div className="ai-bar-row ai-bar-actions">
        <span className="ai-bar-scope">
          {shownScope.selection ? t('ai.scopeSelection', { n: shownScope.words }) : t('ai.scopeNote')}
        </span>
        {loading ? (
          <>
            <span className="ai-bar-status" role="status">
              <span className="ai-bar-spinner" aria-hidden="true" />
              {elapsed >= 3 ? t('ai.loadingSeconds', { n: elapsed }) : t('ai.loading')}
            </span>
            <button type="button" onClick={cancel}>
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            {applied && (
              <>
                <button type="button" className="ai-bar-primary" onClick={undoApplied}>
                  {t('ai.undo')}
                </button>
                <button type="button" onClick={retry}>
                  {t('ai.retry')}
                </button>
              </>
            )}
            {actions.map((a) => (
              <button key={a.name} type="button" title={a.prompt} onClick={() => runAction(a)}>
                {a.name}
              </button>
            ))}
            {message?.error && job?.last && (
              <button type="button" onClick={retry}>
                {t('ai.retry')}
              </button>
            )}
          </>
        )}
      </div>
      {message && (
        <div
          className={'ai-bar-message' + (message.error ? ' is-error' : '')}
          role={message.error ? 'alert' : 'status'}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
