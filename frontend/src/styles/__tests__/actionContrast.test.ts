import path from 'path';
import {
  AA_TEXT, declarationValue, parseColor, ratioOf, readCss, resolveVar, resolveVarOrNull,
  rootVars, round2, type Vars,
} from './testEnv/cssContrast';

/**
 * AF12.6 STEP 1 - every white-on-brand action surface, measured, with the failures pinned.
 *
 * ## What this file is and is not
 *
 * It is NOT the recolour. Re-pointing the action colour changes the primary brand action across
 * the public site, the portal and campus, roughly 25 further rules hardcode white-on-cherry and
 * will not follow a token change, and Aleem owns the design system and has said he will correct
 * red-500 himself. If this repo re-points first and he then ships a corrected red-500, the two
 * diverge further. That decision is his and Ali's, and this file deliberately leaves every colour
 * exactly where it is.
 *
 * It IS the gate that should have existed before the defect could land: the contrast of each
 * action surface is now computed from the real stylesheets on every run, the ones that pass are
 * asserted to keep passing, and the ones that fail are written down with their exact ratios so
 * they stop being invisible. A NEW failing surface fails the build. A fixed one also fails the
 * build, with a message telling you to shrink the list, because a ratchet that only tightens
 * silently is a ratchet nobody updates.
 *
 * ## Why a token test did not catch this
 *
 * `tokenCascade.test.ts` pins `--color-primary` to `#FB2832` and is right to: it exists to prove
 * which file wins the cascade, and it is the only thing pinning the import order. But it pins the
 * hex with no notion of whether the hex is legible under white text, which is how a WCAG failure
 * got frozen into a green build. The two files answer different questions and both are needed:
 * that one says what renders, this one says whether what renders can be read.
 *
 * ## Reported by
 *
 * Mohammed Abdul Aleem, 9 Nov 2026, against his own design system while reviewing Mihret
 * Netsereab's PR #1: the action button is cherry under white text, 3.85:1, and fails AA for
 * normal-size text.
 *
 * ## The two independent paint paths, because the obvious edit does nothing
 *
 *   1. `global.css` sets `.btn-primary { background-color: var(--color-primary) !important }`.
 *      That `!important` beats `brand-bridge.css`'s `--bs-btn-bg` regardless of load order, so
 *      editing the bridge alone produces NO visible change.
 *   2. The vendored design system ships its own `.cb-btn`, painting `var(--action-bg)`, used by
 *      PublicNavbar, PublicFooter, SponsorshipPage, ConsultingPage, the campus board and the
 *      Anthropic bento. A fix that only touches Bootstrap tokens leaves every one of those at
 *      3.85:1.
 *
 * Both are inventoried below, which is the point: a reader of this file cannot conclude that
 * fixing one of them fixes the button.
 */

const STYLES = __dirname.replace(/[\\/]__tests__$/, '');
const SRC = path.join(STYLES, '..');
const COLABERRY_TOKENS = path.join(SRC, 'colaberry', 'tokens');

const WHITE = '#FFFFFF';

/** The colaberry `:root` layer, which is what `brand-bridge.css` re-points the Bootstrap
 * tokens at, and what the design system's own tokens resolve through. */
function colaberryLayer(): Vars {
  const files = ['colors.css', 'fonts.css', 'spacing.css'];
  const merged: Vars = {};
  for (const f of files) {
    const p = path.join(COLABERRY_TOKENS, f);
    let css: string;
    try {
      css = readCss(p);
    } catch {
      continue;
    }
    for (const [k, v] of Object.entries(rootVars(css))) {
      if (!(k in merged)) merged[k] = v;
    }
  }
  return merged;
}

const layer = colaberryLayer();
const bridge = rootVars(readCss(path.join(STYLES, 'brand-bridge.css')));
const globalCss = readCss(path.join(STYLES, 'global.css'));

/** Resolve a Bootstrap-era token the way the browser does: the bridge wins, then the
 * colaberry layer supplies the literal. */
function renderedBootstrapToken(name: string): string {
  const fromBridge = bridge[name];
  if (fromBridge === undefined) throw new Error(`brand-bridge.css does not declare ${name}`);
  return resolveVar(fromBridge, layer);
}

/** A rule's literal background, for the surfaces that hardcode a hex instead of a token. */
function literalBackground(relPath: string, selector: string, prop = 'background'): string {
  const css = readCss(path.join(SRC, relPath));
  const v = declarationValue(css, selector, prop);
  if (v === null) throw new Error(`${relPath}: no ${prop} on ${selector}`);
  return v;
}

/**
 * The fill a `global.css` rule ACTUALLY declares, resolved through the cascade.
 *
 * Read from the rule rather than named here, and a mutation run is why. The first version of
 * this file hardcoded `renderedBootstrapToken('--color-primary')` for `.btn-primary`. Repointing
 * the rule in `global.css` to a different token then changed nothing in this suite: it went on
 * measuring the token the TEST named instead of the one the STYLESHEET paints, and reported a
 * confident ratio for a colour nobody renders. That is the same mistake as quoting `tokens.css`
 * as the authority, one layer up.
 */
