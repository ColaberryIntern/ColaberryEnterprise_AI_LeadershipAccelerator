/*
 * Colaberry landing-page "Welcome back" bar (C105).
 *
 * Loaded by every hosted landing page as:  <script src="/v1/welcome-back.js" defer></script>
 *
 * WHY. Measured in C97: 32 of the 33 return visits that never reached the portal were people who had already signed up,
 * clicked the ad again, and landed on this page as strangers. Their portal session is in this same browser (same
 * origin), so the page can see it and offer the way back instead of the signup pitch.
 *
 * WHAT IT READS, AND WHAT IT NEVER DOES. It reads the portal's own session token from localStorage only to read its
 * expiry (`exp`). It never sends the token anywhere, never calls an API, and writes only with textContent. An admin's
 * read-only "view as" token lives in sessionStorage and is never read here.
 *
 * NO LIVE SESSION, NO BAR. No token, a malformed token, a token without `exp`, or one that has expired (or expires in
 * the next minute): nothing is shown and the page is exactly as before.
 *
 * WHY A FILE AND NOT INLINE. The landing-page CSP is `script-src 'self'` with no inline script; a same-origin file is
 * the only way in that does not weaken it (the same reason as snackbar.js).
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'participant_token';
  var DISMISS_KEY = 'cb.welcomeback.dismissed';
  var SKEW_MS = 60 * 1000;
  var TODAY = '/portal/today';

  function liveToken() {
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { return false; }
    if (!token) return false;
    var part = token.split('.')[1];
    if (!part) return false;
    try {
      var claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (!claims || typeof claims.exp !== 'number' || claims.read_only === true) return false;
      return claims.exp * 1000 > Date.now() + SKEW_MS;
    } catch (e) {
      return false;
    }
  }

  function dismissed() {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function show() {
    if (document.getElementById('cb-welcome-back')) return;
    var bar = document.createElement('div');
    bar.id = 'cb-welcome-back';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Welcome back');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;'
      + 'padding:12px 52px 12px 16px;background:#1a365d;color:#fff;font:600 15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;'
      + 'position:relative;z-index:50;text-align:center';

    var text = document.createElement('span');
    text.textContent = "Welcome back. You're already signed in.";

    var go = document.createElement('a');
    go.href = TODAY;
    go.textContent = 'Go to your campus →';
    go.setAttribute('data-cta', 'welcome-back');
    go.style.cssText = 'display:inline-block;padding:9px 16px;border-radius:8px;background:#fff;color:#1a365d;'
      + 'text-decoration:none;font-weight:700;min-height:44px;box-sizing:border-box;line-height:26px';

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.style.cssText = 'position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;'
      + 'border:0;background:transparent;color:#fff;font-size:22px;cursor:pointer';
    close.addEventListener('click', function () {
      try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* private mode: dismiss for this view only */ }
      if (bar.parentNode) bar.parentNode.removeChild(bar);
    });

    bar.appendChild(text);
    bar.appendChild(go);
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (!liveToken() || dismissed()) return;
  if (document.body) show();
  else document.addEventListener('DOMContentLoaded', show);
})();
