/**
 * A pasted screenshot as a small JPEG data URL. The whole request must fit nginx's 1 MB cap, so the picture is scaled to
 * 1600 px wide at most and re-encoded smaller until it fits; null when it cannot be read or never fits.
 */
export const MAX_SHOT_CHARS = 800_000;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TRIES: ReadonlyArray<{ width: number; quality: number }> = [
  { width: 1600, quality: 0.8 }, { width: 1280, quality: 0.7 }, { width: 1000, quality: 0.6 }, { width: 800, quality: 0.5 },
];

export function fitSize(w: number, h: number, maxWidth: number): { w: number; h: number } {
  const k = Math.min(1, maxWidth / Math.max(w, 1), 4000 / Math.max(h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error('unreadable image'));
    img.src = url;
  });
}

export async function shrinkImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_FILE_BYTES) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    for (const t of TRIES) {
      const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, t.width);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL('image/jpeg', t.quality);
      if (out.length <= MAX_SHOT_CHARS) return out;
    }
    return null;
  } catch {
    // Unreadable picture: the caller tells the student; nothing else depends on it.
    return null;
  } finally { URL.revokeObjectURL(url); }
}
