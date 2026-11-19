/**
 * OH1o: an Explorer draft gets the countdown's signals (profile, memory, earlier emails), passes the
 * SAME screen the campaign/countdown copy passes plus the Explorer guards, records what the brain
 * passed, and - only while Explorer sending is on - goes to Outbound approvals wrapped in Maya's
 * campaign signature. The Brain tab's sample renders three consecutive emails and writes nothing.
 */
import type { SequenceStep } from '../../../../models/FollowUpSequence';
import type { BrainGather } from '../../explorerBrainPick';
import { EXPLORER_DRAFT_REJECTED_STATUS, EXPLORER_DRAFT_STATUS, type DraftableDecision, type PersistDraftInput } from '../draftContracts';
import { renderDecisionDraft, type DraftRenderDeps } from '../renderDecisionDraft';
import { enqueueExplorerDraft } from '../explorerApproval';
import { renderBrainSample } from '../brainSample';
import { resolveBrainRules } from '../../brainRules';
import { screenEventReminderCopy } from '../../../openHouseCountdown';
import { wrapEmailHtml } from '../../../email/campaignEmailWrapper';

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
    lead: { name: 'Dana Reyes', firstName: 'Dana', email: 'dana@example.com', company: '', title: 'Data Analyst', industry: 'Data Analytics' },
    campaign: { name: 'Explorer Digest', type: 'nurture', senderName: 'Maya', stepGoal: 'Stay useful' },
    engagement: { emailsSent: 0, repliesReceived: 0 }, previousMessages: [],
    allowedUrls: { booking: 'https://enterprise.colaberry.ai/book', landingPage: '', mainSite: '' },
    explorer: { dates: [], prices: [], seats: [] },
  };
}

const builderShelf: BrainGather = async (piece) =>
  piece === 'builder_spotlight'
    ? { piece, block: 'A REAL BUILDER\n- Sam, built an intake agent', allowedLinks: ['https://hire.refactored.ai/case-studies/sam'], itemId: 'builder:sam' }
    : null;

function harness(over: Partial<DraftRenderDeps> = {}, body = '<p>Hi Dana, Sam built an intake agent that answers in seconds.</p>') {
  const committed: Array<{ input: PersistDraftInput }> = [];
  const generatedWith: any[] = [];
  const queued: any[] = [];
  const deps: DraftRenderDeps = {
    loadSequenceSteps: async () => [step()],
    countPriorDrafted: async () => 0,
    loadRecipientEmail: async () => 'dana@example.com',
    buildContext: async () => context(),
    generate: async (params) => { generatedWith.push(params); return { subject: 'A builder worth meeting', body, tokens_used: 1, model: 'm', copy_flags: [] }; },
    validate: (content) => ({ valid: true, content, issues: [], autoFixed: [] }),
    ground: async () => ({ available: false, reason: 'not_configured' }),
    resolveBrandVoice: async () => ({ name: 'Colaberry', rulesVersion: 0 }),
    commitDraft: async (input) => { committed.push({ input }); return 'se-new'; },
    recommitDraft: async () => ({ id: 'se-v2', supersededId: null }),
    loadBrainHistory: async () => [],
    gatherBrainPiece: builderShelf,
    inOpenHouseCountdown: async () => false,
    loadSignals: async () => ({ profile: 'WHO THEY ARE\n- First name: Dana\n- Stage: exploring', memory: '[Nov 12] Dana (chat): how do I start?' }),
    loadEarlierEmails: async () => [],
    enqueueForApproval: async (input) => { queued.push(input); return { id: 'q1', deduped: false }; },
    ...over,
  };
  return { deps, committed, generatedWith, queued };
}

