/**
 * The whole daily process, end to end, with only the outside world faked (the feed, the model, the database rows, the mail
 * transport). The real verdict rails, runner, classifier, sweep and email renderer all run. Each step follows the
 * sentence in Ali's request that it proves.
 */
const FLAGS = { govAiVetting: true, govOpportunitySweep: true };
jest.mock('../../../config/featureFlags', () => ({ FLAGS }));
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => dbQuery(...a), define: jest.fn() } }));
const dbQuery = jest.fn();
const savedRow = jest.fn();
jest.mock('../../../models/GovAiVetting', () => ({ __esModule: true, default: { update: (...a: any[]) => savedRow(...a), findOne: async () => null, findAll: async () => [] } }));
const extractionPayload = jest.fn();
jest.mock('../../../models/GovExtractionJob', () => ({ __esModule: true, default: { findOne: async () => ({ result_json: extractionPayload() }) } }));
jest.mock('../../../models/GovSourceBundle', () => ({ __esModule: true, default: { findOne: async () => null } }));
jest.mock('../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: async () => null, findAll: async () => [] } }));
const feedNow = jest.fn();
jest.mock('../opportunities/oppPulseClient', () => ({ fetchBestFitOpportunities: (...a: any[]) => feedNow(...a) }));
jest.mock('../serviceCatalog', () => ({ listServiceOfferings: async () => [{ id: 's1', name: 'Software' }] }));
const fit = jest.fn();
jest.mock('../govCapabilityFit', () => ({ assessCapabilityFit: (...a: any[]) => fit(...a) }));
const goNoGo = jest.fn();
jest.mock('../govAiGoNoGo', () => ({ generateGoNoGo: (...a: any[]) => goNoGo(...a) }));
jest.mock('../govBidNarrative', () => ({
  generateProposalSummary: async () => ({ whatTheyWant: 'x', whatWedBuild: 'y' }),
  generateClarificationQuestions: async () => ({ questions: [] }),
}));
jest.mock('../../../scripts/lib/factoryDemoContainer', () => ({ lookupGovContractsContainer: async () => ({ tenant: { id: 'ten-1' }, org: { id: 'org-1' } }) }));
jest.mock('../opportunities/govDailySlot', () => ({ claimDailySlot: async () => true }));
const hide = jest.fn();
jest.mock('../opportunities/govOpportunityDismissals', () => ({ dismissOpportunity: (...a: any[]) => hide(...a) }));
const facts = jest.fn();
jest.mock('../opportunities/govDiscoveryBoardFacts', () => ({
  ...jest.requireActual('../opportunities/govDiscoveryBoardFacts'),
  loadBoardFacts: (...a: any[]) => facts(...a),
}));
const mail = jest.fn();
jest.mock('../../emailService', () => ({ sendGovOpportunitySweepEmail: (...a: any[]) => mail(...a) }));

import { runGovAiVettingCatchup, runVetting } from '../govAiVetting';
import { runGovOpportunitySweep } from '../opportunities/govOpportunitySweep';
import { toVettingFacts } from '../opportunities/govDiscoveryBoardFacts';
import { buildDiscoveryBoard, BoardFacts } from '../opportunities/govDiscoveryBoard';
import { assignedOpportunityUuids } from '../govPipeline';

const TODAY = '2026-11-04';
const QUOTE = 'Vendor must hold an active StateRAMP authorization at the time of submission.';
const opp = (uuid: string, over: any = {}) => ({ uuid, title: `Software ${uuid}`, agency: 'City', closeDate: '2099-12-01', fitScore: 75, estimatedValue: 1, sourceUrl: `https://city.bonfirehub.com/opportunities/${uuid}`, ...over });
const K = (uuid: string) => ({ tenantId: 'ten-1', qualificationKey: `gws:${uuid}`, sha256: `sha-${uuid}` });
const emptyFacts = (): BoardFacts => ({ dismissed: new Set(), restored: new Set(), assigned: new Set(), qualifications: new Map(), vettings: new Map(), bundles: new Set(), aiEnabled: true });
const lastHtml = (): string => mail.mock.calls[mail.mock.calls.length - 1][0].html;
const lastSubject = (): string => mail.mock.calls[mail.mock.calls.length - 1][0].subject;

/** Run the real AI checks on an upload, and return the row exactly as the board would read it back. */
async function uploadZip(uuid: string, attempts = 1): Promise<any> {
  dbQuery.mockResolvedValueOnce([{ id: `row-${uuid}`, attempts }]);
  savedRow.mockClear();
  await runVetting(K(uuid));
  const fields = savedRow.mock.calls[0][0];
  return { ...toVettingFacts(fields), status: fields.status };
}
const sweep = async (f: BoardFacts) => { facts.mockResolvedValue(f); return runGovOpportunitySweep(); };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  FLAGS.govOpportunitySweep = true;
  FLAGS.govAiVetting = true;
  savedRow.mockResolvedValue([1]);
  hide.mockResolvedValue({});
  mail.mockResolvedValue(undefined);
  extractionPayload.mockReturnValue({ candidates: [{ id: 'R1', text: QUOTE, extractedText: QUOTE }] });
  fit.mockResolvedValue({ capabilities: [{ name: 'A', assessment: 'have' }, { name: 'B', assessment: 'partial' }] });
  goNoGo.mockResolvedValue({ verdict: 'pursue', reason: 'Strong match for our software work.', quote: null });
});

