import type { UploadMetadata } from 'firebase/storage';

/**
 * Long-edge caps by role. Sources are scaled down to fit, never enlarged.
 * These track the largest box each image renders into on the public site
 * (doubled for high-DPR screens), so anything above them is invisible detail.
 */
export const MAX_EDGE = {
  /** Full-bleed page heroes. */
  hero: 2000,
  /** Grid cards, blog and project covers, product shots. */
  card: 1600,
  /** Logos and icons — small render boxes, but sharp edges want the headroom. */
  logo: 800,
} as const;

/**
 * Firebase Storage stamps every object `private, max-age=0` by default, which
 * forces a re-download on each page view and forbids CDN caching outright.
 * Upload paths are timestamp-prefixed and never rewritten in place, so the bytes
 * behind a given URL are immutable and safe to cache indefinitely.
 */
export const UPLOAD_METADATA: UploadMetadata = {
  cacheControl: 'public, max-age=31536000, immutable',
};

/**
 * Raster formats the canvas encoder can re-encode without losing something.
 * Deliberately excludes SVG (vector — rasterising destroys it) and GIF (may be
 * animated; canvas would flatten it to a single frame).
 */
const RESIZABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Downscale to `maxEdge` and re-encode as WebP, in the browser, before upload.
 *
 * Anything that isn't a safely re-encodable raster image — PDFs, Office docs,
 * SVGs, GIFs — is returned untouched, so this is safe to call on any upload.
 * Falls back to the original file if decoding or encoding fails for any reason;
 * a failed optimisation must never block the upload itself.
 */
export async function prepareImage(
  file: File,
  maxEdge: number,
  quality = 0.82,
): Promise<File> {
  if (!RESIZABLE.has(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    // `from-image` applies EXIF orientation, so photos straight off a phone
    // don't arrive rotated once the metadata is dropped by re-encoding.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob) return file;

    // If we didn't need to shrink the pixels and WebP came out no smaller,
    // the original is already at least as good — keep it.
    if (scale === 1 && blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } finally {
    bitmap.close();
  }
}
