import { buildDiscoveryBoard, classifyBoardRow, rowsToHide, isOffTarget, isSameBid, BoardFacts, QualFacts, VettingFacts } from '../govDiscoveryBoard';
import type { GovOpportunity } from '../govOpportunity';

const opp = (over: Partial<GovOpportunity> = {}): GovOpportunity => ({ uuid: 'u1', title: 'Permitting Software RFP', agency: 'City', closeDate: '2026-12-01', fitScore: 70, estimatedValue: 1, sourceUrl: 'https://b.example/1', ...over });
const q = (over: Partial<QualFacts> = {}): QualFacts => ({ decision: 'pending_review', approvalRequested: false, establishedCount: 0, zipSha: null, title: 'T', agency: 'A', closeDate: null, ...over });
const v = (over: Partial<VettingFacts> = {}): VettingFacts => ({ status: 'completed', verdict: 'pursue', reason: 'r', quote: null, coveragePct: 80, errorClass: null, opportunity: null, ...over });
const facts = (over: Partial<BoardFacts> = {}): BoardFacts => ({
  dismissed: new Set(), restored: new Set(), assigned: new Set(), qualifications: new Map(), vettings: new Map(), bundles: new Set(), aiEnabled: true, ...over,
});
const quals = (x: QualFacts) => new Map([['u1', x]]);
const vets = (x: VettingFacts) => new Map([['u1', x]]);
const stage = (over: Partial<BoardFacts>, o = opp()) => classifyBoardRow(o, facts(over));

describe('classifyBoardRow: the state table', () => {
  it('no row, no ZIP, passes the smell test -> needs_zip', () => expect(stage({})).toBe('needs_zip'));
  it('a record opened with no ZIP -> needs_zip', () => expect(stage({ qualifications: quals(q()) })).toBe('needs_zip'));
  it('fit under 60 -> below_bar', () => expect(stage({}, opp({ fitScore: 59 }))).toBe('below_bar'));
  it('fit exactly 60 -> needs_zip', () => expect(stage({}, opp({ fitScore: 60 }))).toBe('needs_zip'));
  it('no fit score -> needs_zip: it failed nothing, and it must not vanish with no way back', () => expect(stage({}, opp({ fitScore: null }))).toBe('needs_zip'));
  it('attested ZIP with no stored bytes and low fit -> needs_zip: the sweep will not hide it, so it must stay listed', () => {
    expect(stage({ qualifications: quals(q({ zipSha: 'abc' })) }, opp({ fitScore: 40 }))).toBe('needs_zip');
  });
  it('with no sweep to hide it, a low-fit row stays listed rather than vanish with no way back', () => {
    expect(stage({ sweepActs: false }, opp({ fitScore: 59 }))).toBe('needs_zip');
    expect(stage({ sweepActs: false }, opp({ title: 'Roofing Repairs' }))).toBe('needs_zip');
  });
  it('off-target title at high fit -> below_bar', () => expect(stage({}, opp({ title: 'Roofing Repairs', fitScore: 90 }))).toBe('below_bar'));
  it('attested ZIP with no stored bytes -> needs_zip, so it gets uploaded again', () => {
    expect(stage({ qualifications: quals(q({ zipSha: 'abc' })) })).toBe('needs_zip');
  });
  it('attested ZIP, stored bytes, AI on -> analyzing (backfill waiting), never asks for a re-upload', () => {
    expect(stage({ qualifications: quals(q({ zipSha: 'abc' })), bundles: new Set(['u1:abc']) })).toBe('analyzing');
  });
  it('attested ZIP, stored bytes, AI off -> needs_read', () => {
    expect(stage({ qualifications: quals(q({ zipSha: 'abc' })), bundles: new Set(['u1:abc']), aiEnabled: false })).toBe('needs_read');
  });
  it('queued or running -> analyzing, including a fresh running row on its last attempt', () => {
    expect(stage({ vettings: vets(v({ status: 'queued', verdict: null })) })).toBe('analyzing');
    expect(stage({ vettings: vets(v({ status: 'running', verdict: null })) })).toBe('analyzing');
  });
  it('unfinished with the AI off -> needs_read, not analyzing forever', () => {
    expect(stage({ vettings: vets(v({ status: 'queued', verdict: null })), aiEnabled: false })).toBe('needs_read');
  });
  it('pursue -> vetted', () => expect(stage({ vettings: vets(v()) })).toBe('vetted'));
  it('inconclusive -> needs_read', () => expect(stage({ vettings: vets(v({ verdict: 'inconclusive' })) })).toBe('needs_read'));
  it('pass with no human progress -> analyzing until the sweep hides it', () => {
    expect(stage({ vettings: vets(v({ verdict: 'pass' })) })).toBe('analyzing');
  });
  it('pass with established requirements -> needs_read', () => {
    expect(stage({ vettings: vets(v({ verdict: 'pass' })), qualifications: quals(q({ establishedCount: 2 })) })).toBe('needs_read');
  });
  it('pass restored by a person -> needs_read, never stuck on analyzing', () => {
    expect(stage({ vettings: vets(v({ verdict: 'pass' })), restored: new Set(['u1']) })).toBe('needs_read');
  });
  it('a low-fit row with a ZIP follows the AI, because a person chose to upload it', () => {
    expect(stage({ vettings: vets(v()) }, opp({ fitScore: 40 }))).toBe('vetted');
  });
  it('a restored low-fit row -> needs_zip', () => expect(stage({ restored: new Set(['u1']) }, opp({ fitScore: 40 }))).toBe('needs_zip'));
});

