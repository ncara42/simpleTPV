// Documento fiscal imprimible/descargable de la venta (#123) en el lado cliente.
//
// La FUENTE DE VERDAD es el servidor (`apps/api/src/sales/sales-receipt.ts`,
// GET /sales/:id/receipt): el TPV descarga ese HTML tal cual y aquí solo se
// imprime o se descarga. (El antiguo renderer cliente `renderReceiptHtml` era un
// mirror para el modo demo, retirado con el decomiso del modo demo.)

/**
 * Imprime el documento HTML en un iframe oculto (no toca el DOM/CSS del TPV).
 * Usa `srcdoc` (no el `document.write` deprecado): el navegador carga el HTML en
 * su propio documento y dispara `onload`, momento en que se lanza la impresión.
 * El iframe se autodestruye tras imprimir. La llamada a `print` se omite con
 * seguridad si no existe (jsdom / navegadores sin diálogo).
 */
export function printReceiptHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.onload = () => {
    const win = iframe.contentWindow;
    win?.focus?.();
    win?.print?.();
    // Margen para que el navegador capture el contenido antes de retirar el iframe.
    window.setTimeout(() => iframe.remove(), 1000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

/** Descarga el documento HTML como fichero .html. */
export function downloadReceiptHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