describe('C: the same signals the countdown gets', () => {
  it('the profile, the memory and the earlier emails are in the prompt, and facts come only from the profile', async () => {
    const h = harness({ loadEarlierEmails: async () => [{ subject: 'Last week', body: '<p>Hi Dana, here is a fact about agents.</p>', date: '2026-11-15' }] });
    await renderDecisionDraft(decision(), h.deps);
    const ins: string = h.generatedWith[0].ai_instructions;
    expect(ins).toContain('WHO THEY ARE (the only facts you may use about this person');
    expect(ins).toContain('Stage: exploring');
    expect(ins).toContain('how do I start?');
    expect(ins).toContain('EARLIER EMAILS YOU ALREADY SENT THEM');
    expect(ins).toContain('Last week');
    expect(h.generatedWith[0].campaignContext.system_prompt).toContain('Never assume a background, role, industry or skill');
    // The CRM's guesses ("Data Analyst", "Data Analytics") are not handed to the model.
    expect(h.generatedWith[0].lead).toEqual(expect.objectContaining({ title: '', industry: '', company: '' }));
    expect(JSON.stringify(h.generatedWith[0].compositeContext.lead)).not.toContain('Data Analytics');
    // The validator sees the full earlier bodies.
    expect(h.generatedWith[0].compositeContext.previousMessages[0].bodyPreview).toContain('here is a fact about agents');
  });
  it('the voice comes from the brain rules', async () => {
    const voice = 'You are Maya. Write like a friendly coach: two short paragraphs, one concrete next step, no fluff at all.';
    const h = harness({ loadBrainRules: async () => resolveBrainRules({ ...resolveBrainRules(null).rules, explorerVoice: voice }).rules });
    await renderDecisionDraft(decision(), h.deps);
    expect(h.generatedWith[0].campaignContext.system_prompt.startsWith(voice)).toBe(true);
  });
});

describe('B: the same validation as campaigns, plus the Explorer guards', () => {
  const failingCampaignCopy = [
    '<p>Hi Dana, our program has a 20% discount this week.</p>',
    '<p>Hi Dana, the tuition is easy.</p>',
    '<p>Hi Dana, see https://evil.example.com/x</p>',
    '<p>Hi Dana, it is free to join.</p>',
  ];
  it.each(failingCampaignCopy)('a draft the campaign screen refuses is refused here too: %s', async (body) => {
    expect(screenEventReminderCopy('Subject', body, 'https://enterprise.colaberry.ai/portal/class-checkin/x').filter((p) => p !== 'missing the Join link').length).toBeGreaterThan(0);
    const h = harness({}, body);
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('rejected');
    expect(h.committed[0].input.status).toBe(EXPLORER_DRAFT_REJECTED_STATUS);
    expect(h.queued).toHaveLength(0);
  });
  it('"feel free to" is rewritten the way the countdown rewrites it, and the draft passes (Nov 18 sample)', async () => {
    const h = harness({}, '<p>Hi Dana, Sam built an intake agent. Feel free to reply with questions.</p>');
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('drafted');
    expect(h.committed[0].input.body).toContain("You're welcome to reply");
    expect(h.committed[0].input.body).not.toMatch(/\bfree\b/i);
  });
  it('a draft that re-says an earlier email is refused', async () => {
    const same = '<p>Hi Dana, Sam built an intake agent that answers in seconds.</p>';
    const h = harness({ loadEarlierEmails: async () => [{ subject: 'A builder worth meeting', body: same, date: '2026-11-15' }] }, same);
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('rejected');
    expect(out.issues.join(' ')).toMatch(/repeats an earlier email/);
    expect(out.issues).toContain('reuses an earlier subject line');
  });
  it('the never-say phrases from the brain rules reject a draft', async () => {
    const h = harness({ loadBrainRules: async () => resolveBrainRules({ ...resolveBrainRules(null).rules, neverSay: ['intake agent'] }).rules });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.issues).toContain('never-say: "intake agent"');
  });
  it('the campaign subject check runs on the subject', async () => {
    const validateSubject = jest.fn((s: string) => ({ subject: `${s} (checked)`, issues: [] }));
    const h = harness({ validateSubject });
    await renderDecisionDraft(decision(), h.deps);
    expect(validateSubject).toHaveBeenCalled();
    expect(h.committed[0].input.subject).toBe('A builder worth meeting (checked)');
  });
});

describe('D: what the brain passed is stored on the draft', () => {
  it('profile, content piece (shelf, item, block), memory excerpt, screen result and overlap', async () => {
    const h = harness();
    await renderDecisionDraft(decision(), h.deps);
    const snap = (h.committed[0].input.metadata as any).brain_snapshot;
    expect(snap.profile).toContain('First name: Dana');
    expect(snap.memory_excerpt).toContain('how do I start?');
    expect(snap.piece).toEqual(expect.objectContaining({ shelf: 'builder_spotlight', item_id: 'builder:sam', block: expect.stringContaining('Sam') }));
    expect(snap.screen).toEqual({ passed: true, issues: [], overlap_pct: 0 });
  });
});

