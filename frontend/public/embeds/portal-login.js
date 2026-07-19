/*!
 * Colaberry Accelerator - Portal Login (embeddable loader)
 * ---------------------------------------------------------------------------
 * Drop a passwordless (magic-link) participant sign-in onto ANY website with a
 * single <script> tag. The widget renders into the host page's own DOM (no
 * iframe), so X-Frame-Options never applies, and it only makes one cross-origin
 * POST to {portal}/api/portal/request-link (CORS is open on the API).
 *
 * MINIMAL EMBED
 *   <div id="colaberry-portal-login"></div>
 *   <script src="https://enterprise.colaberry.ai/embeds/portal-login.js" defer></script>
 *
 * OPTIONS (data-* attributes on the <script> tag, all optional)
 *   data-portal   backend/portal origin        (default https://enterprise.colaberry.ai)
 *   data-heading  card title                    (default "Access the Accelerator Portal")
 *   data-subtext  helper line under the title
 *   data-mount    id of the container to render into (default "colaberry-portal-login";
 *                 if that element is absent, the widget is inserted after the script tag)
 *
 * BEHAVIOUR (mirrors the backend contract exactly)
 *   - Normal response is a generic "if an active enrollment exists, a link was
 *     sent" message (the API deliberately does not confirm whether the email
 *     is enrolled, to prevent enumeration).
 *   - When the enrollment exists but portal access is pending admin approval,
 *     the API returns { success:false, message } and that message is shown.
 *   - Authenticates EXISTING, portal-enabled enrollments only. Not a signup.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  // --- locate our own <script> tag (works for defer; falls back for async) ---
  var self = document.currentScript ||
    document.querySelector('script[src*="embeds/portal-login.js"]');
  var cfg = (self && self.dataset) || {};
  var win = (window.ColaberryPortalLogin || {});

  var PORTAL = String(cfg.portal || win.portal || 'https://enterprise.colaberry.ai').replace(/\/+$/, '');
  var HEADING = cfg.heading || win.heading || 'Access the Accelerator Portal';
  var SUBTEXT = cfg.subtext || win.subtext ||
    "Enter your enrollment email and we'll send you a secure sign-in link.";
  var MOUNT_ID = cfg.mount || win.mount || 'colaberry-portal-login';

  function init() {
    // --- resolve mount point (explicit container, else insert after script) ---
    var mount = document.getElementById(MOUNT_ID);
    if (!mount && self && self.parentNode) {
      mount = document.createElement('div');
      mount.id = MOUNT_ID;
      self.parentNode.insertBefore(mount, self.nextSibling);
    }
    if (!mount || mount.getAttribute('data-cbp-ready') === '1') return;
    mount.setAttribute('data-cbp-ready', '1');

    injectStyles();

    mount.innerHTML =
      '<form class="cbp-card" novalidate>' +
        '<p class="cbp-brand">Colaberry Accelerator</p>' +
        '<h2 class="cbp-h"></h2>' +
        '<p class="cbp-sub"></p>' +
        '<label class="cbp-label" for="cbp-email">Enrollment email</label>' +
        '<input class="cbp-input" id="cbp-email" type="email" autocomplete="email" ' +
          'placeholder="you@company.com" required>' +
        '<button class="cbp-btn" type="submit">Send my sign-in link</button>' +
        '<div class="cbp-msg" role="status" aria-live="polite"></div>' +
      '</form>';

    mount.querySelector('.cbp-h').textContent = HEADING;
    mount.querySelector('.cbp-sub').textContent = SUBTEXT;

    var form = mount.querySelector('form');
    var input = mount.querySelector('#cbp-email');
    var btn = mount.querySelector('.cbp-btn');
    var msg = mount.querySelector('.cbp-msg');

    function show(kind, text) { msg.className = 'cbp-msg ' + kind; msg.textContent = text; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        show('err', 'Please enter a valid email address.');
        input.focus();
        return;
      }

      btn.disabled = true;
      var original = btn.textContent;
      btn.textContent = 'Sending...';

      // Failure-first: bound the outbound call so the UI never hangs.
      var controller = ('AbortController' in window) ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;

      fetch(PORTAL + '/api/portal/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
        signal: controller ? controller.signal : undefined
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (data) {
          // success:false => enrollment exists but portal access pending approval
          if (data && data.success === false) {
            show('warn', data.message ||
              'Your portal access is pending approval. Please contact your program administrator.');
          } else {
            show('ok', (data && data.message) ||
              "If an active enrollment exists for this email, a sign-in link is on its way. Check your inbox.");
            form.reset();
          }
        })
        .catch(function () {
          show('err', 'We could not reach the portal right now. Please try again in a moment.');
        })
        .then(function () {
          if (timer) clearTimeout(timer);
          btn.disabled = false;
          btn.textContent = original;
        });
    });
  }

  function injectStyles() {
    if (document.getElementById('cbp-style')) return;
    var css =
      '#' + MOUNT_ID + ' *{box-sizing:border-box}' +
      '.cbp-card{max-width:420px;margin:0 auto;padding:28px 26px;background:#fff;' +
        'border:1px solid #e2e8f0;border-radius:14px;color:#0f172a;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
        'box-shadow:0 1px 3px rgba(15,23,42,.06),0 10px 30px rgba(15,23,42,.06)}' +
      '.cbp-brand{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1e3a8a;margin:0 0 12px}' +
      '.cbp-h{font-size:19px;font-weight:700;letter-spacing:-.01em;margin:0 0 7px}' +
      '.cbp-sub{font-size:14px;line-height:1.55;color:#475569;margin:0 0 18px}' +
      '.cbp-label{display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:#334155;margin:0 0 6px}' +
      '.cbp-input{width:100%;padding:12px 14px;font-size:15px;color:#0f172a;border:1px solid #cbd5e1;' +
        'border-radius:9px;outline:none;transition:border-color .15s,box-shadow .15s}' +
      '.cbp-input:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15)}' +
      '.cbp-btn{width:100%;margin-top:15px;padding:13px 16px;font-size:15px;font-weight:600;color:#fff;' +
        'background:#1e3a8a;border:0;border-radius:9px;cursor:pointer;transition:background .15s}' +
      '.cbp-btn:hover{background:#1e40af}.cbp-btn:disabled{opacity:.6;cursor:not-allowed}' +
      '.cbp-msg{margin-top:15px;font-size:14px;line-height:1.55;padding:11px 13px;border-radius:9px;display:none}' +
      '.cbp-msg.ok{display:block;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}' +
      '.cbp-msg.warn{display:block;background:#fffbeb;color:#92400e;border:1px solid #fcd34d}' +
      '.cbp-msg.err{display:block;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}' +
      '@media (prefers-color-scheme:dark){' +
        '.cbp-card{background:#0f172a;border-color:#1e293b;box-shadow:0 10px 30px rgba(0,0,0,.4)}' +
        '.cbp-h{color:#f1f5f9}.cbp-sub{color:#94a3b8}.cbp-label{color:#cbd5e1}.cbp-brand{color:#93c5fd}' +
        '.cbp-input{background:#111c30;border-color:#334155;color:#f1f5f9}}';
    var style = document.createElement('style');
    style.id = 'cbp-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
