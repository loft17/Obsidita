import { rawFileUrl } from '../attachments';
import { fileName } from '../paths';

// Visor de PDF: el integrado del navegador, sin dependencias (se activa en Ajustes)
export default function PdfViewer({ filePath }: { filePath: string }) {
  return <iframe className="pdf-viewer" src={rawFileUrl(filePath)} title={fileName(filePath)} />;
}
