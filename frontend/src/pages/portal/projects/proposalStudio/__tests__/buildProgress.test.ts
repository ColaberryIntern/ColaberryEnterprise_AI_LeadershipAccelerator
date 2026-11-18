import { shouldKeepPolling, runningDocCount, BUILD_KICK_GRACE_MS } from '../buildProgress';
import type { StudentGovProjectView } from '../../../../../services/govProjectPortalApi';

const view = (docs: Array<{ cycle?: { status?: string } }>): StudentGovProjectView =>
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
