import { deriveOperationalState } from '../agentOperationalState';
import { AgentDetail } from '../../services/agentDetailApi';

type Fixture = Pick<AgentDetail, 'agent' | 'live_status' | 'trust_contract'>;

function makeDetail(overrides: Partial<Fixture['trust_contract']> & { enabled?: boolean; live_status?: AgentDetail['live_status'] } = {}): Fixture {
  const { enabled = true, live_status = 'unknown', ...trustOverrides } = overrides;
  return {
    agent: { enabled } as AgentDetail['agent'],
    live_status,
    trust_contract: {
      trigger_type: null,
      schedule: null,
      status: 'idle',
      last_run_at: null,
      run_count: 0,
      error_count: 0,
      avg_duration_ms: null,
      last_error: null,
      last_error_at: null,
      last_activity_at: null,
      ...trustOverrides,
    },
  };
}

const NOW = new Date('2026-09-01T12:00:00.000Z').getTime();

describe('deriveOperationalState', () => {
  it('returns paused when the agent is disabled, ahead of every other signal', () => {
    const detail = makeDetail({ enabled: false, status: 'running', last_activity_at: new Date(NOW).toISOString() });
    const result = deriveOperationalState(detail, 0, NOW);
    expect(result.state).toBe('paused');
  });

  it('returns blocked when trust_contract.status is error, even with zero pending approvals', () => {
    const detail = makeDetail({ status: 'error', last_error: 'Timeout calling OpenAI' });
    const result = deriveOperationalState(detail, 0, NOW);
    expect(result.state).toBe('blocked');
    expect(result.reason).toContain('error');
  });

  it('returns needs_approval when there are pending inbox items, ahead of running/online', () => {
    const detail = makeDetail({ status: 'running' });
    const result = deriveOperationalState(detail, 2, NOW);
    expect(result.state).toBe('needs_approval');
    expect(result.reason).toContain('2 items');
  });

  it('returns working from trust_contract.status="running"', () => {
    const detail = makeDetail({ status: 'running' });
    const result = deriveOperationalState(detail, 0, NOW);
    expect(result.state).toBe('working');
    expect(result.reason).toContain('running');
  });

  it('returns working from live_status="online" even when trust_contract.status is idle', () => {
    const detail = makeDetail({ status: 'idle', live_status: 'online' });
    const result = deriveOperationalState(detail, 0, NOW);
    expect(result.state).toBe('working');
    expect(result.reason).toContain('online');
  });

  it('returns waiting from live_status="away"', () => {
    const detail = makeDetail({ live_status: 'away' });
    expect(deriveOperationalState(detail, 0, NOW).state).toBe('waiting');
  });

  it('returns offline from live_status="offline"', () => {
    const detail = makeDetail({ live_status: 'offline' });
    expect(deriveOperationalState(detail, 0, NOW).state).toBe('offline');
  });

  it('returns idle when live_status is unknown but there is ticket activity within 24h', () => {
    const detail = makeDetail({ live_status: 'unknown', last_activity_at: new Date(NOW - 60 * 60 * 1000).toISOString() });
    const result = deriveOperationalState(detail, 0, NOW);
    expect(result.state).toBe('idle');
  });

  it('returns unknown when live_status is unknown and there is no recent ticket activity — never fabricates Working or Idle', () => {
    const detail = makeDetail({ live_status: 'unknown', last_activity_at: null });
    expect(deriveOperationalState(detail, 0, NOW).state).toBe('unknown');
  });

  it('returns unknown when the only activity signal is stale (older than the 24h window)', () => {
    const detail = makeDetail({ live_status: 'unknown', last_activity_at: new Date(NOW - 48 * 60 * 60 * 1000).toISOString() });
    expect(deriveOperationalState(detail, 0, NOW).state).toBe('unknown');
  });
});
