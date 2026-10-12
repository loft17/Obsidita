// Versión móvil: por debajo de este ancho la interfaz pasa a una sola columna, con la barra
// lateral como panel deslizante y una cabecera compacta en lugar de pestañas y ruta
import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { EditorView } from '@codemirror/view';

const MOBILE_QUERY = '(max-width: 768px)';

export const isMobile = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobile);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mobile;
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
  const view = EditorView.findFromDOM(active);
  // En el texto de la nota se muestra su cursor; en un campo (celda de tabla, propiedad,
  // título...) el propio campo, porque el cursor de CodeMirror no está en él
  if (view && active === view.contentDOM) {
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head) });
  } else {
    active.scrollIntoView({ block: 'nearest' });
  }
}

export function fitToVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  let lastHeight = vv.height;
  const update = () => {
    // Con zoom de pellizco la zona visible es más pequeña, pero no hay que encoger la app
    if (Math.abs(vv.scale - 1) > 0.01) return;
    document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    // Al abrirse el teclado, el cursor puede quedar por debajo de la nueva altura
    if (vv.height < lastHeight) requestAnimationFrame(revealFocus);
    lastHeight = vv.height;
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}
