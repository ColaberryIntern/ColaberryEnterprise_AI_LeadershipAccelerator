import * as fs from 'fs';
import * as path from 'path';
import {
  composeQuotedEmail,
  quotableMaterialForMaya,
  COMPOSER_AGENT_NAME,
  type QuoteComposeDeps,
} from '../mayaQuoteComposer';
import { FREE_WORD_RULE } from '../content/bannedCopyRule';
import type { QuotableAssetSet } from '../content/quotableAssets';

/**
 * Maya composing from marketing material.
 *
 * The suite is organised around the claim that matters: NOTHING HERE CAN SEND. That rests on
 * three independent facts, and each gets its own test, so removing any one of them fails the
 * build rather than quietly leaving the other two carrying a load they were not sized for.
 */

/** Real production rows, read on 2026-11-04. */
const WELCOME = { id: '4f848072-9fcd-47ac-a1c2-c633eab7e0f8', title: 'Welcome to Your AI Preview', summary: 'Start here.', url: 'https://x.test/a' };
const KNOWLEDGE = { id: '02023336-4f00-4366-a01e-90eb336a8652', title: 'Knowledge Check', summary: null, url: null };
const COLAB = { id: '96434b94-356d-4ea2-831f-c5139c269ff9', title: 'Google Colab - Free Jupyter Notebooks', rule_ids: [FREE_WORD_RULE.id] };

const assetSet = (over: Partial<QuotableAssetSet> = {}): QuotableAssetSet => ({
  quotable: [WELCOME, KNOWLEDGE],
  refused: [COLAB],
  considered: 3,
  ...over,
});

const LEAD = { id: 4242, email: 'learner@example.test' };

function depsWith(over: Partial<QuoteComposeDeps> = {}) {
  const draft = jest.fn().mockResolvedValue({
    outcome: 'drafted', reason: 'no_brand_scope', draftId: 'draft-1',
    autonomyLevel: 'observe', toolGranted: false,
  });
  const deps: QuoteComposeDeps = {
    listAssets: jest.fn().mockResolvedValue(assetSet()),
    resolveLead: jest.fn().mockResolvedValue(LEAD),
    draft,
    ...over,
  } as unknown as QuoteComposeDeps;
  return { deps, draft: deps.draft as unknown as jest.Mock };
}

const req = (over: Record<string, unknown> = {}) => ({
  visitorId: 'v1', subject: 'Your next step', body: 'Here is where to start.', assetIds: [WELCOME.id], ...over,
});

