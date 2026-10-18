import { useLayoutEffect, useRef } from 'react';

// Ref que siempre apunta al último valor recibido, para listeners que se registran una sola vez
// (CodeMirror, document...) y deben llamar al manejador del último render. Se actualiza en un
// efecto de layout, no durante el render, y por eso ya está al día cuando corren los useEffect
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
