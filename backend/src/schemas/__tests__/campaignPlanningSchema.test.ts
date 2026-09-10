import {
  CampaignFunnelStageSchema,
  CampaignPlanningPatchSchema,
} from '../campaignPlanningSchema';
import { CAMPAIGN_FUNNEL_STAGES } from '../../models/Campaign';

/**
 * OBL-001 — `CAMPAIGN_FUNNEL_STAGES` had to gain a real consumer or be deleted.
 *
 * It was exported by the model and imported by nothing. A decorative export is not harmless:
 * it reads as the authoritative list of funnel stages, so the next person adds a stage there
 * and reasonably expects the system to accept it. Nothing was reading it, so nothing would.
 *
 * Worse, the column it describes was unreachable in BOTH directions. `funnel_stage` was added
 * to the DDL and declared on the model, but it appeared in no service and in no update
 * allowlist — `campaignService.updateCampaign` filters every patch through an explicit
 * allowlist and `funnel_stage` was not on it. So the schema change had shipped with no way to
 * write the column at all.
 *
 * These tests pin the three properties that make it real: the validator is DERIVED from the
 * constant rather than restating it, the enum actually rejects, and clearing a stage is
 * distinguishable from leaving it alone.
 */

describe('CampaignFunnelStageSchema is derived from the model constant', () => {
  it('accepts exactly the stages the model declares — no more, no fewer', () => {
    // The load-bearing assertion. A hand-written copy in the schema would pass the
    // "accepts every stage" half below while silently disagreeing on a sixth, so the set is
    // compared in BOTH directions.
    const accepted = CAMPAIGN_FUNNEL_STAGES.filter(
      (s) => CampaignFunnelStageSchema.safeParse(s).success,
    );
    expect(accepted).toEqual([...CAMPAIGN_FUNNEL_STAGES]);
    expect(CampaignFunnelStageSchema.options).toEqual([...CAMPAIGN_FUNNEL_STAGES]);
  });

  it('rejects a stage the model does not declare', () => {
    // Proves the enum can fail. Before this consumer existed, `funnel_stage: 'banana'` would
    // have been written to the column verbatim, because there is no CHECK constraint on it -
    // one was rejected deliberately, since adding a CHECK to the live `campaigns` table would
    // validate every existing row at boot.
    for (const bad of ['banana', 'AWARENESS', 'awareness ', '', 'acquisition']) {
      expect(CampaignFunnelStageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects non-strings rather than coercing them', () => {
    for (const bad of [1, null, undefined, {}, [], true]) {
      expect(CampaignFunnelStageSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('has five stages — a count change is a deliberate decision, not a typo', () => {
    expect(CAMPAIGN_FUNNEL_STAGES).toHaveLength(5);
  });
});

describe('CampaignPlanningPatchSchema', () => {
  it('distinguishes CLEARING a stage from LEAVING IT ALONE', () => {
    // Two different intents that a naive schema collapses into one. `null` means the operator
    // decided the campaign has no funnel stage; omission means they were editing something
    // else entirely. If both mapped to "unset", an operator patching a budget would silently
    // wipe the stage.
    const cleared = CampaignPlanningPatchSchema.safeParse({ funnel_stage: null });
    expect(cleared.success).toBe(true);
    expect(cleared.success && 'funnel_stage' in cleared.data).toBe(true);
    expect(cleared.success && cleared.data.funnel_stage).toBeNull();

    const untouched = CampaignPlanningPatchSchema.safeParse({});
    expect(untouched.success).toBe(true);
    expect(untouched.success && 'funnel_stage' in untouched.data).toBe(false);
  });

  it('accepts a valid full planning patch', () => {
    const result = CampaignPlanningPatchSchema.safeParse({
      funnel_stage: 'consideration',
      planned_start_at: '2026-10-01T00:00:00.000Z',
      planned_end_at: '2026-12-01T00:00:00.000Z',
      owner_admin_id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data.planned_start_at instanceof Date).toBe(true);
  });

  it('rejects an invalid stage inside an otherwise valid patch', () => {
    // The realistic shape of the bug: everything else is fine, so a schema that validated
    // only the fields it recognised would let this through.
    const result = CampaignPlanningPatchSchema.safeParse({
      funnel_stage: 'acquisition',
      planned_start_at: '2026-10-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid owner rather than storing a dangling reference', () => {
    expect(CampaignPlanningPatchSchema.safeParse({ owner_admin_id: 'ali' }).success).toBe(false);
  });
});
