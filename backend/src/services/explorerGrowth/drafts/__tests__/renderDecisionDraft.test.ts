import type { SequenceStep } from '../../../../models/FollowUpSequence';
import {
  EXPLORER_DRAFT_REJECTED_STATUS,
  EXPLORER_DRAFT_STATUS,
  type DraftableDecision,
  type PersistDraftInput,
} from '../draftContracts';
import {
  describeContentAssets,
  planDecisionDraft,
  renderDecisionDraft,
  type DraftRenderDeps,
} from '../renderDecisionDraft';

/**
 * One decision becoming one draft.
 *
 * Dependencies are injected, so these tests provoke the cases that matter and
 * are awkward to reach through real I/O: the quality gate refusing copy, the
 * generator throwing, and a campaign whose sequence is empty.
 */

function step(over: Partial<SequenceStep> = {}): SequenceStep {
  return {
    delay_days: 0,
    channel: 'email',
    subject: 'This week in AI, for practitioners',
    body_template: '',
    max_attempts: 1,
    step_goal: 'Stay useful to someone not currently in a lesson',
    ai_tone: 'warm, direct, not salesy',
    ai_instructions: 'General nurture for a learner who is not mid-lesson.',
    ...over,
  };
}

function decision(over: Partial<DraftableDecision> = {}): DraftableDecision {
  return {
    id: 'd1',
    enrollment_id: 'e1',
    lead_id: 42,
    decision_date: '2026-10-27',
    selected_action: 'SEND_EMAIL',
    selected_campaign_id: 'c1',
    channel: 'email',
    scheduled_email_id: null,
    selected_content_assets: [],
    reason: 'nurture',
    ...over,
  };
}

/**
 * A stand-in CompositeContext.
 *
 * `as any` is deliberate and is the narrower choice here: the real interface
 * has ~40 fields across six nested objects, and spelling all of them out would
 * make these tests assert the shape of a fixture rather than the behaviour of
 * the renderer. The fields this module actually reads are set explicitly.
 */
function context(over: Record<string, any> = {}): any {
  return {
    lead: {
      name: 'Dana Reyes',
      firstName: 'Dana',
      email: 'dana@example.com',
      company: 'Northwind',
      title: 'Director of Analytics',
      industry: 'Logistics',
      phone: '',
      temperature: 'warm',
      pipelineStage: 'nurture',
      score: 61,
      notes: '',
    },
    campaign: {
      name: 'Explorer Weekly Intelligence Digest',
      type: 'nurture',
      senderName: 'Colaberry Enterprise AI team',
      senderRelationship: 'ongoing',
      step: 0,
      totalSteps: 3,
      stepGoal: 'Stay useful',
    },
    engagement: {},
    previousMessages: [],
    allowedUrls: { booking: 'https://enterprise.colaberry.ai/book', landingPage: '', mainSite: '' },
    explorer: { dates: [], prices: [], seats: [] },
    ...over,
  };
}

interface Harness {
  deps: DraftRenderDeps;
  committed: Array<{ input: PersistDraftInput; decisionId: string }>;
  generatedWith: any[];
}

function harness(over: Partial<DraftRenderDeps> = {}): Harness {
  const committed: Harness['committed'] = [];
  const generatedWith: any[] = [];
  const deps: DraftRenderDeps = {
    loadSequenceSteps: async () => [step(), step({ subject: 'Second' }), step({ subject: 'Third' })],
    countPriorDrafted: async () => 0,
    loadRecipientEmail: async () => 'dana@example.com',
    buildContext: async () => context(),
    generate: async (params) => {
      generatedWith.push(params);
      return { subject: 'Generated subject', body: '<p>Generated body</p>', tokens_used: 400, model: 'gpt-x' };
    },
    validate: (content) => ({ valid: true, content, issues: [], autoFixed: [] }),
    commitDraft: async (input, decisionId) => {
      committed.push({ input, decisionId });
      return 'se-new';
    },
    ...over,
  };
  return { deps, committed, generatedWith };
}

