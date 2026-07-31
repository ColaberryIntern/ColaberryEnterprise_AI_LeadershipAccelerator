jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  statSync: jest.fn(),
}));

import fs from 'fs';
import { getInpactGoalsEstimate } from '../trustInpactGoalsService';

const statSyncMock = fs.statSync as jest.Mock;
const readFileSyncMock = fs.readFileSync as jest.Mock;

const HEADER = 'System,Area,Tier,User-Facing,HITL Level,Data Sensitivity,Owner (assign),Provisional INPACT band,Provisional GOALS,Target INPACT,Target GOALS,Remediation Phase,Key Gaps,Logging Today';

function csvRow(system: string, tier: string, band: string, goals: string): string {
  return `${system},Area,${tier},Public,1,None,TBD,${band},${goals},>=86%,>=21/25,1-3,gap,log`;
}

// Module-scope (not per-test) so each test gets a distinct mtime — the service caches by
// mtime, and resetting this counter inside beforeEach would make different tests' mocked
// stats collide and return the PREVIOUS test's cached parse result.
let mtimeCounter = 1;

beforeEach(() => {
  jest.clearAllMocks();
  statSyncMock.mockImplementation(() => ({ mtimeMs: mtimeCounter++ }));
});

describe('getInpactGoalsEstimate', () => {
  it('averages only Tier-1 rows, taking the lower band on a compound read', () => {
    readFileSyncMock.mockReturnValue([
      HEADER,
      csvRow('Maya', '1', 'Moderate/Low', '~12/25'), // takes Low (41)
      csvRow('Synthflow', '1', 'Low', '~10/25'), // 41
      csvRow('Cory (Tier 2 excluded)', '2', 'High Trust', '~25/25'),
    ].join('\n'));

    const result = getInpactGoalsEstimate();

    expect(result.tier1SystemCount).toBe(2);
    expect(result.scoredSystemCount).toBe(2);
    expect(result.inpactEstimatePct).toBe(41); // (41 + 41) / 2
    expect(result.goalsEstimate).toBe(11); // (12 + 10) / 2
  });

  it('excludes unscored rows (e.g. "Unassessed") from the average without crashing', () => {
    readFileSyncMock.mockReturnValue([
      HEADER,
      csvRow('Maya', '1', 'Moderate', '~14/25'),
      csvRow('Agent Registry aggregate', '1', 'Unassessed', 'n/a'),
    ].join('\n'));

    const result = getInpactGoalsEstimate();

    expect(result.tier1SystemCount).toBe(2);
    expect(result.scoredSystemCount).toBe(1);
    expect(result.inpactEstimatePct).toBe(58);
    expect(result.goalsEstimate).toBe(14);
  });

  it('returns zeroes with scoredSystemCount 0 when no Tier-1 rows are scoreable', () => {
    readFileSyncMock.mockReturnValue([HEADER, csvRow('Something Tier 3', '3', 'Moderate', '~14/25')].join('\n'));

    const result = getInpactGoalsEstimate();

    expect(result.scoredSystemCount).toBe(0);
    expect(result.inpactEstimatePct).toBe(0);
    expect(result.goalsEstimate).toBe(0);
  });
});