describe('nothing here can send, and each reason stands alone', () => {
  const COMPOSER = fs.readFileSync(path.join(__dirname, '..', 'mayaQuoteComposer.ts'), 'utf8');
  const EMAIL_TOOL = fs.readFileSync(
    path.join(__dirname, '..', 'agents', 'tools', 'agentEmailTool.ts'), 'utf8',
  );

  it('FACT 1: the email tool has no transport - it never returns a sent outcome', () => {
    const outcomes = Array.from(EMAIL_TOOL.matchAll(/outcome: '(\w+)'/g)).map((m) => m[1]);
    expect(outcomes.length).toBeGreaterThan(0);          // control: the extractor found some
    expect(outcomes).toContain('drafted');               // control: and it reads real ones
    expect(outcomes).not.toContain('sent');
  });

  it('FACT 2: this caller passes no campaignId, so brand scope is always missing', async () => {
    const { deps, draft } = depsWith();
    await composeQuotedEmail(req(), deps);
    expect(draft).toHaveBeenCalledTimes(1);
    const sent = draft.mock.calls[0][0];
    expect(sent.campaignId).toBeUndefined();
    expect(Object.keys(sent)).not.toContain('campaignId');
    // And the source carries no campaign id either, so it cannot be added by a default.
    expect(COMPOSER).not.toMatch(/campaignId:\s*[^u]/);
  });

  it('FACT 3: the draft status the tool writes is not the one the scheduler claims', () => {
    expect(EMAIL_TOOL).toContain("AGENT_DRAFT_STATUS = 'agent_draft'");
    expect(EMAIL_TOOL).toContain("NOT 'pending'");
  });

  it('names no mailer anywhere in its own source', () => {
    for (const forbidden of ['mandrill', 'nodemailer', 'emailService', 'transporter']) {
      expect(COMPOSER.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('the gate on the composed message', () => {
  it('CONTROL: the matcher fires on the banned word', () => {
    expect(FREE_WORD_RULE.word).toBe('free');
  });

  it('refuses copy the MODEL wrote, even when every asset was clean', async () => {
    // The measured failure mode: clean assets, banned word in the model's own prose.
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'Join our free preview today.' }), deps);
    expect(r.outcome).toBe('refused_copy');
    expect(r.ruleIds).toEqual([FREE_WORD_RULE.id]);
    expect(r.draftId).toBeNull();
    expect(draft).not.toHaveBeenCalled();           // nothing written at all
  });

  it('screens the SUBJECT too, which reaches the inbox list unopened', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ subject: 'A free seat for you' }), deps);
    expect(r.outcome).toBe('refused_copy');
    expect(draft).not.toHaveBeenCalled();
  });

  it('a refusal always names at least one rule, so the model can correct it', async () => {
    const { deps } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'Totally free.' }), deps);
    expect(r.ruleIds.length).toBeGreaterThan(0);
    expect(r.reason).toContain('approved wording');
  });

  it('lets clean copy through to a draft', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req(), deps);
    expect(r.outcome).toBe('drafted');
    expect(r.draftId).toBe('draft-1');
    expect(r.reason).toContain('Nothing was sent');
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({
      agentName: COMPOSER_AGENT_NAME, leadId: LEAD.id, toEmail: LEAD.email,
    }));
  });
});

describe('she is the source of no price, date, deadline or seat count', () => {
  /**
   * The gap this closes: until 2026-11-04 the composer screened for banned WORDS only. Her
   * persona asks her never to state a price and `NEVER_AUTHORITATIVE_FOR` declares it, but
   * neither is a guard, so `$4,500` would have gone straight into a draft. The real
   * campaign-template library measured that day carries three of our own prices in twelve
   * bodies, and the membership price of record is $199/mo, so one of them is stale too.
   */
  it('refuses a price', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'The program is $4,500 all in.' }), deps);
    expect(r.outcome).toBe('refused_fact');
    expect(r.ungrounded).toEqual([{ kind: 'price', text: '$4,500' }]);
    expect(draft).not.toHaveBeenCalled();
  });

  it('refuses a cohort date and a seat count', async () => {
    const { deps } = depsWith();
    const dated = await composeQuotedEmail(req({ body: 'We start November 12.' }), deps);
    expect(dated.outcome).toBe('refused_fact');
    expect(dated.ungrounded.map((f) => f.kind)).toContain('date');

    const seats = await composeQuotedEmail(req({ body: 'Only 3 seats left.' }), deps);
    expect(seats.outcome).toBe('refused_fact');
    expect(seats.ungrounded.map((f) => f.kind)).toContain('seat count');
  });

  it('names the offending TEXT, not just the category', async () => {
    // "states a price" sends her hunting through her own draft; "$4,500" says what to delete.
    const { deps } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'Enroll for $4,500 today.' }), deps);
    expect(r.reason).toContain('$4,500');
    expect(r.ungrounded[0].text).toBe('$4,500');
  });

  it('reports a copy-rule breach AND a price in ONE call, not two round trips', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'A free seat, yours for $4,500.' }), deps);
    expect(r.ruleIds).toEqual([FREE_WORD_RULE.id]);
    expect(r.ungrounded.map((f) => f.text)).toContain('$4,500');
    // The enum has to pick one; the copy rule is the legal one, so it names that.
    expect(r.outcome).toBe('refused_copy');
    expect(draft).not.toHaveBeenCalled();
  });

  it('CONTROL: ordinary prose with no figures still drafts', async () => {
    // Without this, a guard that refused everything would pass every test above.
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'Happy to walk you through what we cover.' }), deps);
    expect(r.outcome).toBe('drafted');
    expect(r.ungrounded).toEqual([]);
    expect(draft).toHaveBeenCalled();
  });

  it('does not fire on a bare number that is not a price, date or seat count', async () => {
    // A guard that refused "20 minutes" would make ordinary scheduling prose unwritable, which
    // is how a gate that is working as specified still leaves a feature unusable.
    const { deps } = depsWith();
    const r = await composeQuotedEmail(req({ body: 'It runs about 20 minutes, 2 sessions.' }), deps);
    expect(r.outcome).toBe('drafted');
  });
});

