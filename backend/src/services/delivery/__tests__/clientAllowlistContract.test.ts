import { CLIENT_FIELD_ALLOWLIST, type ClientObjectKind } from '../../../modules/delivery/clientVisibility';
import Brand from '../../../models/Brand';
import DeliveryEngagement from '../../../models/DeliveryEngagement';
import DeliveryProject from '../../../models/DeliveryProject';
import DeliveryDecision from '../../../models/DeliveryDecision';
import DeliveryChangeRequest from '../../../models/DeliveryChangeRequest';
import DeliveryClientAcceptance from '../../../models/DeliveryClientAcceptance';

/**
 * Every name in the client allowlist must exist on the model it projects.
 *
 * ## The failure this prevents is silent, and it points the wrong way
 *
 * `toClientShape` builds the response from the allowlist and **skips fields whose value is
 * `undefined`**. That skip is correct — it keeps an absent field absent rather than
 * emitting a null a reader might mistake for data — but it also means a **misspelled or
 * imagined field name simply vanishes**. No error, no warning, no failing test. The
 * endpoint returns 200 with a smaller object than intended.
 *
 * That is exactly what happened. The `decision` allowlist named `title` and
 * `requires_client_approval`; `DeliveryDecision` has neither. It has `question`,
 * `recommendation` and `final_decision`. So the client-facing projection of a decision
 * contained a status and a rationale but **no statement of what was actually decided** —
 * the one thing a decision record exists to communicate. The `project` allowlist likewise
 * named `summary`, `started_at` and `target_date`, none of which exist.
 *
 * The direction of the failure is worth naming: an allowlist bug that *omits* a field is
 * quiet and produces a thin, confusing client view. One that *adds* a field is loud and
 * leaks. Only the second is caught by `findForbiddenFields`, so the first needs this test.
 *
 * ## Why assert against models rather than a fixture
 *
 * The allowlist was written from an imagined schema. Any test written the same way would
 * have agreed with it. These assertions read the model definitions, so they fail when the
 * schema and the projection disagree, whichever one moved.
 *
 * Kinds with no backing model (`design`, `evidence_summary`, `document`) are deliberately
 * not asserted here — see the final test, which keeps that list honest.
 *
 * `release` stays on that list for a DIFFERENT reason, and the distinction matters.
 * `delivery_releases` now exists, but the allowlist names `name`, `released_at` and
 * `evidence_summary` while the table has `version`, `approved_at` and `check_results` —
 * on purpose, because the allowlist carries the CLIENT's vocabulary and the columns carry
 * ours. Asserting it against the model here would demand they match and force our words
 * onto the client surface.
 *
 * It is pinned instead against `toClientRelease`, the mapper between them, in
 * `clientReleaseProjection.test.ts`. Until that test existed nothing checked it at all,
 * and four of the six fields were not produced by anything — a release would have reached
 * a client with no name and no date, silently.
 */

const MODEL_BY_KIND = {
  brand: Brand,
  engagement: DeliveryEngagement,
  project: DeliveryProject,
  decision: DeliveryDecision,
  change_request: DeliveryChangeRequest,
  acceptance: DeliveryClientAcceptance,
} as const;

/** Kinds projected from something other than a single model, or not yet backed by one. */
const KINDS_WITHOUT_A_MODEL: readonly ClientObjectKind[] = [
  'design',
  'release',
  'evidence_summary',
  'document',
];

describe('client allowlist matches the real models', () => {
  for (const [kind, Model] of Object.entries(MODEL_BY_KIND)) {
    it(`every allowlisted \`${kind}\` field exists on its model`, () => {
      const attributes = Object.keys(Model.getAttributes());
      const missing = CLIENT_FIELD_ALLOWLIST[kind as ClientObjectKind].filter(
        (field) => !attributes.includes(field),
      );
      // Named in the failure message so the fix is obvious without opening two files.
      expect({ kind, missing }).toEqual({ kind, missing: [] });
    });
  }

  it('never allowlists a field the forbidden-category scanner would reject', () => {
    // The two mechanisms must not contradict each other. If a field is both allowlisted
    // and forbidden, one of them is wrong and the tripwire would fire on every request.
    const forbiddenPrefixes = ['risk_', 'builder_', 'execution_', 'internal_', 'cost_'];
    for (const [kind, fields] of Object.entries(CLIENT_FIELD_ALLOWLIST)) {
      for (const field of fields) {
        const clash = forbiddenPrefixes.find((p) => field.startsWith(p));
        expect({ kind, field, clash }).toEqual({ kind, field, clash: undefined });
      }
    }
  });

  it('keeps the impact_internal field OUT of the change_request projection', () => {
    // A specific, high-value negative: DeliveryChangeRequest carries both `impact_summary`
    // (what the client is told) and `impact_internal` (what we say to each other). Getting
    // these the wrong way round is a plausible edit and an expensive one.
    expect(CLIENT_FIELD_ALLOWLIST.change_request).toContain('impact_summary');
    expect(CLIENT_FIELD_ALLOWLIST.change_request).not.toContain('impact_internal');
  });

  it('keeps source_lead_id OUT of the engagement projection', () => {
    // The sharpest negative on this model. `source_lead_id` links an engagement back to
    // the marketing lead it came from - our funnel record, not the client's. Showing it
    // would tell a client we tracked them as a lead, and which one.
    expect(CLIENT_FIELD_ALLOWLIST.engagement).toContain('name');
    expect(CLIENT_FIELD_ALLOWLIST.engagement).not.toContain('source_lead_id');
    expect(CLIENT_FIELD_ALLOWLIST.engagement).not.toContain('metadata');
    expect(CLIENT_FIELD_ALLOWLIST.engagement).not.toContain('engagement_type');
  });
  it('projects a brand NAME and a theme KEY, now that something honours it', () => {
    // This assertion was the inverse until 2026-09-02: `default_theme_key` was seeded for
    // all five brands and implemented nowhere, so projecting it would have let the client
    // surface promise per-brand styling that did not exist.
    //
    // The registry now exists (frontend/src/theme/deliveryBrandThemes.ts) and a key it
    // does not recognise renders the same neutral surface as before, so the key is no
    // longer a promise. What is projected is still a KEY and never colours: an opaque
    // string that leaks nothing about the brand.
    expect(CLIENT_FIELD_ALLOWLIST.brand).toContain('name');
    expect(CLIENT_FIELD_ALLOWLIST.brand).toContain('default_theme_key');
    expect(CLIENT_FIELD_ALLOWLIST.brand).not.toContain('metadata');
    expect(CLIENT_FIELD_ALLOWLIST.brand).not.toContain('status');
    // Colours never travel over the wire; the key names a theme the client resolves.
    expect(CLIENT_FIELD_ALLOWLIST.brand).not.toContain('theme');
    expect(CLIENT_FIELD_ALLOWLIST.brand).not.toContain('colors');
  });
  it('accounts for every allowlist kind, so a new one cannot skip this check', () => {
    // Without this, adding a ninth kind would silently go unverified: the loop above only
    // covers what MODEL_BY_KIND names.
    const covered = [...Object.keys(MODEL_BY_KIND), ...KINDS_WITHOUT_A_MODEL].sort();
    expect(Object.keys(CLIENT_FIELD_ALLOWLIST).sort()).toEqual(covered);
  });
});
