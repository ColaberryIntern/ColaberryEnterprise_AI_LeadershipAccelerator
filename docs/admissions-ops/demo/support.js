/* Tiny stand-alone runtime for the Ops Command Center demo.
   It renders the page templates (holes, loops, conditions, click handlers) with no build step and no server.
   Demo only. The real screens are React components in the Enterprise app. */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch;
      this.state = Object.assign({}, this.state, next);
      if (this.__render) this.__render();
    }
    forceUpdate() { if (this.__render) this.__render(); }
  }
  window.DCLogic = DCLogic;
  const WHOLE = /^\s*\{\{([^}]+)\}\}\s*$/;
  const ANY = /\{\{([^}]+)\}\}/g;
  function get(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    let v = scope;
    for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function fill(s, scope) { return s.replace(ANY, (m, p) => { const v = get(scope, p); return v == null ? '' : String(v); }); }
  function bare(s) { return s.replace(/[{}]/g, ''); }
  function render(src, scope, out) {
    src.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { out.appendChild(document.createTextNode(fill(ch.nodeValue, scope))); return; }
      if (ch.nodeType !== 1) return;
      const tag = ch.tagName.toLowerCase();
      if (tag === 'helmet') return;
      if (tag === 'sc-for') {
        const list = get(scope, bare(ch.getAttribute('list'))) || [];
        const as = ch.getAttribute('as');
        list.forEach((item, i) => { const s = Object.create(scope); s[as] = item; s.$index = i; render(ch, s, out); });
        return;
      }
      if (tag === 'sc-if') { if (get(scope, bare(ch.getAttribute('value')))) render(ch, scope, out); return; }
      const el = ch.cloneNode(false);
      Array.from(ch.attributes).forEach((at) => {
        const whole = WHOLE.exec(at.value);
        if (/^on/.test(at.name) && whole) {
          el.removeAttribute(at.name);
          const fn = get(scope, whole[1]);
          const evt = at.name.slice(2) === 'change' ? 'input' : at.name.slice(2);
          if (typeof fn === 'function') el.addEventListener(evt, fn);
        } else if (whole) {
          const v = get(scope, whole[1]);
          el.setAttribute(at.name, v == null ? '' : String(v));
          if (at.name === 'value') el.value = v == null ? '' : String(v);
        } else if (at.value.indexOf('{{') >= 0) {
          el.setAttribute(at.name, fill(at.value, scope));
        }
      });
      render(ch, scope, el);
      out.appendChild(el);
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    const host = document.querySelector('x-dc');
    const code = document.querySelector('script[data-dc-script]');
    if (!host || !code) return;
    host.style.display = 'block';
    const helmet = host.querySelector('helmet');
    if (helmet) { Array.from(helmet.children).forEach((n) => document.head.appendChild(n)); helmet.remove(); }
    const tpl = document.createElement('div');
    while (host.firstChild) tpl.appendChild(host.firstChild);
    const Component = new Function('DCLogic', code.textContent + '\nreturn Component;')(DCLogic);
    const logic = new Component({});
    logic.__render = function () {
      const a = document.activeElement;
      const id = a && a.id, pos = a && a.selectionStart;
      const frag = document.createDocumentFragment();
      render(tpl, logic.renderVals(), frag);
      host.replaceChildren(frag);
      if (id) { const el = document.getElementById(id); if (el && el.focus) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
    };
    logic.__render();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  });
})();
