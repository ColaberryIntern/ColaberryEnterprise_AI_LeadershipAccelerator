import * as fs from 'fs';
import * as path from 'path';

/**
 * EPIC 6 T005 — `campaign_key` → `selected_campaign_id`.
 *
 * `runGovernor.ts` has said since EPIC 4 that the column "stays null until EPIC 6
 * resolves a real campaign". This is the test for that resolution.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. `runGovernorBatch` needs profiles, signal
 * reads, contactability and content resolution, so exercising it end to end here
 * would be a mock of the whole subsystem asserting against itself. The behaviour
 * that matters — that the id belongs to the campaign whose key the decision
 * named, and that a miss records a gap rather than substituting — is verified
 * against the real database in T006, over a real Governor run.
 *
 * What is asserted here is the shape of the code that produces it: the lookup is
 * hoisted, keyed on `settings.campaign_key` rather than on a name, and has no
 * fallback branch. Those are the three ways it could be silently wrong.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'runGovernor.ts'), 'utf8');

/** The file with comments removed — assertions about CODE must not match prose. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the extractor for these assertions is not blind', () => {
  it('stripped comments but left real code', () => {
    // Every assertion below is a substring check on CODE. If stripping ate the
    // file, they would all pass vacuously — this is what stops that.
    expect(CODE).toContain('export async function runGovernorBatch');
    expect(CODE.length).toBeGreaterThan(2000);
  });
});

describe('the lookup is hoisted, not run per learner', () => {
  it('loads the map once in the batch, before the profile loop', () => {
    // 8 campaigns against 143 learners is one query. A lookup inside runOne would
    // be 143 round trips every night, and would still pass a correctness test.
    const loadAt = CODE.indexOf('await loadCampaignKeyMap()');
    const loopAt = CODE.indexOf('for (const p of profiles)');
    expect(loadAt).toBeGreaterThan(-1);
    expect(loopAt).toBeGreaterThan(-1);
    expect(loadAt).toBeLessThan(loopAt);
  });

  it('passes the map into runOne rather than re-querying inside it', () => {
    expect(CODE).toContain('campaignsByKey: Map<string, string>');
    const runOneBody = CODE.slice(CODE.indexOf('async function runOne'), CODE.indexOf('export async function runGovernorBatch'));
    expect(runOneBody).not.toContain('loadCampaignKeyMap(');
  });
});

describe('resolution is by key, never by name', () => {
  it('reads settings.campaign_key to build the map', () => {
    // `campaigns` has no key column. Resolving by display name would mean an
    // Admin rename silently orphans the campaign, and the symptom —
    // selected_campaign_id going null — reads as "the Governor declined to pick".
    const loader = CODE.slice(CODE.indexOf('async function loadCampaignKeyMap'), CODE.indexOf('async function runOne'));
    expect(loader).toContain('campaign_key');
    expect(loader).not.toContain('name');
  });

  it('looks the winner up by the decision own campaign_key', () => {
    expect(CODE).toContain('campaignsByKey.get(decision.campaign_key)');
  });
});

describe('a missing campaign is a NAMED GAP, never a substitution', () => {
  it('falls back to null, not to another campaign', () => {
    // The eight keys are eight different messages. Substituting one for another
    // would send a dormant learner an enrollment offer while every count still
    // looked healthy — the failure mode is invisible, which is what makes it bad.
    expect(CODE).toContain('?? null');
    // No "find any campaign" style fallback anywhere in the file.
    expect(CODE).not.toMatch(/campaignsByKey\.values\(\)/);
    expect(CODE).not.toMatch(/type:\s*'warm_nurture'/);
  });

  it('records the gap in reason rather than dropping the decision', () => {
    expect(CODE).toContain('no campaign for key:');
    expect(CODE).toContain('campaignGap');
  });

  it('names the key in the gap text, so the report is diagnosable', () => {
    // "3 gaps" tells a reviewer nothing about WHICH campaign is missing.
    expect(CODE).toMatch(/no campaign for key: \$\{decision\.campaign_key\}/);
  });

  it('leaves the id null when the decision has no campaign_key at all', () => {
    // WAIT decisions carry campaign_key: null. That is not a gap — there is
    // nothing to resolve — so it must not be reported as one.
    //
    // Matched on collapsed whitespace: an earlier version of this assertion
    // pinned the exact line break and failed on formatting rather than on
    // behaviour, which is a test that will cost someone an hour for no defect.
    const flat = CODE.replace(/\s+/g, ' ');
    expect(flat).toContain('decision.campaign_key ? (campaignsByKey.get(decision.campaign_key) ?? null) : null');
    expect(flat).toContain('decision.campaign_key && !campaignId');
  });
});

describe('it writes the column that was previously never assigned', () => {
  it('sets selected_campaign_id in the persist payload', () => {
    expect(CODE).toContain('selected_campaign_id: campaignId');
  });

  it('does it inside the persistence block, so a dry run writes nothing', () => {
    const persistAt = CODE.indexOf('if (!dryRun)');
    const writeAt = CODE.indexOf('selected_campaign_id: campaignId');
    expect(persistAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(persistAt);
  });

  it('keeps decideForLearner free of the lookup — it must stay pure', () => {
    const decide = fs.readFileSync(path.join(__dirname, '..', 'decideForLearner.ts'), 'utf8');
    expect(decide).not.toContain('Campaign');
    expect(decide).not.toContain('campaignsByKey');
  });
});
