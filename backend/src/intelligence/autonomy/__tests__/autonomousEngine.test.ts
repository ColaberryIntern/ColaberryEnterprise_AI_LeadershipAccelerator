/**
 * Agent Alias & Identity Fix — forward-fix for cory-engine's ticket-creator
 * identity, tested in isolation via the extracted pure helper
 * resolveCoryEngineTicketAssignee(), rather than mocking the full 8-step
 * autonomous cycle. See the function's own header comment in
 * autonomousEngine.ts for why the stamp is scoped to the isAutoExec branch
 * only (the Review branch's status:'todo' + assigned_to_id IS NULL combination
 * is real, load-bearing input to ticketManagementAgent.ts's auto-dispatch sweep).
 */
import { resolveCoryEngineTicketAssignee } from '../autonomousEngine';

describe('resolveCoryEngineTicketAssignee', () => {
  it('happy path: auto-executable + a real AdminUser id -> stamps the real identity', () => {
    expect(resolveCoryEngineTicketAssignee(true, 'admin-cory-engine-1')).toEqual({
      assigned_to_type: 'ai_staff',
      assigned_to_id: 'admin-cory-engine-1',
    });
  });

  it('failure path: auto-executable but the AdminUser id is not yet resolvable (null) -> safe no-op, never a partial/invalid stamp', () => {
    expect(resolveCoryEngineTicketAssignee(true, null)).toEqual({});
  });

  it('the real risk being guarded against: NOT auto-executable (a "Review" ticket) is ALWAYS unstamped, even with a valid id — preserves ticketManagementAgent.ts\'s real auto-dispatch sweep', () => {
    expect(resolveCoryEngineTicketAssignee(false, 'admin-cory-engine-1')).toEqual({});
  });

  it('boundary: not auto-executable and no id -> still an empty, safe no-op (not a crash)', () => {
    expect(resolveCoryEngineTicketAssignee(false, null)).toEqual({});
  });
});
