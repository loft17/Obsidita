// Evento que abre el menú de una imagen (clic derecho en el editor). Va aparte del componente para
// que las vistas de CodeMirror (livePreview, liveTables) lo usen sin depender de React ni del editor
export const IMAGE_MENU = 'image-menu';

export interface ImageMenuAt {
  x: number;
  y: number;
  path: string; // ruta dentro del vault
}

// Abre el menú de una imagen en la posición del clic derecho
export function openImageMenu(e: MouseEvent, path: string) {
  window.dispatchEvent(new CustomEvent<ImageMenuAt>(IMAGE_MENU, { detail: { x: e.clientX, y: e.clientY, path } }));
}
