/**
 * R23 — the three things enterprise.colaberry.ai actually sells.
 *
 * Ali, 2026-11-21: "I would like to add a Revenue source that is enterprise.colaberry.ai.
 * With 3 plans. A New build, work with your team, training your team."
 *
 * ── THESE ARE NOT NEW OFFERS, AND THAT MATTERS ───────────────────────────────────────────
 *
 * The site already sells exactly these three, under exactly these shapes. On 2026-11-16
 * `PricingV2.tsx` was rebuilt around Build / Guide / Train, modeled on
 * `docs/enterprise-site-v4/index.html`, and `frontend/src/config/v2Pricing.ts` has held
 * `SERVICE_SHAPES` with the keys `build`, `guide` and `train` ever since. "A new build",
 * "work with your team" and "training your team" are those three in Ali's words.
 *
 * So this module does not invent an offer. It gives the revenue side a vocabulary for the
 * offer that is already public, so a prospect can be counted against the thing they came
 * for.
 *
 * ── WHY THE BACKEND OWNS THIS AND NOT THE PRICING PAGE ───────────────────────────────────
 *
 * The page owns how the offer is SOLD: its words, its order, its figures, which of them the
 * claims registry will publish on which route. That is commercial copy and it changes for
 * commercial reasons.
 *
 * This owns how the offer is COUNTED. A funnel needs a key that survives a copy rewrite: if
 * "Guide" is renamed "Advisory" on the page next month, every intake already recorded
 * against `guide` must keep counting, and a stream whose grouping key was the display name
 * would silently split one plan into two.
 *
 * The two therefore agree on KEYS and on nothing else, and that agreement is not left to
 * memory — `__tests__/enterprisePlansMatchTheSite.test.ts` reads `v2Pricing.ts` and fails if
 * the three keys ever drift apart. That test follows the precedent of
 * `frontendTypographyLint.test.ts`, which is likewise a backend test whose subject is
 * frontend source.
 *
 * ── NO PRICES LIVE HERE, DELIBERATELY ────────────────────────────────────────────────────
 *
 * There is no `priceCents` on these entries and there must not be. Every figure on the
 * enterprise site resolves through the claims registry, `PricingV2.tsx`'s header records
 * that Ali's pricing decision (W4) is still open, and `EnterpriseIntake` has no value column
 * at all. A price constant here would be a fourth place a number could come from, and the
 * one it would disagree with is the registry.
 */

/** The grouping key for one enterprise service. Stable across any rewrite of the copy. */
export type EnterprisePlanKey = 'build' | 'guide' | 'train';

export interface EnterprisePlan {
  key: EnterprisePlanKey;
  /** How the funnel labels it. Ali's words, because this is read by Ram, not by a buyer. */
  label: string;
  /** What a prospect is asking for when they pick this one. */
  means: string;
}

/**
 * The three plans, in the order the site walks a buyer through them.
 *
 * Order is Build, Guide, Train because that is `SERVICE_SHAPES`' order and `PricingV2`'s
 * reading order, and a funnel whose plans appear in a different order from the page they
 * came from makes a reader check whether they are looking at the same three things.
 */
export const ENTERPRISE_PLANS: readonly EnterprisePlan[] = [
  {
    key: 'build',
    label: 'A new build',
    means: 'We build the thing. The prospect wants a system that does not exist yet.',
  },
  {
    key: 'guide',
    label: 'Work with your team',
    means: 'We build alongside their people. The prospect has a team and wants it led.',
  },
  {
    key: 'train',
    label: 'Training your team',
    means: 'We teach their people. The prospect wants capability left behind, not a system.',
  },
];

export const ENTERPRISE_PLAN_KEYS: readonly EnterprisePlanKey[] = ENTERPRISE_PLANS.map((p) => p.key);

/**
 * Read a plan key out of whatever the intake form put in `service`.
 *
 * ── WHY THIS IS LENIENT ON INPUT AND STRICT ON OUTPUT ────────────────────────────────────
 *
 * `EnterpriseIntake.service` is `STRING(50)` defaulting to `''`, and nothing in the W28 form
 * constrains it to these three keys — so the column can hold a key, a display label, a
 * buyer's own phrasing, or nothing. Matching only on the exact key would report every real
 * inquiry as unattributed, which is a worse answer than reading the obvious ones.
 *
 * It returns `null` rather than guessing a default. A prospect whose plan nobody recorded is
 * not a Build prospect, and `enterpriseFlow` counts those separately and says how many there
 * are instead of folding them into the first bucket.
 */
export function planOf(service: string | null | undefined): EnterprisePlanKey | null {
  const raw = String(service ?? '').trim().toLowerCase();
  if (!raw) return null;

  // An exact key is the only unambiguous answer, so it is tried first and on its own.
  const exact = ENTERPRISE_PLAN_KEYS.find((k) => k === raw);
  if (exact) return exact;

  // Then the shapes a human or a form would plausibly submit. Each phrase is matched as a
  // substring because the field is free text: "training your team (10 people)" is a Train.
  const PHRASES: ReadonlyArray<readonly [EnterprisePlanKey, readonly string[]]> = [
    ['build', ['new build', 'build it for', 'build for us', 'new system', 'a build']],
    ['guide', ['work with', 'with your team', 'with our team', 'alongside', 'guide', 'advisory']],
    ['train', ['train', 'training', 'teach', 'upskill', 'enablement']],
  ];

  // Build before Guide before Train, matching ENTERPRISE_PLANS' order, so a string that
  // somehow satisfies two is resolved the same way on every run rather than by map order.
  for (const [key, phrases] of PHRASES) {
    if (phrases.some((p) => raw.includes(p))) return key;
  }
  return null;
}
