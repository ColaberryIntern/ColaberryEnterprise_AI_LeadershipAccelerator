/**
 * customDeck.ts — serve a hand-designed deck (KitConfig.customDeck) through the
 * same ▶ Present path as the generated Class Kit. The deck is authored HTML;
 * this injects the ONE thing it cannot know in advance: the session's live
 * connection (session-scoped kit token, live-state + broadcast endpoints, the
 * check-in URL and QR). No admin key, no separate service — the deck talks to
 * the platform's own endpoints exactly like the generated deck does.
 *
 * Pure and deterministic given its inputs, so it unit-tests without a DB.
 */

export interface CustomDeckLive {
  enabled: boolean;
  sessionId: string;
  liveStateUrl?: string;
  broadcastUrl?: string;
  token?: string;
  checkinUrl: string;
  qrSvg: string;
}

/** `</script>` inside a JSON string would end the injected block early, so
 * every `<` is escaped — still valid JSON, never valid markup. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Insert `window.__KITLIVE__ = {...}` before the deck's own scripts run: right
 * after `<head>` when there is one, else at the very top. The deck reads it on
 * load; with `enabled:false` (rehearse / download) it runs offline.
 */
export function injectCustomDeckLive(html: string, live: CustomDeckLive): string {
  const block = `<script>window.__KITLIVE__=${safeJson(live)};</script>`;
  const head = /<head[^>]*>/i.exec(html);
  if (!head) return block + html;
  const at = head.index + head[0].length;
  return html.slice(0, at) + block + html.slice(at);
}
