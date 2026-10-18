import type { KeyboardEvent, ReactNode } from 'react';

// Navegación con el teclado del patrón de menú de ARIA, compartida por los menús contextuales

const menuItems = (menu: HTMLElement) => Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));

export function focusMenuItem(menu: HTMLElement | null, which: 'first' | 'last') {
  if (!menu) return;
  const list = menuItems(menu);
  (which === 'first' ? list[0] : list[list.length - 1])?.focus();
}

// onKeyDown del contenedor role="menu": las flechas recorren los elementos en bucle, Inicio/Fin van
// al primero/último y Tab avisa a `onTab` para que cierre el menú (Escape lo gestiona cada menú)
export function onMenuKeyDown(e: KeyboardEvent<HTMLElement>, onTab: (e: KeyboardEvent<HTMLElement>) => void) {
  const list = menuItems(e.currentTarget);
  if (list.length === 0) return;
  // -1: el foco está en el propio contenedor (menú abierto con el ratón)
  const i = list.indexOf(document.activeElement as HTMLElement);
  let next: number;
  switch (e.key) {
    case 'ArrowDown':
      next = (i + 1) % list.length;
      break;
    case 'ArrowUp':
      next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = list.length - 1;
      break;
    case 'Tab':
      onTab(e);
      return;
    default:
      return;
  }
  e.preventDefault();
  list[next].focus();
}

// Elemento de menú: botón fuera del orden de Tab, se alcanza con las flechas
export function MenuItem({
  danger,
  onClick,
  children,
}: {
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`dropdown-item ${danger ? 'danger' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
