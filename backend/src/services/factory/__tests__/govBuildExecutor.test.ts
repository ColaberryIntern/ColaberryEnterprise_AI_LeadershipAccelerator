/**
 * The FUTURE build executor ships DISABLED. The ONLY executor that exists refuses EVERY operation, autonomous
 * execution is hard-wired OFF, and the resolver never returns an executing implementation. This is the rail that
 * keeps the autonomous builder parked: there is no code path that can claim/heartbeat/submit/fail a real build.
 */
import {
  disabledGovBuildExecutor, resolveGovBuildExecutor, isAutonomousExecutionEnabled,
  ExecutionDisabledError, EXECUTION_DISABLED_REASON,
} from '../govBuildExecutor';

describe('govBuildExecutor — disabled stub', () => {
  it('autonomous execution is hard-wired OFF', () => {
    expect(isAutonomousExecutionEnabled()).toBe(false);
  });

  it('EVERY executor operation refuses with ExecutionDisabledError (claim / heartbeat / submitResult / fail)', async () => {
    const ex = resolveGovBuildExecutor();
    await expect(ex.claim({ storyId: 'STORY-R1', executor: 'agent', actorIdentityId: 'a', leaseSeconds: 60 })).rejects.toBeInstanceOf(ExecutionDisabledError);
    await expect(ex.heartbeat('STORY-R1', 'a')).rejects.toBeInstanceOf(ExecutionDisabledError);
    await expect(ex.submitResult({ storyId: 'STORY-R1', ok: true, evidenceRef: 'x' })).rejects.toBeInstanceOf(ExecutionDisabledError);
    await expect(ex.fail({ storyId: 'STORY-R1', reason: 'x' })).rejects.toBeInstanceOf(ExecutionDisabledError);
  });

  it('the refusal carries the stable disabled reason', async () => {
    await expect(disabledGovBuildExecutor.submitResult({ storyId: 'S', ok: true })).rejects.toMatchObject({ reason: EXECUTION_DISABLED_REASON });
  });

  it('the resolver NEVER returns an executing implementation — it is the disabled stub', () => {
    expect(resolveGovBuildExecutor()).toBe(disabledGovBuildExecutor);
  });
});