function globalRuleFill(selector: string): string {
  const declared = declarationValue(globalCss, selector, 'background-color');
  if (declared === null) throw new Error(`global.css: no background-color on ${selector}`);
  const token = declared.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  // A rule that hardcodes a hex needs no cascade walk; one that names a token gets resolved
  // through the bridge exactly as the browser would.
  return token ? renderedBootstrapToken(token[1]) : declared;
}

interface Surface {
  /** Stable id. Changing one is a deliberate act; it is what the pinned list matches on. */
  readonly id: string;
  /** Where it paints, for somebody who has to go and fix it. */
  readonly where: string;
  /** The fill, resolved from the real stylesheets at run time. */
  readonly fill: () => string;
  /** The text colour on that fill. White everywhere in this inventory, stated rather than assumed. */
  readonly text: string;
}

/**
 * Every surface in the product that paints white text on a brand fill.
 *
 * Adding a new action colour to the product means adding it here. That is the intended friction:
 * the reason this defect lasted is that no list existed to add it to.
 */
const SURFACES: readonly Surface[] = [
  {
    id: 'bootstrap .btn-primary',
    where: 'styles/global.css .btn-primary (background-color !important)',
    fill: () => globalRuleFill('.btn-primary'),
    text: WHITE,
  },
  {
    id: 'bootstrap .btn-primary:hover',
    where: 'styles/global.css .btn-primary:hover',
    fill: () => globalRuleFill('.btn-primary:hover'),
    text: WHITE,
  },
  {
    id: 'design-system .cb-btn',
    where: 'colaberry/components/core/Button.jsx, --action-bg',
    fill: () => resolveVar('var(--action-bg)', layer),
    text: WHITE,
  },
  {
    id: 'design-system .cb-btn:hover',
    where: 'colaberry/tokens/colors.css --action-bg-hover',
    fill: () => resolveVar('var(--action-bg-hover)', layer),
    text: WHITE,
  },
  {
    id: 'design-system .cb-btn:active',
    where: 'colaberry/tokens/colors.css --action-bg-press',
    fill: () => resolveVar('var(--action-bg-press)', layer),
    text: WHITE,
  },
  {
    id: 'projects .pw-act.open',
    where: 'pages/portal/projects/projects.css, literal hex',
    fill: () => literalBackground('pages/portal/projects/projects.css', '.pj-root .pw-act.open'),
    text: WHITE,
  },
  {
    id: 'feed .fchip.active',
    where: 'pages/portal/feed/feed.css, literal hex',
    fill: () => literalBackground('pages/portal/feed/feed.css', '.te-feed-filter .fchip.active'),
    text: WHITE,
  },
];

/**
 * The surfaces that FAIL AA today, with the ratio each one fails at.
 *
 * This is an inventory, not a permission. Every entry is a real accessibility defect that ships
 * right now. It is written down so that it is countable and so that a new one cannot hide among
 * them. The recolour that empties this list is AF12.6 step 2 and belongs to Aleem and Ali.
 *
 * Measured 2026-11-16 against the committed stylesheets.
 */
const KNOWN_FAILURES: Readonly<Record<string, number>> = Object.freeze({
  'bootstrap .btn-primary': 3.85,
  'bootstrap .btn-primary:hover': 3.13,
  'design-system .cb-btn': 3.85,
  'projects .pw-act.open': 3.85,
  'feed .fchip.active': 3.85,
});

const measured = SURFACES.map((s) => {
  const fill = s.fill();
  return { id: s.id, where: s.where, fill, ratio: round2(ratioOf(s.text, fill)) };
});
const failing = measured.filter((m) => m.ratio < AA_TEXT);
const passing = measured.filter((m) => m.ratio >= AA_TEXT);