describe('the happy path', () => {
  it('generates, validates, persists an unsendable draft, and links the decision', async () => {
    const h = harness();
    const out = await renderDecisionDraft(decision(), h.deps);

    expect(out.status).toBe('drafted');
    expect(out.scheduled_email_id).toBe('se-new');
    expect(out.step_index).toBe(0);
    expect(h.committed).toHaveLength(1);

    const { input, decisionId } = h.committed[0];
    expect(input.status).toBe(EXPLORER_DRAFT_STATUS);
    expect(input.body).toBe('<p>Generated body</p>');
    expect(input.subject).toBe('Generated subject');
    expect(input.to_email).toBe('dana@example.com');
    // The decision id goes to the SAME call that writes the draft, so the two
    // cannot commit independently.
    expect(decisionId).toBe('d1');
  });

  it('never writes the one status the sender would claim', async () => {
    const h = harness();
    await renderDecisionDraft(decision(), h.deps);
    expect(h.committed[0].input.status).not.toBe('pending');
  });

  it('falls back to the seeded subject when the model returns none', async () => {
    // All 24 steps carry a real subject even though every body_template is
    // empty, so there is always something true to fall back to.
    const h = harness({
      generate: async () => ({ body: '<p>b</p>', tokens_used: 1, model: 'm' }),
    });
    await renderDecisionDraft(decision(), h.deps);
    expect(h.committed[0].input.subject).toBe('This week in AI, for practitioners');
  });

  it('records the step index on the draft and in the outcome', async () => {
    const h = harness({ countPriorDrafted: async () => 2 });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.step_index).toBe(2);
    expect(h.committed[0].input.step_index).toBe(2);
  });
});

describe('the content the digest was told to lead with', () => {
  it('puts resolved lesson cards in front of the generator', async () => {
    const h = harness();
    await renderDecisionDraft(
      decision({
        selected_content_assets: [
          { title: 'Prompt patterns that survive production', summary: 'Why few-shot drifts' },
          { title: 'Evals before agents', summary: 'Measure first', url: 'https://x/y' },
        ],
      }),
      h.deps,
    );

    const instructions = h.generatedWith[0].ai_instructions as string;
    expect(instructions).toContain('Prompt patterns that survive production');
    expect(instructions).toContain('Evals before agents');
    // It must still carry the step's own brief, not replace it.
    expect(instructions).toContain('General nurture for a learner who is not mid-lesson.');
  });

  it('rides on ai_instructions, NOT context_notes', async () => {
    // `buildUserPrompt` returns early when a composite context is present and
    // never reads `context_notes` on that path. Passing the assets there would
    // look like grounding and supply none.
    const h = harness();
    await renderDecisionDraft(
      decision({ selected_content_assets: [{ title: 'A lesson' }] }),
      h.deps,
    );
    expect(h.generatedWith[0].ai_instructions).toContain('A lesson');
    expect(h.generatedWith[0].context_notes).toBeUndefined();
  });

  it('adds nothing when no asset resolved', () => {
    expect(describeContentAssets([])).toBe('');
    // A row with no usable title contributes no line rather than "- undefined".
    expect(describeContentAssets([{ summary: 'orphan' }])).toBe('');
  });

  it('tells the model not to invent a lesson that was not supplied', () => {
    expect(describeContentAssets([{ title: 'A lesson' }])).toContain('do not invent');
  });
});

describe('when the quality gate refuses the copy', () => {
  const refusing: Partial<DraftRenderDeps> = {
    validate: (content) => ({
      valid: false,
      content,
      issues: ['Ungrounded date: November 12'],
      autoFixed: [],
    }),
  };

  it('KEEPS the draft, marked rejected, with the reasons on the row', async () => {
    // Discarding it would reproduce the exact confusion this phase exists to
    // fix: a decision with no message and no way to tell why.
    const h = harness(refusing);
    const out = await renderDecisionDraft(decision(), h.deps);

    expect(out.status).toBe('rejected');
    expect(out.scheduled_email_id).toBe('se-new');
    expect(out.issues).toEqual(['Ungrounded date: November 12']);
    expect(h.committed[0].input.status).toBe(EXPLORER_DRAFT_REJECTED_STATUS);
    expect(h.committed[0].input.metadata.quality_gate).toMatchObject({
      valid: false,
      issues: ['Ungrounded date: November 12'],
    });
  });

  it('a rejected draft is still not sendable', async () => {
    const h = harness(refusing);
    await renderDecisionDraft(decision(), h.deps);
    expect(h.committed[0].input.status).not.toBe('pending');
  });

  it('re-reads the verdict rather than trusting generateMessage to have acted on it', async () => {
    // generateMessage calls the validator internally but keeps only the
    // auto-fixed CONTENT and throws away `valid` and `issues`. If this module
    // stopped calling validate itself, a refusal would persist as a clean
    // draft — so assert the call happens.
    const validate = jest.fn((content: string) => ({
      valid: true,
      content,
      issues: [],
      autoFixed: [],
    }));
    const h = harness({ validate });
    await renderDecisionDraft(decision(), h.deps);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith('<p>Generated body</p>', expect.anything(), 'email');
  });

  it('records whether the fact guard was even in force', async () => {
    // Absent means "not treated as an Explorer send, guard off". Empty means
    // "Explorer with nothing quotable", the STRICTEST state. Conflating the
    // two would make a disabled guard look like a passing one.
    const off = harness({ buildContext: async () => context({ explorer: undefined }) });
    await renderDecisionDraft(decision(), off.deps);
    expect(off.committed[0].input.metadata.quality_gate.fact_set_present).toBe(false);

    const on = harness();
    await renderDecisionDraft(decision(), on.deps);
    expect(on.committed[0].input.metadata.quality_gate.fact_set_present).toBe(true);
  });
});

