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

/**
 * How the money arrives, which is NOT the same question as what we sell.
 *
 * Ali, 2026-11-21, describing Plan A: "more along what Will is going through right now
 * with Middlesex. We are looking at a retainer, a monthly fee."
 *
 * That distinction earns a field of its own because it changes what a recorded deal value
 * MEANS. A retainer's natural figure is a monthly fee; a project's is a total. Both end up
 * in `enterprise_deal_values.deal_value_cents`, which always holds the TOTAL, so the shape
 * has to be visible to whoever enters it or a $4,500 monthly retainer gets filed as a
 * $4,500 deal. See `enterpriseDealValueService`, where the shape is required, not guessed.
 */
export type EngagementShape = 'monthly_retainer' | 'guided_project' | 'training_program';

export interface EnterprisePlan {
  key: EnterprisePlanKey;
  /** How the funnel labels it. Ali's words, because this is read by Ram, not by a buyer. */
  label: string;
  /** What a prospect is asking for when they pick this one. */
  means: string;
  /** How the money arrives. Drives how a deal value for this plan must be entered. */
  shape: EngagementShape;
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
    shape: 'monthly_retainer',
    means:
      'We build it for them, on a retainer. Ali, 2026-11-21: "more along what Will is going '
      + 'through right now with Middlesex. We are looking at a retainer, a monthly fee." So '
      + 'this plan is RECURRING revenue, not a one-off project fee, which is why its shape '
      + 'is monthly_retainer and not guided_project.',
  },
  {
    key: 'guide',
    label: 'Work with your team',
    shape: 'guided_project',
    means:
      'Their people build it and we lead the work. Ali, 2026-11-21: this is "when they do '
      + 'not want plan A because they want their people to build it." The deliverable is the '
      + 'same system; who writes it is the difference.',
  },
  {
    key: 'train',
    label: 'Training your team',
    shape: 'training_program',
    means:
      'We upgrade their people. Ali, 2026-11-21: "for people that want to upgrade their '
      + 'people and create Forward Deployed Engineers." The thing left behind is capability '
      + 'in their staff, not a system we wrote.',
  },
];

/**
 * The fourth motion, which is NOT one of the three plans and is deliberately not listed
 * above.
 *
 * Ali, 2026-11-21, after describing A, B and C: "Then you can also talk about how we create
 * our own Developers and they produce real projects that are all documented Case Studies so
 * when seeing who you want to hire. The cost is 10% of the 1st year annual salary."
 *
 * It belongs to the `hire_fde` stream (hire.refactored.ai), not to `enterprise_site`, and
 * the separation is load bearing in both directions. An enterprise plan is a company buying
 * our work; a placement is a company hiring a person we trained, and the case studies are
 * the evidence they shop with. Counting a placement as an enterprise plan would overstate
 * the three plans and understate the hiring motion, and the two have different funnels:
 * one ends at a signed engagement, the other at a hire.
 *
 * Recorded here anyway, because the three plans and this are one conversation with a buyer,
 * and the next person reading `ENTERPRISE_PLANS` will otherwise wonder where the fourth
 * thing Ali described went.
 */
export const FDE_PLACEMENT_NOTE =
  'Not an enterprise plan: companies hire forward-deployed engineers we trained, through '
  + 'hire.refactored.ai, at 10% of first year salary (set by Ali 2026-11-21, corrected from '
  + 'a mistaken 1%). Lives on the hire_fde stream, which is declared and priced but not yet '
  + 'wired to anything that records a placement.';

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
