// Compresión de imágenes para las fotos de recepción de pedidos/traspasos.
// La cámara del móvil produce JPEG de varios MB; los redimensionamos al lado
// máximo y recomprimimos a JPEG para que el data-URL quede pequeño (~100-350 KB),
// bien por debajo del tope del endpoint de adjuntos y del límite de body de Axum.

const MAX_DIM = 1280;
const QUALITY = 0.72;

/** Lee un `File` de imagen y devuelve un data-URL JPEG comprimido y redimensionado. */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const source = await loadImage(file);
  const { width, height } = fitWithin(source.width, source.height, MAX_DIM);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la imagen.');
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
  return canvas.toDataURL('image/jpeg', QUALITY);
}

// Prefiere createImageBitmap (respeta la orientación EXIF del móvil); cae a <img>.
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // navegadores sin la opción → fallback a HTMLImageElement
    }
  }
  return loadImgElement(file);
}

function loadImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen.'));
    };
    img.src = url;
  });
}

function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}
