import * as fs from 'fs';
import * as path from 'path';

/**
 * The alumni referral campaign fallback.
 *
 * FOUND WHILE AUDITING EXPLORER GROWTH EPIC 6, and it is not an Explorer bug —
 * it predates that work and would have misdirected referrals regardless.
 *
 * `submitReferral` used to fall through to:
 *
 *   Campaign.findOne({ where: { type: 'warm_nurture', status: 'active' },
 *                      order: [['created_at', 'DESC']] })
 *
 * — the newest active warm-nurture campaign, whatever it happened to be. That
 * fires precisely when something is already wrong (the named referral campaign
 * is paused or renamed), and it enrolls a person **personally introduced by an
 * alumnus** into an unrelated campaign whose copy has nothing to do with them.
 *
 * It was also invisible: the referral still read `campaign_assigned`, so every
 * count looked healthy.
 *
 * The eight Explorer campaigns are `warm_nurture` and, freshly seeded, the
 * newest — so they would have been selected preferentially. They are inert, but
 * the defect is the wrong message rather than the send.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'alumniReferralService.ts'), 'utf8');
/** Comments stripped — assertions about CODE must not match the prose explaining it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the scan is not blind', () => {
  it('stripped comments but left real code', () => {
    // Every assertion below is a substring check. If stripping ate the file they
    // would all pass vacuously.
    expect(CODE).toContain('export async function submitReferral');
    expect(CODE).toContain('enrollLeadsInCampaign');
    expect(CODE.length).toBeGreaterThan(3000);
  });
});

describe('a referral is never enrolled into an arbitrary campaign', () => {
  it('has no type-and-recency fallback', () => {
    // The regression, stated as the shape that caused it. `warm_nurture` must
    // not appear in this file at all: there is no version of "the newest active
    // warm-nurture campaign" that is a targeting decision.
    expect(CODE).not.toContain('warm_nurture');
  });

  it('selects the introduced campaign by its specific name', () => {
    expect(CODE).toContain("name: 'Colaberry Alumni Referrals Campaign'");
    expect(CODE).toContain("status: 'active'");
  });

  it('selects cold outbound only for the referral types that mean it', () => {
    expect(CODE).toContain("type: 'cold_outbound'");
  });

  it('enrolls only when a campaign was actually found', () => {
    const enrollAt = CODE.indexOf('enrollLeadsInCampaign(campaign.id');
    const guardAt = CODE.lastIndexOf('if (campaign) {', enrollAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(enrollAt);
  });
});

describe('a missing campaign is REPORTED, not substituted', () => {
  it('records an activity event naming what it looked for', () => {
    // The referral's own history is where someone would look. A console warning
    // alone scrolls away; this does not.
    expect(CODE).toContain("event_type: 'campaign_assignment_failed'");
    expect(CODE).toContain('sought');
  });

  it('warns with the referral id and type, so it is diagnosable', () => {
    expect(CODE).toContain('No campaign for referral');
    expect(CODE).toContain('data.referral_type');
  });

  it('still creates the lead and credits the referrer', () => {
    // Only the enrollment is skipped. Losing the lead or the referrer credit
    // would be a worse regression than the bug being fixed.
    const leadAt = CODE.indexOf("status: 'lead_created'");
    const gapAt = CODE.indexOf("event_type: 'campaign_assignment_failed'");
    expect(leadAt).toBeGreaterThan(-1);
    expect(leadAt).toBeLessThan(gapAt); // the lead is created before we ever look for a campaign
    expect(CODE).toContain('total_referrals');
  });

  it('leaves the referral at lead_created rather than inventing a status', () => {
    // `campaign_assigned` would be a lie. ReferralStatus has no "no campaign"
    // value and adding one is a schema-adjacent change for no gain —
    // `lead_created` is already exactly what is true.
    const gapBlock = CODE.slice(
      CODE.indexOf("event_type: 'campaign_assignment_failed'") - 600,
      CODE.indexOf("event_type: 'campaign_assignment_failed'") + 300,
    );
    expect(gapBlock).not.toContain("status: 'campaign_assigned'");
  });
});

describe('the new event type is declared', () => {
  it('is a member of ReferralEventType', () => {
    const model = fs.readFileSync(
      path.join(__dirname, '..', '..', 'models', 'ReferralActivityEvent.ts'),
      'utf8',
    );
    expect(model).toContain("| 'campaign_assignment_failed'");
  });

  it('fits the column', () => {
    // event_type is STRING(50) with no DB constraint, so an over-long value
    // would be silently truncated rather than rejected.
    expect('campaign_assignment_failed'.length).toBeLessThanOrEqual(50);
  });
});
