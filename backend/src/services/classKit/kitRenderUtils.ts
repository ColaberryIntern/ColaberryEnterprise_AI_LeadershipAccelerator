/**
 * kitRenderUtils.ts — tiny render helpers shared across the Class Kit deck's
 * slide renderers (kitHtml.ts, kitBuildBay.ts, kitTheater.ts, kitStoryVisuals.ts).
 * Split out so those files can share `promptHtml`/`esc` without importing each
 * other (CLAUDE.md: no circular dependencies — this is the missing third module).
 */

export function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

export function attr(s: unknown): string {
  return esc(s);
}

/** Copy-ready terminal-styled prompt box, reused by the plain 'prompt' slide
 * kind and by Build Bay (which wraps it with paste-target/mode/result/stop/rescue). */
export function promptHtml(label: string, prompt: string): string {
  return (
    '<div class="kprompt">' +
    '<div class="kprompt-bar"><span class="dots"><i></i><i></i><i></i></span>' +
    `<span>${esc(label)}</span><button class="kcopy" type="button">Copy prompt</button></div>` +
    `<pre data-raw="${attr(prompt)}">${esc(prompt)}</pre>` +
    '</div>'
  );
}
