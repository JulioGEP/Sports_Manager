/**
 * Reduce una foto en el navegador antes de subirla (Bloque 12): el lado mayor a `maxSide`
 * píxeles y JPEG. Así una foto de móvil de varios MB pesa decenas de KB y la API no tiene que
 * procesar imágenes. Si algo falla, devuelve el fichero original y la API decide.
 */
export async function shrinkImage(file: File, maxSide: number, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= maxBytes) {
      bitmap.close();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