describe('failure paths never cost the rest of the batch', () => {
  it('reports a generator failure as an outcome instead of throwing', async () => {
    const h = harness({
      generate: async () => {
        const e = new Error('upstream timed out');
        e.name = 'TimeoutError';
        throw e;
      },
    });
    const out = await renderDecisionDraft(decision(), h.deps);

    expect(out.status).toBe('failed');
    expect(out.reason).toBe('generation_failed');
    expect(out.issues).toContain('TimeoutError');
    // Nothing half-written.
    expect(h.committed).toHaveLength(0);
  });

  it('reports a context-build failure the same way', async () => {
    const h = harness({
      buildContext: async () => {
        throw new Error('db gone');
      },
    });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('failed');
    expect(h.committed).toHaveLength(0);
  });

  it('skips a campaign whose sequence is empty, and generates nothing', async () => {
    const h = harness({ loadSequenceSteps: async () => [] });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.status).toBe('skipped');
    expect(out.reason).toBe('no_sequence_steps');
    expect(h.generatedWith).toHaveLength(0);
  });

  it('skips a lead with no email, and generates nothing', async () => {
    const h = harness({ loadRecipientEmail: async () => null });
    const out = await renderDecisionDraft(decision(), h.deps);
    expect(out.reason).toBe('no_recipient_email');
    expect(h.generatedWith).toHaveLength(0);
  });

  it('treats a blank email as no email', async () => {
    const h = harness({ loadRecipientEmail: async () => '' });
    expect((await renderDecisionDraft(decision(), h.deps)).reason).toBe('no_recipient_email');
  });
});

describe('idempotency', () => {
  it('a decision that already carries a draft generates nothing on a re-run', async () => {
    const h = harness();
    const out = await renderDecisionDraft(decision({ scheduled_email_id: 'se-old' }), h.deps);
    expect(out.status).toBe('skipped');
    expect(out.reason).toBe('already_drafted');
    expect(h.generatedWith).toHaveLength(0);
    expect(h.committed).toHaveLength(0);
  });

  it('running the same unrendered decision twice yields the same step index', async () => {
    // The prior count excludes the row being rendered, so a replay cannot
    // advance the sequence. This is the assertion that fails if someone
    // "simplifies" countPriorDrafted to count drafts up to and including today.
    const h = harness({ countPriorDrafted: async () => 1 });
    const first = await renderDecisionDraft(decision(), h.deps);
    const second = await renderDecisionDraft(decision(), h.deps);
    expect(first.step_index).toBe(second.step_index);
    expect(second.step_index).toBe(1);
  });
});

describe('planDecisionDraft is the dry run, and it spends nothing', () => {
  it('resolves the full plan without a generator or a writer', async () => {
    const h = harness();
    const plan = await planDecisionDraft(decision(), h.deps);
    expect(plan).toMatchObject({ ok: true, stepIndex: 0, toEmail: 'dana@example.com', totalSteps: 3 });
    expect(h.generatedWith).toHaveLength(0);
    expect(h.committed).toHaveLength(0);
  });

  it('reports the same reason the live path would skip on', async () => {
    const h = harness({ loadRecipientEmail: async () => null });
    expect(await planDecisionDraft(decision(), h.deps)).toEqual({
      ok: false,
      reason: 'no_recipient_email',
    });
  });
});
