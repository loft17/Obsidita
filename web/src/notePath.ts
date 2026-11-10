// Ruta de la nota abierta en el editor, para resolver las imágenes relativas. Va en su propio
// módulo para que livePreview y liveTables la usen sin importarse entre sí
import { Facet } from '@codemirror/state';

export const notePath = Facet.define<() => string, () => string>({
  combine: (values) => values[0] ?? (() => ''),
});
