import { create } from 'zustand';

// Avisos breves en una esquina (guardado, sincronización...). Cada aviso tiene una clave:
// uno nuevo con la misma clave sustituye al anterior en vez de apilarse, así el autoguardado
// mientras se escribe no llena la pantalla de avisos

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  key: string;
  text: string;
  kind: ToastKind;
  id: number;
  // Esquina superior derecha en vez de la inferior (avisos generales, no de una acción)
  top?: boolean;
}

const DURATION: Record<ToastKind, number> = { success: 1800, info: 2500, error: 6000 };

const timers = new Map<string, number>();
let nextId = 1;

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export const dismissToast = (key: string) => {
  clearTimeout(timers.get(key));
  timers.delete(key);
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) }));
};

// `duration` 0: se queda hasta que otro aviso con la misma clave lo sustituya o se cierre
export const notify = (
  key: string,
  text: string,
  kind: ToastKind = 'success',
  duration = DURATION[kind],
  top = false,
) => {
  clearTimeout(timers.get(key));
  timers.delete(key);
  const toast = { key, text, kind, id: nextId++, top };
  useToasts.setState((s) => {
    const i = s.toasts.findIndex((t) => t.key === key);
    if (i === -1) return { toasts: [...s.toasts, toast] };
    const toasts = [...s.toasts];
    toasts[i] = toast;
    return { toasts };
  });
  if (duration)
    timers.set(
      key,
      window.setTimeout(() => dismissToast(key), duration),
    );
};