describe('a bid that survives', () => {
  it('walks from the upload list to a star, then off both lists when assigned to an intern', async () => {
    const feed = [opp('good')];
    feedNow.mockResolvedValue({ source: 'live', opportunities: feed });

    // "The 1st email should only present me with opportunities that pass that smell test", with the Bonfire link.
    await sweep(emptyFacts());
    expect(lastHtml()).toContain('Upload the ZIP');
    expect(lastHtml()).toContain('href="https://city.bonfirehub.com/opportunities/good"');
    expect(lastSubject()).toContain('1 ZIP to upload');

    // "When I do that, you should run the next set of checks", with no button, and "save the results".
    const saved = await uploadZip('good');
    expect(saved).toMatchObject({ status: 'completed', verdict: 'pursue', coveragePct: 100 });
    expect(savedRow.mock.calls[0][0].fit_json).toBeTruthy();
    expect(savedRow.mock.calls[0][0].summary_json).toBeTruthy();

    // "Those should have a star next to them because they've been vetted", in the one combined email.
    const afterUpload: BoardFacts = { ...emptyFacts(), vettings: new Map([['good', saved]]) };
    mail.mockClear();
    await sweep(afterUpload);
    expect(mail).toHaveBeenCalledTimes(1);
    expect(lastHtml()).toContain('⭐ Software good');
    expect(lastHtml()).toContain('Strong match for our software work.');
    expect(lastHtml()).not.toContain('Upload the ZIP');
    expect(buildDiscoveryBoard(feed as any, afterUpload, TODAY).rows[0].stage).toBe('vetted');

    // "Once they are assigned, they should fall off the Discovered Candidates list."
    const card = { key: 'gws:good', deliveryProjectId: 'dp-1', hasActiveIntern: true };
    const afterAssign: BoardFacts = { ...afterUpload, assigned: assignedOpportunityUuids([card]) };
    const board = buildDiscoveryBoard(feed as any, afterAssign, TODAY);
    expect(board.rows).toEqual([]);
    expect(board.assignedCount).toBe(1);
    mail.mockClear();
    await sweep(afterAssign);
    expect(lastHtml()).not.toContain('Software good');
    // That the row then shows under Interns > Gov Contracts is proved by useAdminGovContractsNav.test.ts, on the same fields.
  });
});

