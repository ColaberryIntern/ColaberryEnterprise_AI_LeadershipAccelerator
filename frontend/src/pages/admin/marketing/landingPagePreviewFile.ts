/**
 * landingPagePreviewFile - seeing the page at full size, and keeping a copy.
 *
 * WHY. Ali, 2026-10-08: "i should be able to full screen / download the Landing page so I can
 * really see what it will look like." The preview is a 32rem iframe inside an admin column, which
 * is the wrong shape to judge a page by - a hero sized for a laptop is squeezed into a third of
 * one, and the long body is read through a letterbox.
 *
 * The HTML is ALREADY IN THE BROWSER. `previewLandingPage()` fetched it as text, because a Bearer
 * token is attached by an axios interceptor and would not be attached to an iframe navigation or
 * to a new tab opened at that URL. So full screen cannot be "open the preview endpoint in a tab" -
 * that would 401. It is the string we hold, served to a tab as a blob.
 *
 * That also makes download free: the same blob, with a filename.
 */

/**
 * What to call the file.
 *
 * Prefers the slug, because that is what the page will actually be addressed by and therefore how
 * an operator will recognise the file later. Falls back through the name to a constant - a
 * download named `.html` with no stem is a worse outcome than a generic one.
 */
export function previewFileName(name: string, slug?: string | null): string {
  const stem = (slug ?? '').trim() || slugify(name) || 'landing-page';
  return `${stem}.html`;
}

/** The same shape of slug the rest of this screen suggests, kept local so this module is pure. */
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/**
 * How long to keep a blob URL alive before releasing it.
 *
 * Revoking immediately is the obvious bug here: the new tab has not finished loading from the URL
 * when the call returns, and revoking pulls the document out from under it. A download is quicker
 * but has the same race. These are long enough to be safe and short enough that a long admin
 * session does not accumulate blobs.
 */
export const OPEN_REVOKE_MS = 60_000;
export const DOWNLOAD_REVOKE_MS = 10_000;