describe('she cannot cite an asset she was not given', () => {
  it('refuses an id that is on the REFUSED list', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ assetIds: [WELCOME.id, COLAB.id] }), deps);
    expect(r.outcome).toBe('refused_asset');
    expect(r.unquotable).toEqual([COLAB.id]);
    expect(draft).not.toHaveBeenCalled();
  });

  it('refuses an id that does not exist at all', async () => {
    const { deps } = depsWith();
    const r = await composeQuotedEmail(req({ assetIds: ['made-up-uuid'] }), deps);
    expect(r.outcome).toBe('refused_asset');
    expect(r.unquotable).toEqual(['made-up-uuid']);
  });

  it('re-resolves the list rather than trusting an earlier one', async () => {
    // The asset was quotable when she was shown it and is not any more.
    const { deps, draft } = depsWith({
      listAssets: jest.fn().mockResolvedValue(assetSet({ quotable: [KNOWLEDGE] })),
    } as Partial<QuoteComposeDeps>);
    const r = await composeQuotedEmail(req({ assetIds: [WELCOME.id] }), deps);
    expect(r.outcome).toBe('refused_asset');
    expect(draft).not.toHaveBeenCalled();
  });

  it('allows citing nothing, because not every message quotes', async () => {
    const { deps, draft } = depsWith();
    const r = await composeQuotedEmail(req({ assetIds: [] }), deps);
    expect(r.outcome).toBe('drafted');
    expect(draft).toHaveBeenCalled();
  });
});

describe('no recipient', () => {
  it('refuses rather than drafting into the void', async () => {
    const { deps, draft } = depsWith({
      resolveLead: jest.fn().mockResolvedValue(null),
    } as Partial<QuoteComposeDeps>);
    const r = await composeQuotedEmail(req(), deps);
    expect(r.outcome).toBe('no_recipient');
    expect(draft).not.toHaveBeenCalled();
  });

  it('treats a lead with no email as no recipient, not as an empty address', async () => {
    const { deps, draft } = depsWith({
      resolveLead: jest.fn().mockResolvedValue({ id: 1, email: '' }),
    } as Partial<QuoteComposeDeps>);
    expect((await composeQuotedEmail(req(), deps)).outcome).toBe('no_recipient');
    expect(draft).not.toHaveBeenCalled();
  });
});

describe('the material handed to the model', () => {
  it('carries the digest, the assets and how many were refused', async () => {
    const listAssets = jest.fn().mockResolvedValue(assetSet());
    const r = await quotableMaterialForMaya({ listAssets } as Pick<QuoteComposeDeps, 'listAssets'>);
    expect(r.assets).toHaveLength(2);
    expect(r.refusedCount).toBe(1);
    expect(r.digest).toContain('Welcome to Your AI Preview');
    expect(r.digest).toContain(FREE_WORD_RULE.word);     // the rules travel with the material
  });

  it('never leaks the refused asset into the digest', async () => {
    const listAssets = jest.fn().mockResolvedValue(assetSet());
    const r = await quotableMaterialForMaya({ listAssets } as Pick<QuoteComposeDeps, 'listAssets'>);
    expect(r.digest).not.toContain('Google Colab');
  });
});
