// Versión móvil: por debajo de este ancho la interfaz pasa a una sola columna, con la barra
// lateral como panel deslizante y una cabecera compacta en lugar de pestañas y ruta
import { useRef, useSyncExternalStore, type TouchEvent } from 'react';

const MOBILE_QUERY = '(max-width: 768px)';

let mql: MediaQueryList | null = null;
const listeners = new Set<() => void>();

// Un único matchMedia (y un único listener) para toda la app. Antes cada componente que lo
// usaba creaba el suyo: FileTreeNode lo llama por cada fila, así que con N nodos había N
// matchMedia y N listeners vivos a la vez
const mqlRef = () => {
  if (!mql && typeof window !== 'undefined') {
    mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener('change', () => {
      for (const notify of listeners) notify();
    });
  }
  return mql;
};

// Se crea el matchMedia al suscribir (no al leer el valor): así el snapshot es una lectura pura
const subscribe = (notify: () => void) => {
  mqlRef();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

export const isMobile = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

export function useIsMobile() {
  // El mismo valor (y el mismo snapshot) para todos los componentes: solo se re-renderizan
  // cuando la media query cambia de verdad. El snapshot es un booleano, así que React lo
  // compara por Object.is sin riesgo de bucle
  return useSyncExternalStore(
    subscribe,
    () => mql?.matches ?? false,
    () => false,
  );
}

// Pulsación larga en pantallas táctiles: abre el menú contextual. Android ya lo hace solo con
// el evento contextmenu, pero Safari en iOS no lo envía nunca
export function useLongPress(onLongPress: (x: number, y: number) => void, delay = 500) {
  const timer = useRef<number>();
  const origin = useRef({ x: 0, y: 0 });
  // Tras una pulsación larga no debe llegar también el clic que abriría la nota
  const fired = useRef(false);
  const cancel = () => window.clearTimeout(timer.current);

  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      fired.current = false;
      const { clientX: x, clientY: y } = e.touches[0];
      origin.current = { x, y };
      cancel();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        onLongPress(x, y);
      }, delay);
    },
    // Si el dedo se desplaza es un scroll, no una pulsación larga
    onTouchMove: (e: TouchEvent) => {
      const { clientX: x, clientY: y } = e.touches[0];
      if (Math.hypot(x - origin.current.x, y - origin.current.y) > 10) cancel();
    },
    onTouchEnd: (e: TouchEvent) => {
      cancel();
      if (fired.current) e.preventDefault();
    },
    onTouchCancel: cancel,
  };

  return { handlers, fired };
}

// Safari en iOS no hace caso de interactive-widget=resizes-content: el teclado tapa la página
// en lugar de encogerla y Safari desplaza la página entera para enseñar el cursor. Al escribir,
// el editor y Safari se pelean por el scroll y la nota salta arriba. Se ajusta la altura de la
// app a la zona visible (--app-height) y la página se mantiene sin desplazar
function revealFocus() {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return;
  // CodeMirror se importa aquí y no arriba para no meterlo en la carga inicial (login);
  // cuando hay una nota abierta ya está descargado
  if (!active.closest('.cm-editor')) {
    active.scrollIntoView({ block: 'nearest' });
    return;
  }
  import('@codemirror/view').then(({ EditorView }) => {
    const view = EditorView.findFromDOM(active);
    // En el texto de la nota se muestra su cursor; en un campo (celda de tabla, propiedad,
    // título...) el propio campo, porque el cursor de CodeMirror no está en él
    if (view && active === view.contentDOM) {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head) });
    } else {
      active.scrollIntoView({ block: 'nearest' });
    }
  });
}

// Campo en el que se puede escribir: mientras haya uno con el foco el teclado puede estar abierto
function isEditable(el: Element | null): boolean {
  if (!el || el === document.body) return false;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.readOnly && !['button', 'checkbox', 'radio', 'range', 'color', 'file', 'submit', 'reset', 'image'].includes(el.type);
  }
  return el instanceof HTMLSelectElement;
}

export function fitToVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let lastHeight = vv.height;
  const update = () => {
    // Sin campo con el foco el teclado está cerrado: la app ocupa toda la pantalla (100dvh).
    // Safari a veces no avisa del último cambio de tamaño al cerrarse el teclado (o lo hace a
    // mitad de la animación, o con el zoom que pone al entrar en un campo) y --app-height se
    // quedaba con la altura que tenía con el teclado abierto, tapando media página
    if (!isEditable(document.activeElement)) {
      root.style.removeProperty('--app-height');
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
      lastHeight = vv.height;
      return;
    }
    // Con zoom de pellizco la zona visible es más pequeña, pero no hay que encoger la app
    if (Math.abs(vv.scale - 1) > 0.01) return;
    root.style.setProperty('--app-height', `${vv.height}px`);
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    // Al abrirse el teclado, el cursor puede quedar por debajo de la nueva altura
    if (vv.height < lastHeight) requestAnimationFrame(revealFocus);
    lastHeight = vv.height;
  };
  // Además de en cada evento se vuelve a medir cuando termina la animación del teclado, por si
  // el último evento llegó antes de que acabara o no llegó
  let timers: number[] = [];
  const schedule = () => {
    update();
    timers.forEach(clearTimeout);
    timers = [150, 400, 800].map((ms) => window.setTimeout(update, ms));
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', update);
  window.addEventListener('resize', schedule);
  // Al pasar de un campo a otro el foco sale y entra enseguida: los temporizadores miden
  // cuando ya está en el nuevo y no se llega a quitar la altura
  document.addEventListener('focusout', () => {
    timers.forEach(clearTimeout);
    timers = [150, 400, 800].map((ms) => window.setTimeout(update, ms));
  });
  document.addEventListener('focusin', schedule);
  update();
}
