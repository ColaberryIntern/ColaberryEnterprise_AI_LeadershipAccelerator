jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import {
  DEFAULT_SNACKBAR_CONFIG, isSnackbarEnabled, parseSnackbarConfig, snackbarScriptTag,
} from '../landingPageSnackbar';
import { renderLandingPage } from '../landingPageRenderer';
import { parseLandingPageContent } from '../../../schemas/landingPageContentSchema';
import {
  composeDailyCount, composeSignupEvents, roundedAgo, splitName, type SignupRow,
} from '../snackbarFeedService';

const NOW = new Date('2026-10-31T12:00:00Z');
const row = (over: Partial<SignupRow> = {}): SignupRow => ({
  name: 'Jordan Reyes', city: 'Plano', opted_in: true, created_at: new Date('2026-10-31T11:58:30Z'), ...over,
});

describe('isSnackbarEnabled', () => {
  it('follows the brand when the page has no override', () => {
    expect(isSnackbarEnabled(true, null)).toBe(true);
    expect(isSnackbarEnabled(false, undefined)).toBe(false);
  });
  it('page override wins both ways', () => {
    expect(isSnackbarEnabled(true, false)).toBe(false);
    expect(isSnackbarEnabled(false, true)).toBe(true);
  });
  it('is off when nothing is set', () => expect(isSnackbarEnabled(null, null)).toBe(false));
});

describe('parseSnackbarConfig', () => {
  it('fills defaults from an empty object', () => {
    expect(parseSnackbarConfig({})).toEqual({ config: DEFAULT_SNACKBAR_CONFIG, ok: true });
  });
  it('falls back to defaults on garbage, and says so', () => {
    expect(parseSnackbarConfig({ interval_s: 'fast', extra: 1 })).toEqual({ config: DEFAULT_SNACKBAR_CONFIG, ok: false });
  });
  it('defaults to the no-name format', () => expect(DEFAULT_SNACKBAR_CONFIG.name_format).toBe('city_only'));
});

describe('snackbarScriptTag', () => {
  it('points at the same-origin script and the page feed', () => {
    const tag = snackbarScriptTag({ brandSlug: 'colaberry-training', pageSlug: 'ai-learning-platform', config: DEFAULT_SNACKBAR_CONFIG });
    expect(tag).toContain('src="/v1/snackbar.js"');
    expect(tag).toContain('data-feed="/v1/lp-activity/colaberry-training/ai-learning-platform"');
  });
  it('emits nothing for a slug that could break out of the attribute', () => {
    expect(snackbarScriptTag({ brandSlug: 'x"><script>', pageSlug: 'a', config: DEFAULT_SNACKBAR_CONFIG })).toBe('');
  });
});

describe('composeSignupEvents', () => {
  const named = { ...DEFAULT_SNACKBAR_CONFIG, name_format: 'first_initial' as const };

  it('names an opted-in person by first name and last initial only', () => {
    const [e] = composeSignupEvents([row()], named, NOW);
    expect(e.title).toBe('Jordan R. from Plano');
    expect(e.title).not.toContain('Reyes');
  });
  it('never names someone who did not opt in', () => {
    const [e] = composeSignupEvents([row({ opted_in: false })], named, NOW);
    expect(e.title).toBe('Someone in Plano');
  });
  it('city_only never shows a name, even for opted-in people', () => {
    expect(composeSignupEvents([row()], DEFAULT_SNACKBAR_CONFIG, NOW)[0].title).toBe('Someone in Plano');
  });
  it('skips a row with no usable name and no city rather than inventing one', () => {
    expect(composeSignupEvents([row({ city: null, opted_in: false })], named, NOW)).toEqual([]);
  });
  it('drops a city that is not plain text', () => {
    expect(composeSignupEvents([row({ city: '<img src=x>', opted_in: false })], named, NOW)).toEqual([]);
  });
  it('opted_in_only shows opted-in people and nobody else', () => {
    const strict = { ...DEFAULT_SNACKBAR_CONFIG, name_format: 'opted_in_only' as const };
    const out = composeSignupEvents([row(), row({ name: 'Ana Diaz', opted_in: false })], strict, NOW);
    expect(out.map((e) => e.title)).toEqual(['Jordan R. from Plano']);
  });
  it('returns nothing for no rows', () => expect(composeSignupEvents([], named, NOW)).toEqual([]));
  it('is deterministic', () => {
    expect(composeSignupEvents([row()], named, NOW)).toEqual(composeSignupEvents([row()], named, NOW));
  });
});