describe('classifyBoardRow: precedence', () => {
  it('assigned beats everything', () => {
    expect(stage({ assigned: new Set(['u1']), vettings: vets(v()), qualifications: quals(q({ decision: 'approved_bid_pursuit' })) })).toBeNull();
  });
  it('dismissed is off', () => expect(stage({ dismissed: new Set(['u1']) })).toBeNull());
  it('no_bid is off', () => expect(stage({ qualifications: quals(q({ decision: 'no_bid' })) })).toBeNull());
  it('human approval beats an AI pass', () => {
    expect(stage({ qualifications: quals(q({ decision: 'approved_bid_pursuit' })), vettings: vets(v({ verdict: 'pass' })) })).toBe('approved');
  });
  it('rfi_response counts as approved', () => expect(stage({ qualifications: quals(q({ decision: 'rfi_response' })) })).toBe('approved'));
  it('a requested approval beats an AI verdict', () => {
    expect(stage({ qualifications: quals(q({ approvalRequested: true })), vettings: vets(v({ verdict: 'pass' })) })).toBe('needs_read');
  });
  it('OP-flagged rows are flagged, never on the upload list', () => {
    expect(stage({}, opp({ vetVerdict: { status: 'no_bid' } }))).toBe('flagged');
    expect(stage({}, opp({ vetVerdict: { status: 'needs_review' } }))).toBe('flagged');
    expect(stage({}, opp({ pursuitStatus: 'declined' }))).toBe('flagged');
  });
});

