// Diagramas Mermaid de la vista de lectura (bloques ```mermaid).
// Mermaid pesa bastante, así que se descarga solo la primera vez que una nota
// tiene un diagrama. Los SVG generados se guardan en caché para no volver a
// dibujarlos (ni parpadear) cada vez que la vista se repinta.

type Mermaid = typeof import('mermaid').default;

// Solo los diagramas habituales. Mermaid registra de serie los que usan el parser de Langium
// (cynefin, architecture): al cargarlo, el propio bundle incluye la lista de todos los tipos y
// descarga de golpe un bloque de ~674 kB de gramática, aunque el diagrama sea un simple
// flowchart. Como mermaid solo registra esos de serie dentro de `render`, aquí se registran a
// mano los necesarios: los demás salen como error en vez de dibujarse
// Cada tipo de diagrama está en su propio trozo y exporta `diagram`, así que solo se descarga el
// que usa la nota
type DiagramModule = { diagram: unknown };

const MODULES = {
  flowchart: () => import('mermaid/dist/chunks/mermaid.core/flowDiagram-HODETNUW.mjs'),
  sequence: () => import('mermaid/dist/chunks/mermaid.core/sequenceDiagram-WJ2MYXX4.mjs'),
  class: () => import('mermaid/dist/chunks/mermaid.core/classDiagram-v2-VYDZK3BY.mjs'),
  er: () => import('mermaid/dist/chunks/mermaid.core/erDiagram-RLTQ6QDP.mjs'),
  state: () => import('mermaid/dist/chunks/mermaid.core/stateDiagram-v2-MP3YSRHH.mjs'),
  pie: () => import('mermaid/dist/chunks/mermaid.core/pieDiagram-E7YTZNPT.mjs'),
  gantt: () => import('mermaid/dist/chunks/mermaid.core/ganttDiagram-EL5Y4UJY.mjs'),
  journey: () => import('mermaid/dist/chunks/mermaid.core/journeyDiagram-3NMN7TZE.mjs'),
  mindmap: () => import('mermaid/dist/chunks/mermaid.core/mindmap-definition-YA3MSWOX.mjs'),
  timeline: () => import('mermaid/dist/chunks/mermaid.core/timeline-definition-24CTP7MA.mjs'),
  quadrant: () => import('mermaid/dist/chunks/mermaid.core/quadrantDiagram-AXDQQJYC.mjs'),
  sankey: () => import('mermaid/dist/chunks/mermaid.core/sankeyDiagram-P5KCCOFB.mjs'),
  xychart: () => import('mermaid/dist/chunks/mermaid.core/xychartDiagram-S5SC5T6Z.mjs'),
  info: () => import('mermaid/dist/chunks/mermaid.core/infoDiagram-27XIBGKW.mjs'),
} satisfies Record<string, () => Promise<DiagramModule>>;

// Bloque de diagrama de mermaid: id, texto con el que se reconoce y carga de su módulo
const block = (
  id: string,
  detector: RegExp | ((txt: string, config?: DiagramConfig) => boolean),
  module: keyof typeof MODULES,
) => ({
  id,
  detector: (txt: string, config?: DiagramConfig) =>
    detector instanceof RegExp ? detector.test(txt) : detector(txt, config),
  loader: () => MODULES[module]().then((m) => ({ id, diagram: m.diagram })),
});

type DiagramConfig = {
  flowchart?: { defaultRenderer?: string };
  class?: { defaultRenderer?: string };
  state?: { defaultRenderer?: string };
  layout?: string;
};

// Los de flujo y clases dependen del renderizador configurado: los detectores son los de
// mermaid. `gitGraph` también empieza por `graph`, así que se descarta ahí
const FLOWCHART = {
  id: 'flowchart',
  detector: (txt: string, config?: DiagramConfig) => {
    const renderer = config?.flowchart?.defaultRenderer;
    if (renderer === 'dagre-wrapper' || renderer === 'elk') return false;
    return /^\s*graph/.test(txt);
  },
  loader: () => MODULES.flowchart().then((m) => ({ id: 'flowchart', diagram: m.diagram })),
};

const FLOWCHART_V2 = {
  id: 'flowchart-v2',
  detector: (txt: string, config?: DiagramConfig) => {
    const renderer = config?.flowchart?.defaultRenderer;
    if (renderer === 'dagre-d3') return false;
    if (renderer === 'elk') config!.layout = 'elk';
    if (/^\s*gitGraph/.test(txt)) return false;
    if (/^\s*graph/.test(txt)) return renderer === 'dagre-wrapper';
    return /^\s*flowchart/.test(txt);
  },
  loader: () => MODULES.flowchart().then((m) => ({ id: 'flowchart-v2', diagram: m.diagram })),
};

const CLASS = {
  id: 'class',
  detector: (txt: string, config?: DiagramConfig) => {
    if (config?.class?.defaultRenderer === 'dagre-wrapper') return false;
    return /^\s*classDiagram/.test(txt);
  },
  loader: () => MODULES.class().then((m) => ({ id: 'class', diagram: m.diagram })),
};

