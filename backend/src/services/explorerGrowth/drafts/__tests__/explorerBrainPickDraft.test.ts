import type { SequenceStep } from '../../../../models/FollowUpSequence';
import type { BrainGather, BrainPickRecord } from '../../explorerBrainPick';
import { EXPLORER_MAYA_PROMPT } from '../../explorerBrainPick';
import { bannedCopyInstruction } from '../draftCopyGuards';
import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  SENDER_CLAIMED_STATUS,
  type DraftableDecision,
  type PersistDraftInput,
} from '../draftContracts';
import { planDecisionDraft, renderDecisionDraft, type DraftRenderDeps } from '../renderDecisionDraft';

/**
 * OH1j: an Explorer draft is written as Maya around one piece of the shared brain, at most
 * once per person per 72 hours (shadow picks included), and never while their Open House
 * countdown is live. Everything stays a draft: no status the sender claims.
 */

function step(): SequenceStep {
  return {
    delay_days: 0, channel: 'email', subject: 'This week', body_template: '', max_attempts: 1,
    step_goal: 'Stay useful', ai_tone: 'warm', ai_instructions: 'General nurture.',
  };
}

function decision(over: Partial<DraftableDecision> = {}): DraftableDecision {
  return {
    id: 'd1', enrollment_id: 'e1', lead_id: 42, decision_date: '2026-11-18',
    selected_action: 'SEND_EMAIL', selected_campaign_id: 'c1', channel: 'email',
    scheduled_email_id: null, selected_content_assets: [], reason: 'nurture | campaign=explorer_weekly_digest',
    ...over,
  };
}

function context(): any {
  return {
    lead: { name: 'Dana Reyes', email: 'dana@example.com', company: '', title: '', industry: '' },
    campaign: { name: 'Explorer Digest', type: 'nurture', senderName: 'Maya', stepGoal: 'Stay useful' },
    engagement: {}, previousMessages: [],
    allowedUrls: { booking: 'https://enterprise.colaberry.ai/book', landingPage: '', mainSite: '' },
    explorer: { dates: [], prices: [], seats: [] },
  };
}

const SPOTLIGHT_URL = 'https://hire.refactored.ai/case-studies/dana-agent';

const spotlightShelf: BrainGather = async (piece) =>
  piece === 'builder_spotlight'
    ? { piece, block: 'A REAL BUILDER\n- Sam, built an intake agent', allowedLinks: [SPOTLIGHT_URL] }
    : null;