describe('buildDiscoveryBoard', () => {
  const today = '2026-11-04';
  it('counts every stage and omits below_bar rows', () => {
    const b = buildDiscoveryBoard([opp(), opp({ uuid: 'low', fitScore: 10 })], facts(), today);
    expect(b.rows.map((r) => r.opportunity.uuid)).toEqual(['u1']);
    expect(b.counts).toMatchObject({ needs_zip: 1, below_bar: 1 });
  });
  it('reports dismissed and assigned, counting a row that is both once, as dismissed', () => {
    const b = buildDiscoveryBoard([opp(), opp({ uuid: 'u2' }), opp({ uuid: 'u3' })], facts({ dismissed: new Set(['u1', 'u2']), assigned: new Set(['u2', 'u3']) }), today);
    expect(b).toMatchObject({ dismissedCount: 2, assignedCount: 1 });
    expect(b.rows).toEqual([]);
  });
  const project = { deliveryProjectId: 'dp1', title: 'Permitting Software RFP', agency: 'City (utah)', closeDate: null, interns: [], build: null, establishedCount: 0 };
  it('a bid matching a current project is not also a candidate, and the counts follow', () => {
    const b = buildDiscoveryBoard([opp()], facts({ currentProjects: [project] }), today);
    expect(b.rows).toEqual([]);
    expect(b.counts.needs_zip).toBe(0);
    expect(b.currentProjects).toEqual([project]);
  });
  it('a bid listed twice under two ids shows once, at its most advanced stage', () => {
    const b = buildDiscoveryBoard([opp({ uuid: 'a' }), opp({ uuid: 'b', title: 'PERMITTING software, RFP' })], facts({ vettings: new Map([['b', v()]]) }), today);
    expect(b.rows.map((r) => [r.opportunity.uuid, r.stage])).toEqual([['b', 'vetted']]);
    expect(b.counts).toMatchObject({ vetted: 1, needs_zip: 0 });
  });
  it('the same title from two agencies stays two bids, because dropping a real bid is worse', () => {
    expect(buildDiscoveryBoard([opp({ uuid: 'a', agency: 'Harris County' }), opp({ uuid: 'b', agency: 'Dallas County' })], facts(), today).rows).toHaveLength(2);
  });
  it('isSameBid ignores case, punctuation and a parenthetical, and an unknown buyer matches on title', () => {
    expect(isSameBid({ title: 'A-B Portal', agency: 'U3P (utah)' }, { title: 'a b portal', agency: 'u3p' })).toBe(true);
    expect(isSameBid({ title: 'A Portal', agency: null }, { title: 'A Portal', agency: 'City' })).toBe(true);
    expect(isSameBid({ title: 'A Portal', agency: 'X' }, { title: 'B Portal', agency: 'X' })).toBe(false);
    expect(isSameBid({ title: '', agency: 'X' }, { title: '', agency: 'X' })).toBe(false);
  });
  it('a failed read keeps a low-fit row listed rather than drop it with no way back', () => {
    expect(stage({ failedReads: new Set(['restored']) }, opp({ fitScore: 40 }))).toBe('needs_zip');
  });
  it('counts every hidden row, including one that left the feed, so the Hidden list stays reachable', () => {
    expect(buildDiscoveryBoard([], facts({ dismissed: new Set(['left-the-feed']) }), today).dismissedCount).toBe(1);
  });
  it('says why a row needs a read when the AI checks are off', () => {
    const b = buildDiscoveryBoard([opp()], facts({ aiEnabled: false, vettings: vets(v({ status: 'queued', verdict: null, reason: null })) }), today);
    expect(b.rows[0]).toMatchObject({ stage: 'needs_read', vetting: { reason: expect.stringContaining('AI checks are off') } });
  });
  it('marks the board incomplete when a read failed', () => {
    expect(buildDiscoveryBoard([], facts(), today).incomplete).toBe(false);
    expect(buildDiscoveryBoard([], facts({ failedReads: new Set(['bundles']) }), today).incomplete).toBe(true);
  });
  it('every below_bar row is one the sweep hides, so nothing drops off with no way back', () => {
    const rows = [opp({ uuid: 'a', fitScore: 40 }), opp({ uuid: 'b', title: 'Roofing' }), opp({ uuid: 'c', fitScore: null }), opp({ uuid: 'd', fitScore: 40 })];
    const f = facts({ qualifications: new Map([['d', q({ zipSha: 'abc' })]]) });
    const dropped = rows.filter((o) => classifyBoardRow(o, f) === 'below_bar').map((o) => o.uuid);
    expect(rowsToHide(rows, f).map((h) => h.opportunity.uuid)).toEqual(dropped);
    expect(dropped).toEqual(['a', 'b']);
  });
  it('keeps a vetted bid that left the feed, from its saved details, until it closes', () => {
    const f = facts({ vettings: new Map([['gone', v({ opportunity: { title: 'Saratoga', agency: 'City', closeDate: '2026-11-12', fitScore: 75, sourceUrl: 'https://b.example/2' } })]]) });
    const b = buildDiscoveryBoard([], f, today);
    expect(b.rows[0]).toMatchObject({ stage: 'vetted', fromSnapshot: true, opportunity: { uuid: 'gone', title: 'Saratoga', closeDate: '2026-11-12' } });
    expect(buildDiscoveryBoard([], f, '2026-11-13').rows).toEqual([]);
  });
  it('keeps an approved bid with no vetting row, from the qualification', () => {
    const f = facts({ qualifications: new Map([['gone', q({ decision: 'approved_bid_pursuit', title: 'Old', closeDate: '2026-11-20' })]]) });
    expect(buildDiscoveryBoard([], f, today).rows[0]).toMatchObject({ stage: 'approved', fromSnapshot: true });
  });
  it('old abandoned records do not flood the list: out-of-feed needs_zip, analyzing, unknown dates all stay off', () => {
    const f = facts({
      qualifications: new Map([['a', q({ closeDate: '2026-11-20' })], ['b', q({ decision: 'approved_bid_pursuit', closeDate: null })]]),
      vettings: new Map([['c', v({ status: 'queued', verdict: null, opportunity: { title: 'X', closeDate: '2026-11-20' } })]]),
    });
    expect(buildDiscoveryBoard([], f, today).rows).toEqual([]);
  });
  it('a snapshot row assigned to an intern stays off', () => {
    const f = facts({ assigned: new Set(['gone']), vettings: new Map([['gone', v({ opportunity: { title: 'S', closeDate: '2026-11-12' } })]]) });
    expect(buildDiscoveryBoard([], f, today).rows).toEqual([]);
  });
  it('a feed row is not listed twice', () => {
    expect(buildDiscoveryBoard([opp()], facts({ vettings: vets(v({ opportunity: { title: 'S', closeDate: '2026-12-01' } })) }), today).rows).toHaveLength(1);
  });
});