describe('the resolver measures what it claims', () => {
  // The control. Without it, every assertion below could pass vacuously on a broken resolver.
  it('computes known ratios correctly', () => {
    expect(ratioOf('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(ratioOf('#FFFFFF', '#FB2832')).toBeCloseTo(3.85, 1);
    expect(ratioOf('#FFFFFF', '#E5121D')).toBeCloseTo(4.73, 1);
  });

  it('reads the real cascade rather than tokens.css', () => {
    // brand-bridge wins over tokens.css for these names; if this ever resolves to the
    // tokens.css value instead, every ratio below is answering about a colour nobody paints.
    expect(renderedBootstrapToken('--color-primary')).toBe('#FB2832');
    expect(renderedBootstrapToken('--color-primary-light')).toBe('#FD5760');
  });

  it('reads the token out of the RULE, not out of this test file', () => {
    // Repointing .btn-primary in global.css must change what this suite measures. It did not,
    // until a mutation run caught it: the surface named its own token and ignored the rule.
    expect(declarationValue(globalCss, '.btn-primary', 'background-color'))
      .toBe('var(--color-primary)');
    expect(declarationValue(globalCss, '.btn-primary:hover', 'background-color'))
      .toBe('var(--color-primary-light)');
  });

  it('REFUSES a token it cannot resolve rather than skipping the pair', () => {
    // The helper's docblock claims this, and a claim in a docblock does not fail a build. A
    // resolver that silently returned the unresolved text would report a clean sheet for a
    // stylesheet it never read, which is the whole failure mode this file exists to end.
    expect(() => resolveVar('var(--token-that-does-not-exist)', layer)).toThrow(/undefined token/);
    expect(() => resolveVar('var(--a)', { '--a': 'var(--b)', '--b': 'var(--a)' })).toThrow(/loop/);
    // and the explicit opt-out still reports a miss rather than inventing one
    expect(resolveVarOrNull('var(--token-that-does-not-exist)', layer)).toBeNull();
    expect(resolveVarOrNull('var(--red-500)', layer)).toBe('#FB2832');
  });

  it('reads a literal hex straight out of the stylesheet that hardcodes it', () => {
    expect(parseColor(literalBackground(
      'pages/portal/feed/feed.css', '.te-feed-filter .fchip.active',
    ))).toEqual([251, 40, 50, 1]);
  });
});

describe('every action surface is measured, and none is skipped', () => {
  it('resolves a fill for all of them', () => {
    // A surface whose fill could not be resolved would silently drop out of both lists and
    // report a clean sheet for a stylesheet nobody read.
    expect(measured).toHaveLength(SURFACES.length);
    for (const m of measured) {
      expect({ id: m.id, parsed: !!parseColor(m.fill) }).toEqual({ id: m.id, parsed: true });
    }
  });

  it('accounts for every surface as either passing or failing', () => {
    expect(passing.length + failing.length).toBe(SURFACES.length);
  });
});

describe('the surfaces that pass AA keep passing', () => {
  it.each(Object.keys(KNOWN_FAILURES).length < SURFACES.length
    ? SURFACES.filter((s) => !(s.id in KNOWN_FAILURES)).map((s) => [s.id] as const)
    : [])('%s is at least 4.5:1', (id) => {
    const m = measured.find((x) => x.id === id)!;
    expect({ id, ratio: m.ratio, ok: m.ratio >= AA_TEXT })
      .toEqual({ id, ratio: m.ratio, ok: true });
  });
});

describe('THE PINNED INVENTORY - it may shrink, it may not grow', () => {
  it('has exactly the failures that are written down, in both directions', () => {
    // Both directions on purpose, the same idiom as the test-typecheck baseline. A new failing
    // surface is a regression. A failure that has gone away is good news that must be recorded,
    // because an inventory nobody shrinks stops being read.
    expect(failing.map((f) => f.id).sort()).toEqual(Object.keys(KNOWN_FAILURES).sort());
  });

  it('each failure is at the ratio it was pinned at', () => {
    // A ratio that moved without the id changing means somebody altered the colour. That is
    // either the step-2 recolour, in which case update this file, or an accident.
    for (const f of failing) {
      expect({ id: f.id, ratio: f.ratio })
        .toEqual({ id: f.id, ratio: KNOWN_FAILURES[f.id] });
    }
  });

  it('the count never grows', () => {
    expect(failing.length).toBeLessThanOrEqual(Object.keys(KNOWN_FAILURES).length);
  });

  it('names where each failure paints, so the list is actionable rather than a number', () => {
    for (const f of failing) {
      expect({ id: f.id, hasWhere: f.where.length > 10 })
        .toEqual({ id: f.id, hasWhere: true });
    }
  });
});

describe('the two paint paths are both covered, which is the trap in this defect', () => {
  it('covers the Bootstrap path and the design-system path separately', () => {
    // Fixing one and declaring victory is the documented failure mode here: the design system's
    // own .cb-btn is used by the public navbar, the footer, sponsorship, consulting, the campus
    // board and the Anthropic bento, none of which follow a Bootstrap token change.
    expect(measured.some((m) => m.id.startsWith('bootstrap '))).toBe(true);
    expect(measured.some((m) => m.id.startsWith('design-system '))).toBe(true);
  });

  it('the resting state is not the worst state', () => {
    // global.css paints :hover with --color-primary-light, which resolves to the single worst
    // ratio in the system. Nobody had reported it, because nobody looks at a hover state.
    const rest = measured.find((m) => m.id === 'bootstrap .btn-primary')!;
    const hover = measured.find((m) => m.id === 'bootstrap .btn-primary:hover')!;
    expect(hover.ratio).toBeLessThan(rest.ratio);
  });

  it('a passing brand red already exists in the product, so step 2 has somewhere to go', () => {
    // red-600 and red-700 are both already in use here. Recorded so the step-2 decision is not
    // framed as "introduce a new colour" when it is "use one of the two that already pass".
    expect(round2(ratioOf(WHITE, resolveVar('var(--red-600)', layer)))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(round2(ratioOf(WHITE, resolveVar('var(--red-700)', layer)))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