describe('the approval queue: only a passing draft, only while sending is on, never a send', () => {
  it('a passing draft is queued with its draft id', async () => {
    const h = harness();
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('drafted');
    expect(h.committed[0].input.status).toBe(EXPLORER_DRAFT_STATUS);
    expect(h.queued).toEqual([expect.objectContaining({ scheduledEmailId: 'se-new', decisionId: 'd1', leadId: 42, toEmail: 'dana@example.com' })]);
    expect(out.outbound_approval_id).toBe('q1');
  });
  it('a queue failure never loses the draft', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness({ enqueueForApproval: async () => { throw new Error('db'); } });
    const out = await renderDecisionDraft(decision(), h.deps);
    warn.mockRestore();
    expect(out.status).toBe('drafted');
    expect(out.scheduled_email_id).toBe('se-new');
  });
  it('enqueueExplorerDraft: nothing queued while explorer_growth_send_enabled is off', async () => {
    const enqueue = jest.fn();
    const r = await enqueueExplorerDraft(
      { scheduledEmailId: 'se1', decisionId: 'd1', leadId: 42, toEmail: 'dana@example.com', subject: 'S', body: '<p>Hi</p>' },
      { sendEnabled: async () => false, wrap: async (_l, _t, b) => b, enqueue },
    );
    expect(r).toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("A: when on, the queued bytes carry Maya's campaign signature, and the row is keyed to the draft", async () => {
    const enqueue = jest.fn(async () => ({ id: 'q1', deduped: false }));
    await enqueueExplorerDraft(
      { scheduledEmailId: 'se1', decisionId: 'd1', leadId: 42, toEmail: 'dana@example.com', subject: 'S', body: '<p>Hi Dana</p>' },
      {
        sendEnabled: async () => true,
        wrap: async (_l, _t, b) => wrapEmailHtml(b, { senderName: 'Maya at Colaberry', senderEmail: 'maya@colaberry.com', unsubscribeUrl: 'https://u' }),
        enqueue,
      },
    );
    const row = (enqueue.mock.calls[0] as any[])[0];
    expect(row.body).toContain('<p>Hi Dana</p>');
    expect(row.body).toContain('Director of Admissions');
    expect(row.body).toContain('Maya at Colaberry');
    expect(row).toEqual(expect.objectContaining({
      recipientRef: 'lead:42', composedBy: 'explorer_growth:d1', correlationId: 'se1', idempotencyKey: 'explorer-draft-se1', capability: 'sendEmail',
    }));
  });
});

describe('E4: the sample shows three consecutive emails per person and writes nothing', () => {
  it('three emails 3 days apart, three different shelves, never queued or committed', async () => {
    const shelves: BrainGather = async (piece, _seed, person) => {
      const id = `${piece}:1`;
      if ((person.excludeItemIds ?? []).includes(id)) return null;
      if (['builder_spotlight', 'ai_fact', 'community_pulse', 'live_event', 'build_prompt'].includes(piece)) {
        return { piece, block: `PIECE ${piece}`, allowedLinks: [], itemId: id };
      }
      return null;
    };
    let n = 0;
    const commitDraft = jest.fn();
    const enqueueForApproval = jest.fn();
    const base = harness({
      gatherBrainPiece: shelves,
      commitDraft, enqueueForApproval,
      generate: async () => { n++; return { subject: `Subject ${n}`, body: `<p>Hi Dana, email number ${n} says something entirely new each time ${'x'.repeat(n)}.</p>`, tokens_used: 1, model: 'm', copy_flags: [] }; },
    });
    const result = await renderBrainSample({ people: 1, emailsEach: 3 }, {
      candidates: async () => [{ id: 'd1' }],
      loadDecision: async () => decision(),
      baseDeps: () => base.deps,
      wrap: async (_l, _t, b) => `<wrapped>${b}</wrapped>`,
      today: () => '2026-11-18',
    });
    expect(commitDraft).not.toHaveBeenCalled();
    expect(enqueueForApproval).not.toHaveBeenCalled();
    const emails = result.people[0].emails;
    expect(emails.map((e) => e.date)).toEqual(['2026-11-18', '2026-11-21', '2026-11-24']);
    const shelvesUsed = emails.map((e) => (e.snapshot as any)?.piece?.shelf);
    expect(new Set(shelvesUsed).size).toBe(3);
    expect(emails.every((e) => e.html?.startsWith('<wrapped>'))).toBe(true);
    expect(result.people[0].recipient_masked).toBe('d***@example.com');
  });
});
