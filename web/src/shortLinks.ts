// Enlaces cortos privados: crear desde los menús y abrir /<código> al entrar
import { linksApi } from './api';
import { useStore } from './store';
import { notify } from './toast';
import { t } from './i18n';
import { copyText } from './clipboard';
import { fileName } from './paths';
import { isMobile } from './mobile';

export const shortLinkUrl = (code: string) => `${window.location.origin}/${code}`;

// Crea un enlace aleatorio para la nota o carpeta y lo copia al portapapeles
export async function createShortLink(path: string) {
  try {
    const { link } = await linksApi.create(path);
    const url = shortLinkUrl(link.code);
    await copyText(url).catch(() => {});
    notify('shortlink', t('shortlink.created', { url }));
  } catch (err) {
    notify('shortlink', t('shortlink.error', { error: (err as Error).message }), 'error');
  }
}

// La redirección de /<código> llega como /?go=<código>. Se procesa una vez, cuando la sesión ya está
// abierta (la app está montada), y se quita el parámetro de la barra de direcciones
export async function openShortLinkFromUrl() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('go');
  if (!code) return;
  url.searchParams.delete('go');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  try {
    const { path } = await linksApi.resolve(code);
    const { tree, openFile, revealFile, revealFolder } = useStore.getState();
    const item = tree.find((i) => i.path === path);
    if (!item) {
      notify('shortlink', t('shortlink.broken', { path }), 'error');
      return;
    }
    if (item.type === 'folder') revealFolder(path);
    else {
      openFile(path, fileName(path));
      revealFile(path);
    }
    if (isMobile()) useStore.setState({ sidebarOpen: false });
  } catch {
    notify('shortlink', t('shortlink.notFound'), 'error');
  }
}
