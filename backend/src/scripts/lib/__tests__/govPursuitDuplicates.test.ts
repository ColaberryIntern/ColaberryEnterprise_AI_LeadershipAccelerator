/**
 * govPursuitDuplicates — which gov pursuits are the same solicitation entered more than once.
 *
 * The fixtures are the real production rows this module was written from (audited 2026-11-07), because the
 * interesting cases are not hypothetical: the Crash Records pair is two downloads of ONE posting whose bytes
 * differ, so a checksum-only rule misses it, and the Snow College trio is one posting that reached TWO separate
 * builds. A rule that only grouped by sha256 would pass a naive test and still have left Crash unfound.
 */
import {
  groupDuplicatePursuits, duplicateSignals, solicitationNumberFrom, normalizeBundleFilename,
} from '../govPursuitDuplicates';

const CRASH_A = {
  qualificationKey: 'gws:546cbf25-13a5-45fa-ae5e-10313a513502',
  sha256: 'aaaa1111', // same posting, different bytes: the ZIP was re-downloaded
  filename: '601440000053455 - pub - Crash Records Information System Ser.zip',
  uploadedAt: '2026-10-27T00:14:06.965Z',
  decision: 'pending_review', status: 'active', deliveryProjectId: null, built: false,
  title: 'Crash Records Information System Service Agreement',
};
const CRASH_B = {
  qualificationKey: 'gws:2ac2fdbc-9675-4f61-9baa-1020493600e8',
  sha256: 'bbbb2222',
  filename: '601440000053455 - pub - Crash Records Information System Ser (1).zip',
  uploadedAt: '2026-11-01T16:22:26.930Z',
  decision: 'approved_bid_pursuit', status: 'active',
  deliveryProjectId: '7a818ed2-4dad-4f55-967f-157d871d3feb', built: true,
  title: null, // the record of the one that was actually built carries no title
};
const UNRELATED = {
  qualificationKey: 'gws:fca6b987-6b36-48ec-9531-dfd1fb4ce792',
  sha256: 'cccc3333',
  filename: '601440000053710 - pub - AASHTOWARE Project Service Units.zip',
  uploadedAt: '2026-11-05T10:19:32.365Z',
  decision: 'needs_evidence', status: 'active', deliveryProjectId: null, built: false,
  title: 'AASHTOWARE Project Service Units',
};

const snow = (key: string, built: boolean, decision: string, uploadedAt: string) => ({
  qualificationKey: key,
  sha256: '518bfb513585590a310ff713d0b334664b05373b499333e85961933d1d0cb66a',
  filename: 'SNOC26271024 - pub - SNOC26271024 - RFP - Adult Learner Stra.zip',
  uploadedAt,
  decision, status: 'active',
  deliveryProjectId: built ? `dp-${key}` : null, built,
  title: 'SNOC26271024 - RFP - Adult Learner Strategy',
});

describe('solicitationNumberFrom', () => {
  it('takes the leading field of the "<no> - pub - <title>.zip" download convention', () => {
    expect(solicitationNumberFrom('601440000053455 - pub - Crash Records Information System Ser.zip'))
      .toBe('601440000053455');
  });
  it('is null when the filename does not follow the convention', () => {
    expect(solicitationNumberFrom('slc.zip')).toBeNull();
    expect(solicitationNumberFrom('RFA 32027-00018 AEL High School Equivalency Virtual Provider (1).zip')).toBeNull();
  });
  it('is null for nothing at all', () => {
    expect(solicitationNumberFrom(null)).toBeNull();
    expect(solicitationNumberFrom('')).toBeNull();
  });
});

describe('normalizeBundleFilename', () => {
  it('drops the browser re-download suffix so "(1)" matches the original', () => {
    expect(normalizeBundleFilename('a - pub - b (1).zip')).toBe(normalizeBundleFilename('a - pub - b.zip'));
  });
  it('is case- and whitespace-insensitive', () => {
    expect(normalizeBundleFilename('  A  -  pub  -  B.ZIP  ')).toBe('a - pub - b');
  });
});

