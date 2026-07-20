/**
 * copyText — copy a string to the clipboard, with a fallback for NON-secure
 * (plain http) origins. `navigator.clipboard` is undefined on http (e.g. the
 * :9999 dev instance), so a click there would silently no-op and leave whatever
 * was previously on the clipboard (an image, say). The fallback uses a hidden
 * textarea + document.execCommand('copy'), which works on http.
 */
export function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise<void>((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('Copy failed'));
    } catch (e) {
      reject(e);
    }
  });
}
