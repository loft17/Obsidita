// Versión móvil: por debajo de este ancho la interfaz pasa a una sola columna, con la barra
// lateral como panel deslizante y una cabecera compacta en lugar de pestañas y ruta
import { useEffect, useRef, useState, type TouchEvent } from 'react';

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
