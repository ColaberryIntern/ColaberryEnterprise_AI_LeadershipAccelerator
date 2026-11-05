const FLAGS = { govOpportunitySweep: true, govAiVetting: true };
jest.mock('../../../../config/featureFlags', () => ({ FLAGS }));
const fetchFeed = jest.fn();
jest.mock('../oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => fetchFeed(...a) }));
const lookupContainer = jest.fn();
jest.mock('../../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: (...a: any[]) => lookupContainer(...a) }));
const claimSlot = jest.fn();
jest.mock('../govDailySlot', () => ({ claimDailySlot: (...a: any[]) => claimSlot(...a) }));
const loadFacts = jest.fn();
jest.mock('../govDiscoveryBoardFacts', () => ({ loadBoardFacts: (...a: any[]) => loadFacts(...a) }));
const dismiss = jest.fn();
jest.mock('../govOpportunityDismissals', () => ({ dismissOpportunity: (...a: any[]) => dismiss(...a) }));
const send = jest.fn();
jest.mock('../../../emailService', () => ({ sendGovOpportunitySweepEmail: (...a: any[]) => send(...a) }));

import { afterHides, centralToday, runGovOpportunitySweep } from '../govOpportunitySweep';
import { buildDiscoveryBoard, BoardFacts } from '../govDiscoveryBoard';

const opp = (uuid: string, over: any = {}) => ({ uuid, title: `Software ${uuid}`, agency: 'City', closeDate: '2099-12-01', fitScore: 70, estimatedValue: 1, sourceUrl: `https://b.example/${uuid}`, ...over });
const facts = (over: Partial<BoardFacts> = {}): BoardFacts => ({
  dismissed: new Set(), restored: new Set(), assigned: new Set(), qualifications: new Map(), vettings: new Map(), bundles: new Set(), aiEnabled: true, ...over,
});
const completed = (verdict: string, reason = `AI says ${verdict}`) => ({ status: 'completed', verdict, reason, quote: null, coveragePct: 80, errorClass: null, opportunity: null }) as any;
const live = (rows: any[]) => fetchFeed.mockResolvedValue({ source: 'live', opportunities: rows });
const sentHtml = (): string => send.mock.calls[0][0].html;

beforeEach(() => {
  jest.resetAllMocks();
  FLAGS.govOpportunitySweep = true;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  lookupContainer.mockResolvedValue({ tenant: { id: 'ten-1' }, org: { id: 'org-1' } });
  claimSlot.mockResolvedValue(true);
  loadFacts.mockResolvedValue(facts());
  dismiss.mockResolvedValue({});
  send.mockResolvedValue(undefined);
});

describe('guards', () => {
  it('flag off: nothing', async () => {
    FLAGS.govOpportunitySweep = false;
    expect((await runGovOpportunitySweep()).skipped).toBe('disabled');
    expect(fetchFeed).not.toHaveBeenCalled();
  });
  it('a degraded feed returns the June snapshot without throwing: no hide, no email', async () => {
    fetchFeed.mockResolvedValue({ source: 'snapshot', snapshotReason: 'source_failed', opportunities: [opp('old', { fitScore: 10 })] });
    expect(await runGovOpportunitySweep()).toMatchObject({ skipped: 'feed_not_live', emailed: false });
    expect(dismiss).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(claimSlot).not.toHaveBeenCalled(); // an outage does not use up the day's slot
  });
  it('no gov container: nothing', async () => {
    live([opp('a')]);
    lookupContainer.mockResolvedValue(null);
    expect((await runGovOpportunitySweep()).skipped).toBe('no_container');
    expect(send).not.toHaveBeenCalled();
  });
  it('a second scheduler instance the same day sends nothing', async () => {
    live([opp('a')]);
    claimSlot.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await runGovOpportunitySweep();
    expect((await runGovOpportunitySweep()).skipped).toBe('already_ran_today');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('one email', () => {
  it('sends exactly one, even with every section populated', async () => {
    live([opp('v'), opp('z')]);
    loadFacts.mockResolvedValue(facts({ vettings: new Map([['v', completed('pursue')]]) }));
    await runGovOpportunitySweep();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].subject).toContain('1 vetted');
    expect(send.mock.calls[0][0].subject).toContain('1 ZIP to upload');
  });
  it('a day with nothing to do still sends', async () => {
    live([opp('low', { fitScore: 10 })]);
    expect((await runGovOpportunitySweep()).emailed).toBe(true);
    expect(sentHtml()).toContain('Nothing needs you today.');
  });
  it('an empty feed is a broken feed, not a quiet day: no slot used, no "nothing needs you"', async () => {
    live([]);
    expect(await runGovOpportunitySweep()).toMatchObject({ skipped: 'feed_empty', emailed: false });
    expect(claimSlot).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it('a failed send is reported, and the hides already made still count', async () => {
    live([opp('low', { fitScore: 10 })]);
    send.mockRejectedValueOnce(new Error('smtp'));
    expect(await runGovOpportunitySweep()).toMatchObject({ hidden: 1, emailed: false });
    expect(send).toHaveBeenCalledTimes(1); // not retried: a retry can double-send
  });
  it('a dismissal read that throws does not use up the day, so another instance can still run', async () => {
    live([opp('a')]);
    loadFacts.mockRejectedValueOnce(new Error('db'));
    await expect(runGovOpportunitySweep()).rejects.toThrow('db');
    expect(claimSlot).not.toHaveBeenCalled();
  });
});

describe('hiding', () => {
  it('hides an AI pass, reports it, and takes it off the list', async () => {
    live([opp('p')]);
    loadFacts.mockResolvedValue(facts({ vettings: new Map([['p', completed('pass')]]) }));
    expect(await runGovOpportunitySweep()).toMatchObject({ hidden: 1 });
    expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ opportunityKey: 'p', reason: 'ai_not_a_fit', dismissedBy: 'gov-opp-sweep', tenantId: 'ten-1' }));
    expect(sentHtml()).toContain('Hidden this morning');
    expect(sentHtml()).toContain('AI says not a fit');
    expect(sentHtml()).not.toContain('Upload the ZIP');
  });
  it('does not hide a pass a person moved forward', async () => {
    live([opp('p')]);
    loadFacts.mockResolvedValue(facts({
      vettings: new Map([['p', completed('pass', 'Weak fit.')]]),
      qualifications: new Map([['p', { decision: 'needs_evidence', approvalRequested: false, establishedCount: 3, zipSha: 'x', title: null, agency: null, closeDate: null }]]),
    }));
    expect((await runGovOpportunitySweep()).hidden).toBe(0);
    expect(sentHtml()).toContain('Needs your read');
    expect(sentHtml()).toContain('Weak fit.');
  });
  it('does not re-hide a restored row, and it stays on the list', async () => {
    live([opp('low', { fitScore: 40 })]);
    loadFacts.mockResolvedValue(facts({ restored: new Set(['low']) }));
    expect((await runGovOpportunitySweep()).hidden).toBe(0);
    expect(dismiss).not.toHaveBeenCalled();
    expect(sentHtml()).toContain('Software low');
  });
  it.each(['restored', 'assigned', 'qualifications', 'vettings'] as const)('hides nothing when the %s read failed, and the email says the list may be incomplete', async (read) => {
    live([opp('low', { fitScore: 10 }), opp('pass')]);
    loadFacts.mockResolvedValue(facts({ failedReads: new Set([read]), vettings: new Map([['pass', completed('pass')]]) }));
    expect((await runGovOpportunitySweep()).hidden).toBe(0);
    expect(dismiss).not.toHaveBeenCalled();
    expect(sentHtml()).toContain('may be incomplete');
    expect(sentHtml()).not.toContain('Nothing needs you today.');
  });
  it('one failed hide does not stop the rest; the failed row is not reported hidden', async () => {
    live([opp('a', { fitScore: 10 }), opp('b', { fitScore: 10 })]);
    dismiss.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({});
    expect((await runGovOpportunitySweep()).hidden).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('the board and the email agree', () => {
  it('on one fixture, the same rows land in the same stages', async () => {
    const feed = [
      opp('upload1'), opp('upload2'), opp('star'), opp('read'), opp('analyze'), opp('flag', { vetVerdict: { status: 'no_bid' } }),
      opp('assigned'), opp('dismissed'), opp('low', { fitScore: 20 }), opp('pass'), opp('approved'),
    ];
    const f = facts({
      assigned: new Set(['assigned']),
      dismissed: new Set(['dismissed']),
      vettings: new Map([
        ['star', completed('pursue')], ['read', completed('inconclusive')], ['pass', completed('pass')],
        ['analyze', { ...completed('pursue'), status: 'running', verdict: null }],
      ]),
      qualifications: new Map([['approved', { decision: 'approved_bid_pursuit', approvalRequested: false, establishedCount: 2, zipSha: 'x', title: null, agency: null, closeDate: null }]]),
    });
    live(feed);
    loadFacts.mockResolvedValue(f);
    const result = await runGovOpportunitySweep();
    const html = sentHtml();

    // What the board route returns after the sweep ran.
    const hidden = dismiss.mock.calls.map(([d]) => d.opportunityKey);
    expect(hidden.sort()).toEqual(['low', 'pass']);
    const board = buildDiscoveryBoard(feed as any, afterHides(f, hidden.map((u) => ({ opportunity: opp(u) as any, reason: 'x' }))), centralToday());
    expect(result.counts).toEqual(board.counts);

    const section = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));
    const inSection = (text: string) => board.rows.filter((r) => text.includes(`Software ${r.opportunity.uuid}<`)).map((r) => r.opportunity.uuid).sort();
    const idsFor = (stage: string) => board.rows.filter((r) => r.stage === stage).map((r) => r.opportunity.uuid).sort();
    expect(inSection(section('Vetted: read these first', 'Needs your read'))).toEqual(idsFor('vetted'));
    expect(inSection(section('Needs your read', 'Approved: waiting'))).toEqual(idsFor('needs_read'));
    expect(inSection(section('Approved: waiting', 'Upload the ZIP'))).toEqual(idsFor('approved'));
    expect(inSection(section('Upload the ZIP', 'Hidden this morning'))).toEqual(idsFor('needs_zip'));
    expect(idsFor('needs_zip')).toEqual(['upload1', 'upload2']);

    // The analyzing tile matches, and off-board rows appear nowhere as work.
    expect(html).toMatch(new RegExp(`>${board.counts.analyzing}</div><div[^>]*>[^<]*AI analyzing`));
    for (const gone of ['assigned', 'dismissed', 'flag', 'analyze']) expect(html).not.toContain(`Software ${gone}<`);
  });
});

describe('centralToday', () => {
  it('uses Central, not UTC', () => expect(centralToday(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-04'));
});