const CLASS_V2 = {
  id: 'classDiagram',
  detector: (txt: string, config?: DiagramConfig) =>
    (/^\s*classDiagram/.test(txt) && config?.class?.defaultRenderer === 'dagre-wrapper') ||
    /^\s*classDiagram-v2/.test(txt),
  loader: () => MODULES.class().then((m) => ({ id: 'classDiagram', diagram: m.diagram })),
};

const STATE = {
  id: 'state',
  detector: (txt: string, config?: DiagramConfig) =>
    config?.state?.defaultRenderer !== 'dagre-wrapper' && /^\s*stateDiagram/.test(txt),
  loader: () => MODULES.state().then((m) => ({ id: 'state', diagram: m.diagram })),
};

const STATE_V2 = {
  id: 'stateDiagram',
  detector: (txt: string, config?: DiagramConfig) =>
    /^\s*stateDiagram-v2/.test(txt) ||
    (/^\s*stateDiagram/.test(txt) && config?.state?.defaultRenderer === 'dagre-wrapper'),
  loader: () => MODULES.state().then((m) => ({ id: 'stateDiagram', diagram: m.diagram })),
};

const DIAGRAMS = [
  FLOWCHART,
  FLOWCHART_V2,
  CLASS,
  CLASS_V2,
  STATE,
  STATE_V2,
  block('sequence', /^\s*sequenceDiagram/, 'sequence'),
  block('er', /^\s*erDiagram/, 'er'),
  block('pie', /^\s*pie/, 'pie'),
  block('gantt', /^\s*gantt/, 'gantt'),
  block('journey', /^\s*journey/, 'journey'),
  block('mindmap', /^\s*mindmap/, 'mindmap'),
  block('timeline', /^\s*timeline/, 'timeline'),
  block('quadrantChart', /^\s*quadrantChart/, 'quadrant'),
  block('sankey', /^\s*sankey(-beta)?/, 'sankey'),
  block('xychart', /^\s*xychart(-beta)?/, 'xychart'),
  block('info', /^\s*info/, 'info'),
];

let mermaidPromise: Promise<Mermaid> | null = null;

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(async (m) => {
    const mermaid = m.default;
    // Aquí solo se registran los diagramas: cada uno se descarga al encontrar su tipo. La
    // configuración (tema, fuente, seguridad) se aplica antes de cada render
    if (typeof mermaid.registerExternalDiagrams === 'function') {
      await mermaid.registerExternalDiagrams(DIAGRAMS as never);
    }
    return mermaid;
  });
  return mermaidPromise;
}

export type DiagramTheme = 'dark' | 'light';

// Tema resuelto (applyTheme en store.ts lo deja en <html data-theme>)
export const currentDiagramTheme = (): DiagramTheme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

const MAX_CACHE = 100;
const svgCache = new Map<string, string>();
const cacheKey = (source: string, theme: DiagramTheme) => `${theme}\n${source}`;

export const cachedDiagram = (source: string, theme: DiagramTheme) => svgCache.get(cacheKey(source, theme));

function remember(key: string, svg: string) {
  svgCache.delete(key);
  svgCache.set(key, svg);
  if (svgCache.size > MAX_CACHE) svgCache.delete(svgCache.keys().next().value!);
}

let initializedTheme: DiagramTheme | null = null;
let nextId = 0;

const PENDING = '.mermaid-diagram:not(.is-rendered):not(.is-error)';

export function renderMermaidDiagrams(root: HTMLElement, errorLabel: string) {
  const blocks = root.querySelectorAll<HTMLElement>(PENDING);
  if (!blocks.length) return;
  loadMermaid()
    .then(async (mermaid) => {
      const theme = currentDiagramTheme();
      if (initializedTheme !== theme) {
        mermaid.initialize({
          startOnLoad: false,
          // 'strict' sanea las etiquetas y desactiva los clics que ejecutan JavaScript
          securityLevel: 'strict',
          theme: theme === 'light' ? 'default' : 'dark',
          // Mermaid mide el texto con esta fuente: tiene que ser la real, no 'inherit'
          fontFamily: getComputedStyle(document.body).fontFamily,
        });
        initializedTheme = theme;
      }
      for (const block of blocks) {
        // El nodo puede haberse sustituido si la nota cambió mientras se cargaba
        if (!block.isConnected || block.classList.contains('is-rendered')) continue;
        const source = block.dataset.source ?? '';
        const key = cacheKey(source, theme);
        try {
          let svg = svgCache.get(key);
          if (!svg) {
            // parse lanza con un mensaje legible y no deja restos en el DOM si falla
            await mermaid.parse(source);
            ({ svg } = await mermaid.render(`mermaid-${++nextId}`, source));
            remember(key, svg);
          }
          if (!block.isConnected) continue;
          block.innerHTML = svg;
          block.classList.add('is-rendered');
        } catch (err) {
          if (!block.isConnected) continue;
          const message = document.createElement('div');
          message.className = 'mermaid-error-message';
          message.textContent = `${errorLabel}: ${err instanceof Error ? err.message : String(err)}`;
          block.prepend(message);
          block.classList.add('is-error');
        }
      }
    })
    .catch(() => {
      // Si falla la descarga, se queda el código fuente del diagrama
      mermaidPromise = null;
    });
}
