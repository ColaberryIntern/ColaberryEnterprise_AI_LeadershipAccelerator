import * as fs from 'fs';
import * as path from 'path';
import type { JourneySubjectContext } from '../governor/types';
import { decideForSubject } from '../governor/decideForSubject';
import { classificationNurture, learnerHardStops, learnerStrategy } from '../strategies/learnerStrategy';
import { contact, channel, cpn, ctx, deps, facts, flags, NO_STOPS } from './fixtures/learnerFixtures';

/**
 * T309 - the learner strategy through the shared pipeline: its six tier-0
 * stops, what `decideForSubject` records for a Training learner and for a CPN
 * lead, and what the two modules are structurally allowed to touch. The
 * generation differential and the no-fabrication property live in
 * `learnerStrategy.test.ts`.
 */

/* ── hard stops ────────────────────────────────────────────────────────────── */

describe('the six tier-0 stops for a learner', () => {
  it('converted is Explorer\'s own verdict, read from the profile state', () => {
    expect(learnerHardStops(ctx({ learner: facts({ primary_state: 'CONVERTED' }) })).converted).toBe(true);
    expect(learnerHardStops(ctx()).converted).toBe(false);
    expect(learnerHardStops(cpn()).converted).toBe(false);
  });

  it('unsubscribed and dnc read T304\'s structured evidence, not a regex over free text', () => {
    expect(learnerHardStops(ctx({ contact: contact({ email: channel(false, 'unsubscribe_event_email', 'suppression') }) })).unsubscribed).toBe(true);
    expect(learnerHardStops(ctx({ contact: contact({ email: channel(false, 'lead_complained', 'lead_status') }) })).unsubscribed).toBe(true);
    expect(learnerHardStops(ctx({ contact: contact({ sms: channel(false, 'lead_dnd', 'lead_status') }) })).dnc).toBe(true);
    // A bounce closes the channel and is NOT a tier-0 stop — Explorer's own rule.
    const bounced = learnerHardStops(ctx({ contact: contact({ email: channel(false, 'lead_bounced', 'lead_status') }) }));
    expect(bounced.unsubscribed).toBe(false);
    expect(bounced.dnc).toBe(false);
  });

  it('consentRevoked only when a consent-evaluated channel says revoked', () => {
    expect(learnerHardStops(ctx({ contact: contact({ voice: channel(false, 'revoked', 'consent') }) })).consentRevoked).toBe(true);
    expect(learnerHardStops(ctx({ contact: contact({ voice: channel(false, 'revoked', 'brand_preference') }) })).consentRevoked).toBe(false);
  });

  it('never clears a flag the context builder set, and passes the two it cannot source through', () => {
    const set = { converted: true, unsubscribed: true, dnc: true, consentRevoked: true, killSwitch: true, campaignInactive: true };
    expect(learnerHardStops(ctx({ hardStop: set }))).toEqual(set);
    expect(learnerHardStops(ctx({ hardStop: { ...NO_STOPS, killSwitch: true } })).killSwitch).toBe(true);
  });
});

/* ── through the pipeline ──────────────────────────────────────────────────── */