describe('duplicateSignals', () => {
  it('namespaces each signal so a checksum can never collide with a filename', () => {
    expect(duplicateSignals(CRASH_A)).toEqual([
      'sha:aaaa1111',
      'sol:601440000053455',
      'file:601440000053455 - pub - crash records information system ser',
    ]);
  });
  it('yields nothing for a row with neither a checksum nor a filename', () => {
    expect(duplicateSignals({ qualificationKey: 'gws:x', sha256: null, filename: null })).toEqual([]);
  });
});

describe('groupDuplicatePursuits', () => {
  it('groups the Crash pair on the solicitation number even though the bytes differ', () => {
    const groups = groupDuplicatePursuits([CRASH_A, CRASH_B, UNRELATED]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m: any) => m.qualificationKey).sort())
      .toEqual([CRASH_B.qualificationKey, CRASH_A.qualificationKey].sort());
    expect(groups[0].verdict).toBe('duplicate_one_built');
  });

  it('nominates the BUILT member as the real pursuit, not the titled one or the earlier one', () => {
    const [group] = groupDuplicatePursuits([CRASH_A, CRASH_B]);
    expect(group.primary.qualificationKey).toBe(CRASH_B.qualificationKey);
    expect(group.primary.built).toBe(true);
  });

  it('flags one solicitation that reached TWO builds, and reports it before the milder groups', () => {
    const groups = groupDuplicatePursuits([
      CRASH_A, CRASH_B,
      snow('gws:219e3d5c', true, 'approved_bid_pursuit', '2026-10-21T11:35:35.010Z'),
      snow('gws:02d4ac13', true, 'approved_bid_pursuit', '2026-10-23T16:09:00.872Z'),
      snow('gws:a6971fc3', false, 'pending_review', '2026-10-23T16:58:46.735Z'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].verdict).toBe('duplicate_built_twice');
    expect(groups[0].builtCount).toBe(2);
    expect(groups[1].verdict).toBe('duplicate_one_built');
  });

  it('groups on the checksum when the filenames share nothing (a hand-renamed re-upload)', () => {
    const sha = 'faf19964f352ebfa410b0b0dd6091ee96a404fb13ea40c0044d0f654ac022080';
    const groups = groupDuplicatePursuits([
      { qualificationKey: 'gws:3ba57318', sha256: sha, filename: 'SLCAIR26016 - pub - Salt Lake City Au.zip', uploadedAt: '2026-10-23T17:48:59.957Z', decision: 'pending_review', built: false },
      { qualificationKey: 'gws:6255d39e', sha256: sha, filename: 'slc.zip', uploadedAt: '2026-10-23T18:00:39.866Z', decision: 'pending_review', built: false },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].verdict).toBe('duplicate_none_built');
    expect(groups[0].signals).toContain(`sha:${sha}`);
  });

  it('does NOT report one pursuit whose ZIP was simply uploaded twice (a corrected ZIP is legitimate)', () => {
    const again = { ...CRASH_A, sha256: 'dddd4444', uploadedAt: '2026-10-28T09:00:00.000Z' };
    expect(groupDuplicatePursuits([CRASH_A, again])).toEqual([]);
  });

  it('reports nothing for unrelated solicitations', () => {
    expect(groupDuplicatePursuits([UNRELATED, CRASH_A])).toEqual([]);
  });

  it('ignores a row with no signals rather than grouping every unidentifiable upload together', () => {
    const blankA = { qualificationKey: 'gws:blank-a', sha256: null, filename: null, built: false };
    const blankB = { qualificationKey: 'gws:blank-b', sha256: null, filename: null, built: false };
    expect(groupDuplicatePursuits([blankA, blankB])).toEqual([]);
  });

  it('survives junk input', () => {
    expect(groupDuplicatePursuits([])).toEqual([]);
    expect(groupDuplicatePursuits(null as any)).toEqual([]);
    expect(groupDuplicatePursuits([null, undefined, { sha256: 'x' }] as any)).toEqual([]);
  });
});
