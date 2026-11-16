// Menú del clic derecho sobre una imagen de la nota (vista previa y celdas de tablas): renombrar
// la imagen o convertirla a WebP/JPG. Los cambios reescriben los enlaces de todo el vault
import { useEffect, useRef, useState } from 'react';
import { applyPathChange, convertImagePath } from './fileActions';
import { RenameDialog } from './FileDialogs';
import { MenuItem, onMenuKeyDown } from './menuNav';
import { fileName, renamedPath } from '../paths';
import { useT } from '../i18n';
import { IMAGE_MENU, type ImageMenuAt } from '../imageMenuEvent';

const extOf = (path: string) => {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

// Extensiones que el navegador puede leer y codificar a cada formato (ver imageConvert.ts)
const TO_WEBP = ['png', 'jpg', 'jpeg', 'bmp'];
const TO_JPG = ['png', 'webp', 'bmp'];

export default function ImageContextMenu() {
  const [menu, setMenu] = useState<ImageMenuAt | null>(null);
  // Imagen que se está renombrando (null: el diálogo está cerrado)
  const [renaming, setRenaming] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const onOpen = (e: Event) => setMenu((e as CustomEvent<ImageMenuAt>).detail);
    window.addEventListener(IMAGE_MENU, onOpen);
    return () => window.removeEventListener(IMAGE_MENU, onOpen);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const ext = menu ? extOf(menu.path) : '';
  const canWebp = TO_WEBP.includes(ext);
  const canJpg = TO_JPG.includes(ext);

  // Dentro de la ventana: si no cabe, sube o se corre hacia la izquierda (altura aproximada)
  const itemCount = 1 + (canWebp ? 1 : 0) + (canJpg ? 1 : 0);
  const left = menu ? Math.max(4, Math.min(menu.x, window.innerWidth - 220)) : 0;
  const top = menu ? Math.max(4, Math.min(menu.y, window.innerHeight - (itemCount * 34 + 12))) : 0;

  const convert = (path: string, format: 'webp' | 'jpg') => {
    setMenu(null);
    void convertImagePath(path, format);
  };

  // El nombre se edita sin extensión: la imagen conserva su formato al renombrarla
  const name = renaming ? fileName(renaming) : '';
  const dot = name.lastIndexOf('.');
  const baseName = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';

  return (
    <>
      {menu && (
        <div
          ref={menuRef}
          className="context-menu"
          role="menu"
          aria-label={t('image.menu')}
          style={{ left, top }}
          onKeyDown={(e) => onMenuKeyDown(e, () => setMenu(null))}
        >
          <MenuItem
            onClick={() => {
              setRenaming(menu.path);
              setMenu(null);
            }}
          >
            {t('image.rename')}
          </MenuItem>
          {canWebp && <MenuItem onClick={() => convert(menu.path, 'webp')}>{t('image.toWebp')}</MenuItem>}
          {canJpg && <MenuItem onClick={() => convert(menu.path, 'jpg')}>{t('image.toJpg')}</MenuItem>}
        </div>
      )}
      {renaming && (
        <RenameDialog
          title={t('image.rename')}
          initialName={baseName}
          onClose={() => setRenaming(null)}
          onSubmit={async (typed) => {
            // Si se escribe la extensión (foo.webp), se ignora: cambiarla no convierte la imagen
            const clean = typed.replace(/\.(png|jpe?g|webp|bmp|gif|svg|avif|ico)$/i, '');
            const path = renamedPath(renaming, clean + extension);
            if (path !== renaming) await applyPathChange(renaming, path);
            setRenaming(null);
          }}
        />
      )}
    </>
  );
}