describe('through decideForSubject', () => {
  it('a Training learner: the arbiter picks Explorer\'s activation rescue, with the Training campaign attached', async () => {
    const out = await decideForSubject(ctx(), learnerStrategy, deps(), flags());
    expect(out.status).toBe('decided');
    if (out.status !== 'decided') return;
    expect(out.decision.selected_action).toBe('SEND_EMAIL');
    expect(out.decision.candidates.map((c) => c.campaign_key)).toEqual(['explorer_activation_restart', 'explorer_weekly_digest']);
    // The arbiter's wording is Explorer's to choose; what matters is that the
    // weekly digest lost to the tier-6 rescue.
    expect(out.decision.suppressed).toHaveLength(1);
    expect(out.decision.suppressed[0].campaign_key).toBe('explorer_weekly_digest');
    expect(out.decision.suppressed[0].reason).toContain('tier 6');
    expect(out.decision.ruleset_version).toBe('p3-learner-v1');
  });

  it('a CPN scholarship lead with a classification: the grounded nurture reaches the content gate', async () => {
    const out = await decideForSubject(cpn(), learnerStrategy, deps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('SEND_EMAIL');
    expect(out.decision.selected_path).toBe('learner_free_training');
    expect(out.decision.candidates).toHaveLength(1);
    expect(out.decision.candidates[0].campaign_key).toBeNull();
  });

  it('a CPN lead with nothing to ground: WAIT, and the reason names the missing profile', async () => {
    const out = await decideForSubject(cpn({ classification: null }), learnerStrategy, deps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.selected_action).toBe('WAIT');
    expect(out.decision.reason).toBe('no_candidate:no_learner_profile:no_classification');
    expect(out.decision.candidates).toEqual([]);
  });

  it('an opted-out learner in conversation is a HARD STOP, not a human-review case - the verifier\'s Probe B', async () => {
    // Before the retry this recorded `every_candidate_needs_an_unknown_input`
    // with `requires_human_review: true` where Explorer records
    // `hard stop: unsubscribed`: the row mis-stated why, and once Phase 4
    // sources the human inputs a CREATE_HUMAN_TASK would have won for a person
    // who opted out. Every channel closed by lead status, as T304 stamps it.
    const closed = (reason: string) => channel(false, reason, 'lead_status');
    const out = await decideForSubject(
      ctx({
        learner: facts({ overlays: ['IN_CONVERSATION'] }),
        contact: contact({
          email: closed('lead_unsubscribed'),
          sms: closed('lead_unsubscribed'),
          voice: closed('lead_unsubscribed'),
          in_app: closed('lead_unsubscribed'),
        }),
      }),
      learnerStrategy,
      deps(),
      flags(),
    );
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.reason).toBe('hard_stop:unsubscribed');
    expect(out.decision.requires_human_review).toBe(false);
    expect(out.decision.candidates).toEqual([]);
  });

  it('a converted learner is a hard stop before any generator runs', async () => {
    const out = await decideForSubject(ctx({ learner: facts({ primary_state: 'CONVERTED' }) }), learnerStrategy, deps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.reason).toBe('hard_stop:converted');
  });

  it('the pipeline\'s own refusal class is unchanged for a strategy without the hook', async () => {
    const mute = { program_kind: 'business' as const, ruleset_version: 'x', hardStops: (c: JourneySubjectContext) => c.hardStop, generate: () => [] };
    const out = await decideForSubject(ctx(), mute, deps(), flags());
    if (out.status !== 'decided') throw new Error('disabled');
    expect(out.decision.reason).toBe('no_candidate');
  });
});

/* ── what the module is, and is not ────────────────────────────────────────── */

describe('the strategy is pure and writes nowhere; the loader reads and writes nowhere', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', 'strategies', f), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('learnerStrategy.ts has no I/O, no clock and no flag read of its own', () => {
    const code = strip(read('learnerStrategy.ts'));
    for (const banned of ['sequelize', 'findAll', 'findOne', 'Date.now', 'new Date(', 'console.', 'process.env', 'runGovernor', 'decideForLearner', 'ExplorerJourneyDecision', 'explorer_journey_decisions']) {
      expect({ banned, present: code.includes(banned) }).toEqual({ banned, present: false });
    }
    // Control: the scan reads the real file.
    expect(code).toContain('generateLearnerCandidates');
  });

  it('learnerFacts.ts reads through the facade and Explorer\'s reader, and never writes', () => {
    const code = strip(read('learnerFacts.ts'));
    for (const banned of ['.create(', '.update(', '.upsert(', '.destroy(', 'bulkCreate', 'runGovernor', 'decideForLearner', 'ExplorerJourneyDecision', 'explorer_journey_decisions', "from '../../../models'"]) {
      expect({ banned, present: code.includes(banned) }).toEqual({ banned, present: false });
    }
    expect(code).toContain("from '../explorerFacade'");
    expect(code).toContain('readLearnerSignals');
    expect(code).toContain('scoreLearner');
  });

  it('the classification nurture\'s intra-tier score is a constant position, not a measurement', () => {
    const a = classificationNurture(cpn());
    const b = classificationNurture(cpn({ lead_id: 902, subject_ref: 'lead:902' }));
    expect(a?.intra_tier_score).toBe(30);
    expect(b?.intra_tier_score).toBe(30);
  });
});
