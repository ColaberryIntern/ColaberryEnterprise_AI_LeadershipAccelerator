import api from '../utils/api';

// AI Agent Dashboard redesign, Checkpoint C (2026-09-02) — first frontend
// caller of the real, already-live ManagerDirective CRUD
// (managerDirectiveService.ts). Real, proven runtime injection into every
// manager-conversation reply (buildAgentManagerConversationSystemPrompt) and
// every general agent prompt build that passes an agentId — but there is no
// automated conflict detection between directives, and no per-run "this
// directive was consumed by this specific reply" trace. The UI must show
// the real active-directive list for the manager to eyeball themselves
// rather than claim an automated check that doesn't exist.

export interface ManagerDirective {
  id: string;
  directiveText: string;
  status: 'active' | 'revoked';
  createdByEmail: string;
  createdByOrgMemberId: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
}

/**
 * AF12.8 — whether this agent's directives are enforced or advisory, derived server-side from
 * the actual prompt wiring rather than asserted. `notInjectedBy` being non-empty means the
 * agent has a live surface that does NOT carry its directives, which is a defect to report
 * rather than a setting to explain.
 */
export interface DirectivePosture {
  mechanism: 'advisory';
  mechanismReason: string;
  injectedBy: string[];
  notInjectedBy: string[];
  hasOwnReplyRuntime: boolean;
}

interface DirectivesResponse {
  agentId: string;
  directives: ManagerDirective[];
  posture?: DirectivePosture;
}

export async function listDirectives(agentId: string): Promise<ManagerDirective[]> {
  const res = await api.get<DirectivesResponse>(`/api/admin/agents/${agentId}/directives`);
  return res.data.directives;
}

/**
 * The same request, with the posture. Kept separate from `listDirectives` so the two other
 * callers of that function (AgentTalkTab, AgentAtAGlanceTab) are untouched by this change.
 */
export async function listDirectivesWithPosture(
  agentId: string,
): Promise<{ directives: ManagerDirective[]; posture: DirectivePosture | null }> {
  const res = await api.get<DirectivesResponse>(`/api/admin/agents/${agentId}/directives`);
  return { directives: res.data.directives, posture: res.data.posture ?? null };
}

export async function createDirective(agentId: string, directiveText: string): Promise<ManagerDirective> {
  const res = await api.post<ManagerDirective>(`/api/admin/agents/${agentId}/directives`, { directiveText });
  return res.data;
}

export async function revokeDirective(agentId: string, directiveId: string): Promise<ManagerDirective> {
  const res = await api.post<ManagerDirective>(`/api/admin/agents/${agentId}/directives/${directiveId}/revoke`);
  return res.data;
}
