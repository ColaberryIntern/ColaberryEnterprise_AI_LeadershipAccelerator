/**
 * dashboardApp - the CLIENT code of the interactive report page, run in the browser.
 *
 * The page is server-rendered with the email's own formatting (renderDashboard.ts); this only:
 *   1. filters: clicking a person (sidebar, any name pill, a glance-table row) hides everything
 *      tagged data-e for anyone else - the combined timeline, the notes, the cards, the tour list -
 *      and hides a day or a group that ends up empty. State is in location.hash (#p=<enrollment>).
 *   2. runs the guided tour: steps through the report's 10 highlights, scrolling to and outlining
 *      each one with a panel saying what happened and why it matters (Back / Next / End, arrow keys,
 *      Esc).
 *   3. adds Copy buttons to every prompt and nudge (the prompts themselves scroll, via CSS).
 *
 * Serialized with Function.prototype.toString, so it is SELF-CONTAINED: no imports, no outer
 * variables. `document` and `window` are passed in; the backend has no DOM types, hence `any` on
 * the three parameters. It never writes HTML from data: only textContent and attribute toggles.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser globals and the embedded tour data, see header
export function dashboardApp(data: any, doc: any, win: any): void {
  const steps: any[] = (data && data.highlights) || [];
  const all = (sel: string): any[] => Array.prototype.slice.call(doc.querySelectorAll(sel));
  let person: string | null = null;
  let stepAt = -1;

  function nameOf(id: string): string {
    const b = doc.querySelector(`#side .person[data-person="${id}"]`);
    return b ? String(b.querySelector('span:not(.dot)').firstChild.textContent).trim() : id;
  }

  function apply(): void {
    for (const el of all('[data-e]')) el.hidden = !!person && el.getAttribute('data-e') !== person;
    // A day on the combined timeline, or a group of interns, disappears when nothing in it is left.
    for (const day of all('#combined .ct-day:not(.ct-today)')) day.hidden = !day.querySelector('.ct-line:not([hidden])');
    for (const g of all('.group')) {
      const left = g.querySelectorAll('.intern:not([hidden])').length;
      g.hidden = left === 0;
      const n = g.querySelector('.gn');
      if (n) n.textContent = String(left);
    }
    for (const el of all('[data-overall]')) el.hidden = !!person;
    for (const b of all('#side .person')) {
      const on = (b.getAttribute('data-person') || null) === person;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const f = doc.getElementById('filter');
    f.classList.toggle('on', !!person);
    doc.getElementById('filter-name').textContent = person ? nameOf(person) : '';
  }

  function setPerson(id: string | null, push = true): void {
    person = id && doc.querySelector(`[data-e="${id}"]`) ? id : null;
    if (push) {
      const hash = person ? `#p=${encodeURIComponent(person)}` : '#';
      if (win.history && win.history.pushState) win.history.pushState(null, '', hash); else win.location.hash = hash;
    }
    apply();
  }
  function fromHash(): void {
    const m = /p=([^&]+)/.exec(win.location.hash || '');
    setPerson(m ? decodeURIComponent(m[1]) : null, false);
  }

  // Filtering: any element carrying data-person, and a click anywhere on a glance-table row.
  doc.addEventListener('click', (ev: any) => {
    const t = ev.target;
    const p = t.closest && t.closest('[data-person]');
    if (p && !t.closest('a')) { setPerson(p.getAttribute('data-person') || null); win.scrollTo && win.scrollTo(0, 0); return; }
    const row = t.closest && t.closest('.glance tr[data-e]');
    if (row && !t.closest('a')) { setPerson(row.getAttribute('data-e')); win.scrollTo && win.scrollTo(0, 0); }
  });
  doc.getElementById('filter-clear').addEventListener('click', () => setPerson(null));
  doc.querySelector('#side .search').addEventListener('input', (ev: any) => {
    const q = String(ev.target.value || '').toLowerCase();
    for (const b of all('#side .person[data-name]')) b.hidden = !!q && !b.getAttribute('data-name').includes(q);
  });

  // Copy buttons on every prompt and nudge.
  function copy(text: string, btn: any): void {
    const done = (): void => { btn.textContent = 'Copied'; win.setTimeout(() => { btn.textContent = 'Copy'; }, 1400); };
    const fallback = (): void => {
      const ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('style', 'position:fixed;left:-9999px');
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy'); done(); } catch (e) { btn.textContent = 'Select and copy'; }
      ta.remove();
    };
    if (win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) win.navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  for (const el of all('[id^="asks-"] pre, [id^="asks-"] pre + div + div')) {
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'cp'; b.textContent = 'Copy';
    b.addEventListener('click', () => copy(String(el.textContent), b));
    el.parentNode.insertBefore(b, el);
  }

  // The guided tour.
  const panel = doc.getElementById('tour');
  function targetOf(s: any): any {
    const e = s.enrollment_id;
    const t = s.target || {};
    if (t.anchor === 'event' && t.event_key) { const ev = doc.querySelector(`[data-ev="${t.event_key}"]`); if (ev) return ev; }
    const id = t.anchor === 'card' || !t.anchor ? `card-${e}` : `${t.anchor}-${e}`;
    return doc.getElementById(id) || doc.getElementById(`card-${e}`);
  }
  function clearHl(): void { for (const el of all('.tour-hl')) el.classList.remove('tour-hl'); }
  function show(i: number): void {
    if (!steps.length) return;
    stepAt = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[stepAt];
    if (person) setPerson(null);
    clearHl();
    const el = targetOf(s);
    if (el) { el.classList.add('tour-hl'); if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    doc.getElementById('tour-step').textContent = `Highlight ${stepAt + 1} of ${steps.length}`;
    doc.getElementById('tour-title').textContent = s.title;
    doc.getElementById('tour-why').textContent = s.why;
    doc.getElementById('tour-who').textContent = s.intern;
    doc.getElementById('tour-prev').disabled = stepAt === 0;
    doc.getElementById('tour-next').textContent = stepAt === steps.length - 1 ? 'Finish' : 'Next';
    panel.classList.add('on');
  }
  function end(): void { clearHl(); panel.classList.remove('on'); stepAt = -1; }
  doc.getElementById('tour-start').addEventListener('click', () => show(0));
  doc.getElementById('tour-prev').addEventListener('click', () => show(stepAt - 1));
  doc.getElementById('tour-next').addEventListener('click', () => (stepAt >= steps.length - 1 ? end() : show(stepAt + 1)));
  doc.getElementById('tour-end').addEventListener('click', end);
  for (const b of all('.tour-jump')) b.addEventListener('click', () => show(Number(b.getAttribute('data-step'))));
  doc.addEventListener('keydown', (ev: any) => {
    if (stepAt < 0) return;
    if (ev.key === 'Escape') end();
    else if (ev.key === 'ArrowRight') show(stepAt + 1);
    else if (ev.key === 'ArrowLeft') show(stepAt - 1);
  });

  win.addEventListener('popstate', fromHash);
  win.addEventListener('hashchange', fromHash);
  fromHash();
}
