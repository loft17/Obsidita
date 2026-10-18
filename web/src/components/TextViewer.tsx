import { useState, useEffect } from 'react';
import { rawFileUrl } from '../attachments';
import { useT } from '../i18n';

// Por encima de este tamaño no se pinta: se ofrece la descarga
const MAX_SIZE = 2 * 1024 * 1024;

type State =
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'tooLarge' | 'binary' | 'error' };

// Visor de solo lectura para archivos de texto que no son notas (txt, json, canvas...).
// Nunca guarda: se lee del endpoint raw y no pasa por el contenido ni el autoguardado de las notas
export default function TextViewer({ filePath }: { filePath: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const t = useT();
  const url = rawFileUrl(filePath);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (Number(res.headers.get('Content-Length')) > MAX_SIZE) {
          controller.abort();
          return setState({ status: 'tooLarge' });
        }
        const text = await res.text();
        if (text.length > MAX_SIZE) return setState({ status: 'tooLarge' });
        // Un byte nulo delata un binario con extensión de texto
        if (text.includes('\0')) return setState({ status: 'binary' });
        setState({ status: 'ready', text });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    })();
    return () => controller.abort();
  }, [url]);

  const download = (
    <a href={url} download>
      {t('common.download')}
    </a>
  );

  if (state.status === 'loading') return <div className="image-viewer-message">{t('common.loading')}</div>;
  if (state.status !== 'ready') {
    return (
      <div className="unsupported-file">
        <div>{t(`textFile.${state.status}`)}</div>
        {download}
      </div>
    );
  }

  return (
    <div className="text-viewer">
      <div className="text-viewer-info">
        {t('textFile.readOnly')} · {download}
      </div>
      <pre className="text-viewer-content">{state.text}</pre>
    </div>
  );
}
