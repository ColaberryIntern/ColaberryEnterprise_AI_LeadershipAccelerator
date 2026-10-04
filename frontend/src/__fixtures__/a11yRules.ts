/**
 * a11yRules — the mechanical accessibility rules, checked on a rendered container.
 *
 * Every rule here is one a machine can decide. Nothing in this file judges whether
 * a label is a GOOD label; it only catches the controls with no accessible name at
 * all, the tables whose columns are unannounced, and the status that exists only as
 * a colour. Those are the defects that make a page unusable with a screen reader or
 * with colour-blindness, and they are also the ones that creep back in silently
 * because the page still looks right.
 *
 * ── WHY THIS IS HAND-ROLLED AND NOT axe ─────────────────────────────────────
 *
 * There is no `@testing-library` or `jest-axe` in this repo - component tests use
 * `createRoot` + `act` + a raw container, and CLAUDE.md forbids a drive-by
 * dependency add. So these rules read the DOM the tests already have. That is a
 * smaller net than axe casts, and it is stated here rather than implied: a pass
 * means "none of these seven defects", not "accessible".
 *
 * ── WHY THIS LIVES IN `__fixtures__` AND NOT `__tests__` ────────────────────
 *
 * The plan put it at `src/__tests__/a11yRules.ts`. That does not work here, and
 * it fails in a way worth recording: CRA's default `testMatch` claims EVERY file
 * under a `__tests__` directory, whatever its name, so a helper there is loaded
 * as a suite and fails with "Your test suite must contain at least one test".
 * Measured before moving it - `1 failed, 0 total`. `__fixtures__` is this repo's
 * existing home for shared test material (`components/caseStudy/__fixtures__`)
 * and `testMatch` does not claim it.
 *
 * ── EVERY RULE NAMES THE OFFENDER ───────────────────────────────────────────
 *
 * A failure returns the element's tag and text, never a count. "3 violations" sends
 * the next reader hunting; `button at index 2 has no accessible name` does not.
 */

/** One failure, phrased so the message alone is actionable. */
export interface A11yViolation {
  rule: string;
  detail: string;
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The accessible name of a control, by the three routes that actually apply here. */
function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const owner = el.ownerDocument?.getElementById(labelledBy);
    if (owner && text(owner)) return text(owner);
  }
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  // Decorative icons are aria-hidden, so their text must not count toward a name.
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return text(clone);
}

/** A form control's name, including the `<label for>` that is the common case here. */
function controlName(el: Element): string {
  const direct = accessibleName(el);
  if (direct) return direct;
  const id = el.getAttribute('id');
  if (id) {
    const label = el.ownerDocument?.querySelector(`label[for="${id}"]`);
    if (label && text(label)) return text(label);
  }
  // An input wrapped in its label needs no `for`.
  const wrapping = el.closest('label');
  if (wrapping && text(wrapping)) return text(wrapping);
  const placeholder = el.getAttribute('placeholder');
  return placeholder?.trim() ? placeholder.trim() : '';
}

/**
 * Check the seven rules. Returns every violation, named.
 *
 * `root` is the container a test rendered into. A page is passed its own container;
 * a component is passed its own, so the same rules apply at both levels.
 */
export function a11yViolations(root: HTMLElement, opts: { expectH1?: boolean } = {}): A11yViolation[] {
  const v: A11yViolation[] = [];
  const push = (rule: string, detail: string) => v.push({ rule, detail });

  // 1. Exactly one h1 — but only where the fragment under test is a whole page.
  //    A tab or a card legitimately has none, so this is opt-in rather than
  //    asserted everywhere and then disabled with a comment.
  if (opts.expectH1) {
    const h1s = root.querySelectorAll('h1');
    if (h1s.length !== 1) push('one-h1', `expected exactly one <h1>, found ${h1s.length}`);
  }

  // 2. Heading order never skips a level going down.
  const levels = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
    level: Number(h.tagName[1]),
    label: text(h).slice(0, 60),
  }));
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i].level > levels[i - 1].level + 1) {
      push('heading-order', `h${levels[i - 1].level} is followed by h${levels[i].level} ("${levels[i].label}")`);
    }
  }

  // 3. Every image has an alt attribute. An EMPTY alt is correct for decoration;
  //    a MISSING one leaves a screen reader reading the filename.
  root.querySelectorAll('img').forEach((img, i) => {
    if (!img.hasAttribute('alt')) push('img-alt', `<img> at index ${i} has no alt attribute (src="${img.getAttribute('src') ?? ''}")`);
  });

  // 4. Every button and link has an accessible name. This is the rule that catches
  //    an icon-only control, which looks obvious on screen and is silent to a
  //    screen reader.
  root.querySelectorAll('button').forEach((b, i) => {
    if (!accessibleName(b)) push('control-name', `<button> at index ${i} has no accessible name`);
  });
  root.querySelectorAll('a[href]').forEach((a, i) => {
    if (!accessibleName(a)) push('control-name', `<a href="${a.getAttribute('href')}"> at index ${i} has no accessible name`);
  });

  // 5. Every table announces its columns with <th>, and every <th> has a scope.
  //    A table of unlabelled <td> is a wall of values with no way to know what
  //    any of them mean.
  root.querySelectorAll('table').forEach((t, i) => {
    if (t.querySelectorAll('th').length === 0) push('table-headers', `<table> at index ${i} has no <th>`);
    t.querySelectorAll('th').forEach((th) => {
      if (!th.getAttribute('scope')) push('table-headers', `a <th> ("${text(th).slice(0, 40)}") has no scope`);
    });
  });

  // 6. Every form control is labelled.
  root.querySelectorAll('input,select,textarea').forEach((el, i) => {
    const type = el.getAttribute('type');
    if (type === 'hidden') return;
    if (!controlName(el)) push('control-label', `<${el.tagName.toLowerCase()}> at index ${i} has no label`);
  });

  // 7. Status is never carried by colour alone. An element whose only signal is a
  //    `color:`/`background` style and which contains no text is invisible to
  //    anyone who cannot see the hue — about 1 in 12 men.
  root.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style') ?? '';
    const colourOnly = /(^|;)\s*(color|background(-color)?)\s*:/.test(style);
    if (colourOnly && !text(el) && !el.getAttribute('aria-label') && !el.querySelector('img,svg,i')) {
      push('colour-only-status', `<${el.tagName.toLowerCase()}> conveys state with colour and no text ("${style.slice(0, 40)}")`);
    }
  });

  return v;
}

/**
 * Assert the rules, failing with the offenders named.
 *
 * Deliberately not a custom jest matcher: a plain function keeps the call site
 * readable in a repo with no matcher conventions, and the thrown message is the
 * list itself.
 */
export function expectNoA11yViolations(root: HTMLElement, opts: { expectH1?: boolean } = {}): void {
  const found = a11yViolations(root, opts);
  // `toEqual([])` prints the whole list on failure, which is the point.
  expect(found.map((f) => `${f.rule}: ${f.detail}`)).toEqual([]);
}
