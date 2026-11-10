/**
 * textEncoding - undo UTF-8 text that was decoded as Latin-1 ("mojibake").
 *
 * The point of damage (found 10 Nov 2026): multer 2 / busboy decode a multipart upload's filename
 * as Latin-1 by default. A browser sends the filename as UTF-8, so every non-ASCII character is
 * stored as its UTF-8 BYTES, one Latin-1 character each. An em-dash (UTF-8 e2 80 94) became
 * "â\u0080\u0094", shown as "â€”"; a file re-uploaded through the same path was damaged a
 * second time ("Ã¢â¬â"). Measured on prod: "Build Day Lab â Your First AI Workflow.pdf"
 * (bytes c3 a2 c2 80 c2 94 where e2 80 94 belongs), in both the filename and the title built
 * from it.
 *
 * The repair is the exact inverse - take the string's code points as bytes and decode them as
 * UTF-8 - and it is applied ONLY when that round trip is clean, so genuine Latin-1 text such as
 * "café" (whose bytes are not valid UTF-8) is never touched.
 */

const MAX_PASSES = 3;

/** One inverse step, or null when `s` is not mojibake (not all <= U+00FF, no high bytes, or invalid UTF-8). */
function undoOnce(s: string): string | null {
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return null;
  const decoded = Buffer.from(s, 'latin1').toString('utf8');
  // U+FFFD = the bytes were not valid UTF-8, so this was real Latin-1 text, not damage.
  if (decoded.includes('�') || decoded === s) return null;
  return decoded;
}

/** Repair text that was decoded as Latin-1 one or more times; anything else is returned unchanged. */
export function repairMojibake(s: string): string;
export function repairMojibake(s: string | null | undefined): string | null | undefined;
export function repairMojibake(s: string | null | undefined): string | null | undefined {
  if (typeof s !== 'string' || !s) return s;
  const whole = undoPasses(s);
  if (whole !== s) return whole;
  // A title can mix clean text (an em-dash we wrote) with a damaged filename, so the whole string
  // is not all <= U+00FF. Repair each run of Latin-1-range characters on its own.
  return s.replace(/[\u0000-ÿ]+/g, undoPasses);
}

/** Up to MAX_PASSES inverse steps; stops at the first step that is not a clean round trip. */
function undoPasses(s: string): string {
  let out = s;
  for (let i = 0; i < MAX_PASSES; i += 1) {
    const next = undoOnce(out);
    if (next === null) break;
    out = next;
  }
  return out;
}

/** The filename a browser actually sent, from multer's Latin-1 `originalname`. */
export function decodeUploadFilename(originalname: string | undefined | null): string | undefined {
  if (!originalname) return originalname ?? undefined;
  return repairMojibake(originalname);
}