describe('a bid that does not survive', () => {
  it('is hidden the next morning, reported, and stays restored', async () => {
    const feed = [opp('wall')];
    feedNow.mockResolvedValue({ source: 'live', opportunities: feed });
    goNoGo.mockResolvedValue({ verdict: 'pass', reason: 'Requires StateRAMP, which we do not hold.', quote: 'hold an active StateRAMP authorization' });

    const saved = await uploadZip('wall');
    expect(saved).toMatchObject({ verdict: 'pass', quote: 'hold an active StateRAMP authorization' });

    // "The ones that don't survive are hidden from the list."
    await sweep({ ...emptyFacts(), vettings: new Map([['wall', saved]]) });
    expect(hide).toHaveBeenCalledWith(expect.objectContaining({ opportunityKey: 'wall', reason: 'ai_not_a_fit' }));
    expect(lastHtml()).toContain('Hidden this morning');
    expect(lastHtml()).toContain('AI says not a fit');

    // A person restores it. The next sweep leaves it alone and shows it for a read.
    hide.mockClear();
    mail.mockClear();
    await sweep({ ...emptyFacts(), vettings: new Map([['wall', saved]]), restored: new Set(['wall']) });
    expect(hide).not.toHaveBeenCalled();
    expect(lastHtml()).toContain('Needs your read');
    expect(lastHtml()).toContain('Requires StateRAMP');
  });

  it('a quote that only matches the plain-language rewrite is not evidence, so the bid is not hidden', async () => {
    const rewrite = 'The vendor needs to be authorized under the StateRAMP security program.';
    extractionPayload.mockReturnValue({ candidates: [{ id: 'R1', text: rewrite, extractedText: QUOTE }] });
    goNoGo.mockResolvedValue({ verdict: 'pass', reason: 'Requires StateRAMP.', quote: rewrite });
    expect(await uploadZip('rewritten')).toMatchObject({ verdict: 'inconclusive' });
    expect(goNoGo.mock.calls[0][0].requirements).toEqual([{ id: 'R1', text: QUOTE }]); // the model read the source's words
  });

  it('an AI pass cannot hide a bid a person has already moved forward', async () => {
    feedNow.mockResolvedValue({ source: 'live', opportunities: [opp('moved')] });
    goNoGo.mockResolvedValue({ verdict: 'pass', reason: 'Weak.', quote: 'hold an active StateRAMP authorization' });
    const saved = await uploadZip('moved');
    await sweep({
      ...emptyFacts(), vettings: new Map([['moved', saved]]),
      qualifications: new Map([['moved', { decision: 'approved_bid_pursuit', approvalRequested: false, establishedCount: 4, zipSha: 'x', title: null, agency: null, closeDate: null }]]),
    });
    expect(hide).not.toHaveBeenCalled();
    expect(lastHtml()).toContain('Approved: waiting for an intern');
  });
});

describe('when things fail', () => {
  it('a model outage for three days ends in Needs your read, and is never hidden', async () => {
    feedNow.mockResolvedValue({ source: 'live', opportunities: [opp('down')] });
    goNoGo.mockResolvedValue({ verdict: null, reason: '', quote: null, error: 'The AI go/no-go could not be generated right now.' });

    // The row as the database would hold it. The real claim and catch-up SQL decide nothing here, so this models their rules
    // (attempts counted at claim, only queued rows taken); the real runner and catch-up loop run against it.
    const row = { tenant_id: 'ten-1', qualification_key: 'gws:down', sha256: 'sha-down', attempts: 0, status: 'queued' };
    dbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('RETURNING id, attempts')) {
        if (row.status !== 'queued' || row.attempts >= 3) return [];
        row.attempts += 1;
        return [{ id: 'row-down', attempts: row.attempts }];
      }
      if (sql.startsWith('SELECT tenant_id')) return row.status === 'queued' && row.attempts < 3 ? [row] : [];
      return [];
    });
    savedRow.mockImplementation(async (fields: any) => { row.status = fields.status; return [1]; });
    const lastSaved = () => { const f = savedRow.mock.calls[savedRow.mock.calls.length - 1][0]; return { ...toVettingFacts(f), status: f.status }; };

    // Upload day: the first try fails, and the row waits for the catch-up.
    await runVetting(K('down'));
    expect(row).toMatchObject({ status: 'queued', attempts: 1 });
    await sweep({ ...emptyFacts(), vettings: new Map([['down', lastSaved()]]) });
    expect(hide).not.toHaveBeenCalled();
    expect(lastHtml()).not.toContain('Software down'); // still analyzing: a count, not a to-do
    expect(lastHtml()).toMatch(/>1<\/div><div[^>]*>[^<]*AI analyzing/);

    // The next two mornings' catch-ups use the remaining tries, and then it stops spending.
    expect((await runGovAiVettingCatchup()).retried).toBe(1);
    expect(row).toMatchObject({ status: 'queued', attempts: 2 });
    expect((await runGovAiVettingCatchup()).retried).toBe(1);
    expect(row).toMatchObject({ status: 'completed', attempts: 3 });
    const day3 = lastSaved();
    expect(day3).toMatchObject({ status: 'completed', verdict: 'inconclusive' });
    expect((await runGovAiVettingCatchup()).retried).toBe(0);
    mail.mockClear();
    hide.mockClear();
    await sweep({ ...emptyFacts(), vettings: new Map([['down', day3]]) });
    expect(hide).not.toHaveBeenCalled();
    expect(lastHtml()).toContain('Needs your read');
    expect(lastHtml()).toContain('Software down');
  });

  it('a feed outage sends nothing and hides nothing, even with a stale low-fit row', async () => {
    feedNow.mockResolvedValue({ source: 'snapshot', snapshotReason: 'source_failed', opportunities: [opp('stale', { fitScore: 5 })] });
    expect((await sweep(emptyFacts())).skipped).toBe('feed_not_live');
    expect(hide).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});