/**
 * 40 TAC 807.172(d): training may not be advertised as "free". The kit shipped
 * `action: 'just created a free account'`, which renders on a public landing page — caught by
 * the backend copy ratchet, not by a human reading the patch.
 *
 * The ratchet already blocks the word repo-wide, so this is not a second copy of that rule. It
 * pins the thing the ratchet cannot: the ratchet counts occurrences per FILE, so moving the
 * phrase into a config default, a renderer, or a later kit drop satisfies the count while the
 * public page says it again. This asserts over the composed OUTPUT, every string the bar can
 * actually show, so wherever the phrasing comes from it fails here.
 */
describe('every string the bar renders is advertising-compliant', () => {
  const everyFormat = ['city_only', 'first_initial', 'opted_in_only'] as const;

  it('never says "free" in any name format, opted in or not', () => {
    for (const name_format of everyFormat) {
      const cfg = { ...DEFAULT_SNACKBAR_CONFIG, name_format };
      const rows = [row(), row({ name: 'Ana Diaz', opted_in: false })];
      for (const e of composeSignupEvents(rows, cfg, NOW)) {
        expect(`${e.title} ${e.action}`).not.toMatch(/\bfree\b/i);
      }
    }
  });

  it('never says "free" in the daily-count card either', () => {
    const cfg = { ...DEFAULT_SNACKBAR_CONFIG, events: ['daily_count'] as Array<'signup' | 'daily_count'>, daily_min: 1 };
    const e = composeDailyCount(42, cfg)!;
    expect(`${e.title} ${e.action}`).not.toMatch(/\bfree\b/i);
  });

  it('still says something useful — the guard cannot be satisfied by rendering nothing', () => {
    const [e] = composeSignupEvents([row()], DEFAULT_SNACKBAR_CONFIG, NOW);
    expect(e.action).toBe('just created an account');
  });
});

describe('composeDailyCount', () => {
  const cfg = { ...DEFAULT_SNACKBAR_CONFIG, events: ['signup', 'daily_count'] as Array<'signup' | 'daily_count'>, daily_min: 10 };
  it('is hidden below the minimum', () => expect(composeDailyCount(9, cfg)).toBeNull());
  it('shows the real number at or above it', () => expect(composeDailyCount(10, cfg)?.title).toBe('10 people started learning today'));
  it('is hidden when the event kind is off', () => expect(composeDailyCount(50, DEFAULT_SNACKBAR_CONFIG)).toBeNull());
});

describe('helpers', () => {
  it('splitName ignores junk tokens', () => expect(splitName('  ana   <b> ')).toEqual({ first: 'Ana', initial: null }));
  it('roundedAgo buckets times', () => {
    expect(roundedAgo(new Date('2026-10-31T11:59:30Z'), NOW)).toBe(0);
    expect(roundedAgo(new Date('2026-10-31T11:47:00Z'), NOW)).toBe(15);
    expect(roundedAgo(new Date('2026-10-31T09:10:00Z'), NOW)).toBe(180);
  });
});

describe('renderLandingPage with the snack bar', () => {
  const parsed = parseLandingPageContent({ sections: [{ type: 'hero', headline: 'Start learning AI for $0 today' }] });
  if (!parsed.ok) throw new Error('fixture does not parse');
  const base = {
    content: parsed.content,
    brand: { name: 'Colaberry Training', default_theme_key: 'training' },
    siteSlug: 'training',
    pageUrl: 'https://enterprise.colaberry.ai/lp/colaberry-training/ai-learning-platform',
  };

  it('adds the script and styles when on', () => {
    const { html } = renderLandingPage({
      ...base,
      snackbar: { brandSlug: 'colaberry-training', pageSlug: 'ai-learning-platform', config: DEFAULT_SNACKBAR_CONFIG },
    });
    expect(html).toContain('src="/v1/snackbar.js"');
    expect(html).toContain('.cb-snack{');
  });

  it('renders exactly as before when off or omitted', () => {
    expect(renderLandingPage({ ...base, snackbar: null }).html).toBe(renderLandingPage(base).html);
    expect(renderLandingPage(base).html).not.toContain('snackbar.js');
  });

  it('adds no inline script, so the page CSP is unchanged', () => {
    const { html } = renderLandingPage({
      ...base,
      snackbar: { brandSlug: 'colaberry-training', pageSlug: 'ai-learning-platform', config: DEFAULT_SNACKBAR_CONFIG },
    });
    const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) ?? [];
    expect(inline).toEqual([]);
  });
});
