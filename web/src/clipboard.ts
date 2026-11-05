// Copiar texto al portapapeles. La API del portapapeles solo existe en contextos seguros (HTTPS o
// localhost): por HTTP se recurre a un <textarea> temporal y execCommand
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
