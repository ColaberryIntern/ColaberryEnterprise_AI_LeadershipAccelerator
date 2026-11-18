import { shouldKeepPolling, runningDocCount, builtDocCount, buildableDocs, BUILD_KICK_GRACE_MS } from '../buildProgress';
import type { StudentGovProjectView } from '../../../../../services/govProjectPortalApi';

const view = (docs: Array<{ key?: string; superseded?: boolean; latest?: unknown; cycle?: { status?: string } }>): StudentGovProjectView =>
  ({ proposalDocuments: docs } as unknown as StudentGovProjectView);

describe('buildProgress.shouldKeepPolling', () => {
  it('keeps polling while any document is running', () => {
    expect(shouldKeepPolling(true, 0, 1_000_000)).toBe(true);
  });
  it('keeps polling within the grace window after a kick, even with nothing running yet', () => {
    const kickedAt = 1_000_000;
    expect(shouldKeepPolling(false, kickedAt, kickedAt + 1000)).toBe(true);
    expect(shouldKeepPolling(false, kickedAt, kickedAt + BUILD_KICK_GRACE_MS - 1)).toBe(true);
  });
  it('stops once nothing is running and the grace window has passed', () => {
    const kickedAt = 1_000_000;
    expect(shouldKeepPolling(false, kickedAt, kickedAt + BUILD_KICK_GRACE_MS + 1)).toBe(false);
  });
  it('never polls when never kicked and nothing is running', () => {
    expect(shouldKeepPolling(false, 0, 5_000_000)).toBe(false);
  });
});

describe('buildProgress.runningDocCount', () => {
  it('counts documents whose cycle is running', () => {
    expect(runningDocCount(view([{ cycle: { status: 'running' } }, { cycle: { status: 'passed' } }, { cycle: { status: 'running' } }, {}]))).toBe(2);
  });
  it('is zero (not a throw) when there are no documents', () => {
    expect(runningDocCount({} as StudentGovProjectView)).toBe(0);
  });
});

describe('buildProgress build-count helpers (the meter)', () => {
  it('buildableDocs drops the price sheet and superseded rows', () => {
    const v = view([{ key: 'technical' }, { key: 'pricing' }, { key: 'old', superseded: true }, { key: 'past_perf' }]);
    expect(buildableDocs(v).map((d: any) => d.key)).toEqual(['technical', 'past_perf']);
  });
  it('builtDocCount counts drafted docs that are not mid-build, so the meter moves as each one completes', () => {
    const v = view([
      { key: 'technical', latest: { version: 1 }, cycle: { status: 'passed' } }, // built
      { key: 'past_perf', latest: { version: 1 }, cycle: { status: 'running' } }, // still building -> not counted
      { key: 'mgmt' }, // not started -> not counted
      { key: 'pricing', latest: { version: 1 } }, // excluded (price sheet)
    ]);
    expect(builtDocCount(v)).toBe(1);
  });
});
