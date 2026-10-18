// Reconocimiento de los atajos de archivo (renombrar, mover, borrar) y sus guardas. Vive aparte
// de MainLayout para tener en un solo sitio qué teclas son y poder probarlas sin DOM

export type FileShortcut = 'rename' | 'move' | 'delete';

interface KeyInfo {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

// Devuelve la acción del atajo o null. F2 renombra; con Ctrl/Cmd+Shift, M mueve y Retroceso borra.
// El nombre de `key` varía con la plataforma, así que las letras se normalizan y Retroceso se
// compara sin distinguir mayúsculas
export function fileShortcutFor(e: KeyInfo): FileShortcut | null {
  const key = e.key;
  const withMod = !!(e.ctrlKey || e.metaKey) && !e.altKey;

  if (key === 'F2' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return 'rename';
  if (withMod && e.shiftKey) {
    if (key === 'm' || key === 'M') return 'move';
    if (key === 'Backspace' || key === 'backspace') return 'delete';
  }
  return null;
}

// Escribir en un campo de la interfaz o en el editor de la nota
const TYPING = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';
// El editor de CodeMirror no es un input (es un div contenteditable), así que hay que nombrarlo
const EDITOR = '.cm-editor, .cm-lp-cell-input, [contenteditable="true"], [contenteditable=""]';
// Diálogos (también el buscador rápido, que usa el mismo overlay), menús y la búsqueda en la nota
const OVERLAY = '.modal-overlay, .dropdown-menu, .context-menu, .search-bar';

export function isTypingTarget(target: Element | null): boolean {
  return !!target?.closest(TYPING) || !!target?.closest(EDITOR);
}

export function hasOpenOverlay(): boolean {
  return !!document.querySelector(OVERLAY);
}

// ¿Puede dispararse el atajo? Mientras se escribe en un campo de la interfaz (búsqueda,
// propiedades, renombrar...) la acción no debe apartarse de lo que se está haciendo. Dentro del
// editor de la nota sí se admite mover y borrar, porque llevan Ctrl/Cmd+Shift (no son texto);
// F2 no, que es una tecla suelta y se pulsaría sin querer mientras se escribe.
// En cualquier caso no deben disparar con un diálogo o un menú abierto encima
export function canRunFileShortcut(
  action: FileShortcut,
  target: Element | null,
  opts: { overlayOpen: boolean },
): boolean {
  if (opts.overlayOpen) return false;
  const inField = !!target?.closest(TYPING);
  if (inField) return false;
  return action !== 'rename' || !isTypingTarget(target);
}