function harness(over: Partial<DraftRenderDeps> = {}, body = '<p>Hi Dana</p>') {
  const committed: Array<{ input: PersistDraftInput; decisionId: string }> = [];
  const generatedWith: any[] = [];
  const deps: DraftRenderDeps = {
    loadSequenceSteps: async () => [step()],
    countPriorDrafted: async () => 0,
    loadRecipientEmail: async () => 'dana@example.com',
    buildContext: async () => context(),
    generate: async (params) => {
      generatedWith.push(params);
      return { subject: 'S', body, tokens_used: 1, model: 'm', copy_flags: [] };
    },
    // Mirrors the real validator's URL rule: only the two Colaberry hosts are known.
    validate: (content) => {
      const issues = (content.match(/https?:\/\/[^\s"'<>)]+/gi) || [])
        .filter((u) => !/enterprise\.colaberry\.ai|advisor\.colaberry\.ai/.test(u))
        .map((u) => `Unknown URL found: ${u.substring(0, 80)}`);
      return { valid: issues.length === 0, content, issues, autoFixed: [] };
    },
    ground: async () => ({ available: false, reason: 'not_configured' }),
    resolveBrandVoice: async () => ({ name: 'Colaberry Enterprise AI Division', rulesVersion: 0 }),
    commitDraft: async (input, decisionId) => { committed.push({ input, decisionId }); return 'se-new'; },
    recommitDraft: async () => ({ id: 'se-v2', supersededId: null }),
    loadBrainHistory: async () => [],
    gatherBrainPiece: spotlightShelf,
    inOpenHouseCountdown: async () => false,
    ...over,
  };
  return { deps, committed, generatedWith };
}

describe('the draft is written as Maya around one brain piece', () => {
  it('puts the piece in the prompt, before the copy rule, and Maya in the system prompt', async () => {
    const h = harness();
    const out = await renderDecisionDraft(decision(), h.deps);

    expect(out.status).toBe('drafted');
    const sent: string = h.generatedWith[0].ai_instructions;
    expect(sent).toContain("THIS EMAIL'S CONTENT PIECE (builder_spotlight");
    expect(sent).toContain(SPOTLIGHT_URL);
    expect(sent.indexOf('CONTENT PIECE')).toBeLessThan(sent.indexOf(bannedCopyInstruction()));
    expect(sent.endsWith(bannedCopyInstruction())).toBe(true);
    expect(h.generatedWith[0].campaignContext.system_prompt).toBe(EXPLORER_MAYA_PROMPT);
  });

  it('records the piece kind and item id on the draft row metadata', async () => {
    const h = harness({
      gatherBrainPiece: async (piece) => (piece === 'ai_fact'
        ? { piece, block: 'ONE AI FACT', allowedLinks: [], itemId: 'fact-7' } : null),
    });
    await renderDecisionDraft(decision(), h.deps);
    expect(h.committed[0].input.metadata.brain_pick).toMatchObject({ piece: 'ai_fact', item_id: 'fact-7', empty: false });
    expect(h.committed[0].input.metadata.sender_persona).toBe('maya');
  });

  it("lets the piece's own link through the URL check", async () => {
    const h = harness({}, `<p>See <a href="${SPOTLIGHT_URL}">Sam's story</a></p>`);
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('drafted');
    expect(h.committed[0].input.status).toBe(EXPLORER_DRAFT_STATUS);
  });

  it('still rejects any other unknown link', async () => {
    const h = harness({}, `<p><a href="${SPOTLIGHT_URL}">story</a> and <a href="https://evil.example.com/x">this</a></p>`);
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('rejected');
    expect(out.issues).toEqual(['Unknown URL found: https://evil.example.com/x']);
    expect(h.committed[0].input.status).toBe(EXPLORER_DRAFT_REJECTED_STATUS);
  });

  it('every shelf empty -> still a safe draft, with no piece and no extra link allowed', async () => {
    const h = harness({ gatherBrainPiece: async () => null }, `<p><a href="${SPOTLIGHT_URL}">x</a></p>`);
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(h.generatedWith[0].ai_instructions).not.toContain('CONTENT PIECE');
    expect(h.committed[0].input.metadata.brain_pick).toMatchObject({ empty: true, item_id: null, allowed_links: [] });
    // With no piece, a builder link is just an unknown link again.
    expect(out.status).toBe('rejected');
  });

  it('a shelf that throws costs the piece, never the draft', async () => {
    const h = harness({ gatherBrainPiece: async () => { throw new Error('hire directory down'); } });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('drafted');
  });

  it('passes the items already given as excluded and rotates past the last kind', async () => {
    const asked: Array<{ piece: string; exclude: string[] }> = [];
    const history: BrainPickRecord[] = [{ piece: 'builder_spotlight', item_id: null, decision_date: '2026-11-14' },
      { piece: 'ai_fact', item_id: 'fact-1', decision_date: '2026-11-10' }];
    const h = harness({
      loadBrainHistory: async () => history,
      gatherBrainPiece: async (piece, _seed, person) => {
        asked.push({ piece, exclude: person.excludeItemIds ?? [] });
        return { piece, block: `${piece} block`, allowedLinks: [] };
      },
    });
    await renderDecisionDraft(decision(), h.deps);
    expect(asked[0]).toEqual({ piece: 'build_prompt', exclude: ['fact-1'] });
    expect(h.committed[0].input.metadata.brain_pick.piece).toBe('build_prompt');
  });
});

describe('cadence and precedence: held, never drafted', () => {
  it('a pick 2 days ago (shadow) holds the draft: brain_cadence', async () => {
    const h = harness({ loadBrainHistory: async () => [{ piece: 'ai_fact', item_id: 'f', decision_date: '2026-11-16' }] });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out).toMatchObject({ status: 'skipped', reason: 'brain_cadence' });
    expect(h.generatedWith).toHaveLength(0);
    expect(h.committed).toHaveLength(0);
  });

  it('a pick exactly 3 days ago allows the draft', async () => {
    const h = harness({ loadBrainHistory: async () => [{ piece: 'ai_fact', item_id: 'f', decision_date: '2026-11-15' }] });
    expect((await renderDecisionDraft(decision(), h.deps)).status).toBe('drafted');
  });

  it('an unreadable history holds the draft (fail closed)', async () => {
    const h = harness({ loadBrainHistory: async () => { throw new Error('db down'); } });
    expect(await renderDecisionDraft(decision(), h.deps)).toMatchObject({ status: 'skipped', reason: 'brain_cadence' });
  });

  it('a live Open House countdown holds the draft', async () => {
    const h = harness({ inOpenHouseCountdown: async () => true });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out).toMatchObject({ status: 'skipped', reason: 'open_house_countdown' });
    expect(h.generatedWith).toHaveLength(0);
  });

  it('an unreadable countdown check holds the draft (fail closed)', async () => {
    const h = harness({ inOpenHouseCountdown: async () => { throw new Error('db down'); } });
    expect(await renderDecisionDraft(decision(), h.deps)).toMatchObject({ reason: 'open_house_countdown' });
  });

  it('the dry run reports the same holds', async () => {
    const h = harness({ inOpenHouseCountdown: async () => true });
    expect(await planDecisionDraft(decision(), h.deps)).toEqual({ ok: false, reason: 'open_house_countdown' });
  });

  it('a regeneration does not count its own decision as the last pick', async () => {
    const seen: string[] = [];
    const h = harness({ loadBrainHistory: async (_lead, exclude) => { seen.push(exclude); return []; } });
    const out = await renderDecisionDraft(decision({ scheduled_email_id: 'se-v1' }), h.deps, { regenerate: { previousScheduledEmailId: 'se-v1' } });
    expect(seen).toEqual(['d1']);
    expect(out.status).toBe('drafted');
  });
});

describe('still shadow: nothing it writes can be claimed by the sender', () => {
  it('writes only draft statuses', async () => {
    for (const body of ['<p>ok</p>', '<p><a href="https://evil.example.com">x</a></p>']) {
      const h = harness({}, body);
      await renderDecisionDraft(decision(), h.deps);
      expect(h.committed[0].input.status).not.toBe(SENDER_CLAIMED_STATUS);
      expect([EXPLORER_DRAFT_STATUS, EXPLORER_DRAFT_REJECTED_STATUS]).toContain(h.committed[0].input.status);
    }
  });
});
