/*
 * Colaberry template controls — shared across all templates.
 * Per-element hover controls: hover any artboard (an element tagged [data-export]
 * or [data-card]) and a small floating control group appears for THAT element:
 *   • Download — rasterizes just that element to a full-res PNG (html-to-image).
 *   • Edit     — copies an element-specific, ready-to-paste prompt to the clipboard
 *                so the user can open a NEW chat and modify exactly that element.
 *
 * Sizing/naming per element:
 *   [data-export]  → name = attr value, width = [data-export-w], square = [data-export-square]
 *   [data-card]    → child [data-art] is the artboard; name = [data-name], width = [data-w], square
 */
(() => {
  if (window.__cbToolbarLoaded) return;
  window.__cbToolbarLoaded = true;

  const H2I_SRC = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
  let h2iPromise = null;
  function loadH2I() {
    if (window.htmlToImage) return Promise.resolve();
    if (h2iPromise) return h2iPromise;
    h2iPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = H2I_SRC;
      s.onload = resolve;
      s.onerror = () => reject(new Error('html-to-image failed to load'));
      document.head.appendChild(s);
    });
    return h2iPromise;
  }

  // ---- template identity (for the edit prompt) ----
  const m = location.pathname.match(/templates\/([^/]+)\//);
  const slug = m ? m[1] : '';
  const titleCase = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  const templateLabel = slug ? titleCase(slug) : 'this template';

  function elementInfo(el) {
    // returns { art, name, label, w, square }
    if (el.hasAttribute('data-card')) {
      const art = el.querySelector('[data-art]') || el;
      const name = el.getAttribute('data-name') || 'colaberry';
      return { art, name, label: titleCase(name.replace(/^colaberry-?/, '')) || 'this element',
        w: parseInt(el.getAttribute('data-w') || art.offsetWidth, 10), square: true };
    }
    const name = el.getAttribute('data-export') || 'colaberry';
    return { art: el, name, label: titleCase(name.replace(/^colaberry-?/, '')) || 'this element',
      w: parseInt(el.getAttribute('data-export-w') || el.offsetWidth, 10),
      square: el.hasAttribute('data-export-square') };
  }

  function editPromptFor(info) {
    return (
      `Using the Colaberry design system, open the "${templateLabel}" template (templates/${slug}) ` +
      `and help me edit just the "${info.label}" element.\n\n` +
      `What I'd like to change:\n- [describe your edits here]\n\n` +
      `Keep everything on-brand, and let me download the updated element as a PNG when we're done.`
    );
  }

  // ---- styles ----
  const css = document.createElement('style');
  css.textContent = `
    .cb-ctl { position: fixed; z-index: 2147483000; display: none; gap: 6px; align-items: center;
      background: rgba(255,255,255,.95); backdrop-filter: blur(8px);
      border: 1px solid #E4E4E3; border-radius: 999px; padding: 5px 6px;
      box-shadow: 0 6px 16px rgba(26,26,26,.16), 0 2px 5px rgba(26,26,26,.08);
      font-family: 'Roboto', system-ui, sans-serif; }
    .cb-ctl--on { display: flex; }
    .cb-ctl__btn { display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
      border: 0; border-radius: 999px; padding: 7px 12px; font-size: 12px; font-weight: 700;
      letter-spacing: .01em; transition: background .14s, transform .12s; white-space: nowrap; }
    .cb-ctl__btn svg { width: 14px; height: 14px; }
    .cb-ctl__dl { background: #FB2832; color: #fff; }
    .cb-ctl__dl:hover { background: #E5121D; }
    .cb-ctl__ed { background: #F1F1F0; color: #2B2B2B; }
    .cb-ctl__ed:hover { background: #E4E4E3; }
    .cb-ctl__btn:active { transform: translateY(1px); }
    .cb-ctl__btn[disabled] { opacity: .55; pointer-events: none; }
    .cb-toast { position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%) translateY(12px);
      background: #1A1A1A; color: #fff; font-family: 'Roboto', system-ui, sans-serif;
      font-size: 14px; font-weight: 500; padding: 12px 18px; border-radius: 12px;
      box-shadow: 0 12px 30px rgba(0,0,0,.25); z-index: 2147483001; max-width: 380px;
      opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; text-align: center; }
    .cb-toast--on { opacity: 1; transform: translateX(-50%) translateY(0); }
    @media print { .cb-ctl, .cb-toast { display: none !important; } }`;
  document.head.appendChild(css);

  const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>';
  const ICON_ED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';

  const ctl = document.createElement('div');
  ctl.className = 'cb-ctl';
  ctl.innerHTML =
    `<button class="cb-ctl__btn cb-ctl__dl" type="button">${ICON_DL}<span class="cb-ctl__dl-lbl">Download</span></button>` +
    `<button class="cb-ctl__btn cb-ctl__ed" type="button">${ICON_ED}Edit</button>`;

  const toast = document.createElement('div');
  toast.className = 'cb-toast';
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('cb-toast--on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('cb-toast--on'), 3600);
  }

  let current = null;
  let hideTimer = null;
  const dlBtn = ctl.querySelector('.cb-ctl__dl');
  const dlLbl = ctl.querySelector('.cb-ctl__dl-lbl');
  const edBtn = ctl.querySelector('.cb-ctl__ed');

  function position() {
    if (!current) return;
    const r = current.getBoundingClientRect();
    const cw = ctl.offsetWidth || 180;
    let left = r.right - 10;
    left = Math.min(left, window.innerWidth - 10);
    left = Math.max(left, cw + 10);
    let top = r.top + 10;
    top = Math.max(top, 10);
    top = Math.min(top, window.innerHeight - 48);
    ctl.style.left = left + 'px';
    ctl.style.top = top + 'px';
    ctl.style.transform = 'translateX(-100%)';
  }

  function showFor(el) {
    current = el;
    ctl.classList.add('cb-ctl--on');
    position();
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { ctl.classList.remove('cb-ctl--on'); current = null; }, 280);
  }

  document.addEventListener('mouseover', (e) => {
    if (ctl.contains(e.target)) { clearTimeout(hideTimer); return; }
    const el = e.target.closest('[data-export],[data-card]');
    if (el) { clearTimeout(hideTimer); if (el !== current) showFor(el); }
    else { scheduleHide(); }
  });
  ctl.addEventListener('mouseleave', scheduleHide);
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);

  dlBtn.addEventListener('click', async () => {
    if (!current) return;
    const info = elementInfo(current);
    dlBtn.disabled = true;
    const orig = dlLbl.textContent;
    dlLbl.textContent = 'Saving…';
    ctl.style.visibility = 'hidden';
    try {
      await loadH2I();
      const ratio = info.w / info.art.offsetWidth;
      const opts = { pixelRatio: ratio, cacheBust: true, style: { boxShadow: 'none' } };
      if (info.square) opts.style.borderRadius = '0';
      const url = await window.htmlToImage.toPng(info.art, opts);
      const a = document.createElement('a');
      a.href = url; a.download = info.name + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      ctl.style.visibility = '';
      dlLbl.textContent = 'Saved ✓';
      showToast('Downloaded “' + info.label + '”.');
    } catch (err) {
      console.error(err);
      ctl.style.visibility = '';
      dlLbl.textContent = 'Retry';
      showToast('Download failed — please try again.');
    } finally {
      setTimeout(() => { dlLbl.textContent = orig; dlBtn.disabled = false; }, 1400);
    }
  });

  edBtn.addEventListener('click', async () => {
    if (!current) return;
    const info = elementInfo(current);
    const prompt = editPromptFor(info);
    try {
      await navigator.clipboard.writeText(prompt);
      showToast('Edit prompt for “' + info.label + '” copied — open a new chat and paste it.');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = prompt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast('Edit prompt for “' + info.label + '” copied — open a new chat and paste it.'); }
      catch (_) { showToast('Could not copy — the prompt is in the console.'); console.log(prompt); }
      ta.remove();
    }
  });

  function mount() {
    if (!document.body) { setTimeout(mount, 50); return; }
    document.body.appendChild(ctl);
    document.body.appendChild(toast);
    // one-time discoverability hint
    setTimeout(() => {
      if (document.querySelector('[data-export],[data-card]')) {
        showToast('Tip: hover any element for Download & Edit options.');
      }
    }, 900);
  }
  mount();
})();