describe('rowsToHide', () => {
  const uuids = (feed: GovOpportunity[], over: Partial<BoardFacts>) => rowsToHide(feed, facts(over)).map((h) => [h.opportunity.uuid, h.reason]);
  it('hides an AI pass with no human progress', () => {
    expect(uuids([opp()], { vettings: vets(v({ verdict: 'pass' })) })).toEqual([['u1', 'ai_not_a_fit']]);
  });
  it('never hides a pass that is approved, requested, established or assigned', () => {
    const pass = vets(v({ verdict: 'pass' }));
    expect(uuids([opp()], { vettings: pass, qualifications: quals(q({ decision: 'approved_bid_pursuit' })) })).toEqual([]);
    expect(uuids([opp()], { vettings: pass, qualifications: quals(q({ approvalRequested: true })) })).toEqual([]);
    expect(uuids([opp()], { vettings: pass, qualifications: quals(q({ establishedCount: 1 })) })).toEqual([]);
    expect(uuids([opp()], { vettings: pass, assigned: new Set(['u1']) })).toEqual([]);
  });
  it('never re-hides a restored row, for an AI pass or a low score', () => {
    expect(uuids([opp()], { vettings: vets(v({ verdict: 'pass' })), restored: new Set(['u1']) })).toEqual([]);
    expect(uuids([opp({ fitScore: 40 })], { restored: new Set(['u1']) })).toEqual([]);
    expect(uuids([opp({ title: 'Roofing' })], { restored: new Set(['u1']) })).toEqual([]);
  });
  it.each(['restored', 'assigned', 'qualifications', 'vettings'] as const)('hides nothing at all when the %s read failed', (read) => {
    const rows = [opp({ fitScore: 40 }), opp({ uuid: 'u2', title: 'Roofing' })];
    expect(uuids(rows, { failedReads: new Set([read]) })).toEqual([]);
  });
  it('still hides when only the bundles read failed, because no hide depends on it', () => {
    expect(uuids([opp({ fitScore: 40 })], { failedReads: new Set(['bundles']) })).toEqual([['u1', 'auto_fit_below_threshold']]);
  });
  it('a flagged row stays flagged, and is not moved into the email by hiding it', () => {
    expect(uuids([opp({ fitScore: 40, vetVerdict: { status: 'no_bid' } } as any)], {})).toEqual([]);
  });
  it('never hides an already dismissed row again', () => expect(uuids([opp({ fitScore: 40 })], { dismissed: new Set(['u1']) })).toEqual([]));
  it('inconclusive, unfinished and pursue are never hidden', () => {
    for (const x of [v({ verdict: 'inconclusive' }), v({ status: 'queued', verdict: null }), v()]) {
      expect(uuids([opp({ fitScore: 40 })], { vettings: vets(x) })).toEqual([]);
    }
  });
  it('a row with a ZIP is left to the AI, whatever its title or score', () => {
    expect(uuids([opp({ fitScore: 40 })], { qualifications: quals(q({ zipSha: 'abc' })) })).toEqual([]);
  });
  it('keeps the existing low-fit and off-target hides with their reasons', () => {
    expect(uuids([opp({ fitScore: 59 })], {})).toEqual([['u1', 'auto_fit_below_threshold']]);
    expect(uuids([opp({ title: 'Roofing Repairs', fitScore: 90 })], {})).toEqual([['u1', 'auto_off_target']]);
  });
  it('fit exactly 60 and a null fit are not hidden', () => {
    expect(uuids([opp({ fitScore: 60 })], {})).toEqual([]);
    expect(uuids([opp({ fitScore: null })], {})).toEqual([]);
  });
});

describe('isOffTarget', () => {
  it('rescues a real IT title that mentions a trade word', () => expect(isOffTarget('Construction Permitting Software')).toBe(false));
  it('rescues AI', () => expect(isOffTarget('AI for Roofing Inspections')).toBe(false));
  it('catches a plain trade', () => expect(isOffTarget('Janitorial Services')).toBe(true));
});
