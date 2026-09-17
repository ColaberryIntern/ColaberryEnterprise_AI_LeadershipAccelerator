import AiAgent from '../../models/AiAgent';
import { DARA_AGENT_NAME } from './daraIdentitySeed';

/**
 * Dara v2 Phase 6 (Basecamp gateway) — the write-target allowlist. Confirmed
 * by direct research: no project/todolist write allowlist exists anywhere in
 * this codebase today (the existing InboxCase Basecamp executors accept
 * whatever project id is in their payload, with zero validation). This is
 * the first one — deliberately a single explicit target (one project, one
 * todolist, one assignee), not a general multi-project allowlist, since
 * Dara's real gateway need is exactly one destination: her reports_to
 * human's queue. Fail-closed: any missing/malformed field means the gateway
 * is NOT configured, never a guessed or partial target.
 *
 * Deliberately NOT auto-populated from anywhere (no self-heal, unlike the
 * pilot-cohort gate's storage shape) — a real Basecamp project/todolist/
 * assignee id can only come from a human who actually knows the destination
 * exists and is correct. Stored on Dara's own AiAgent.config JSONB, same
 * column every other Dara config value (pilot_cohort_ids) already uses.
 *
 * `assigneeBasecampPersonId` is deliberately OPTIONAL, not required like the
 * other two fields — a real, direct lookup against the account's people
 * directory (via the actual CB System token) found no Swati Raman match in
 * the 15 people visible to that identity. Rather than fabricate an id,
 * unassigned todos are a real, valid, honest fallback — landing in the
 * configured project is itself the delivery.
 */
export interface DaraBasecampConfig {
  projectId: string;
  todolistId: string;
  assigneeBasecampPersonId: number | null;
}

export async function getDaraBasecampConfig(): Promise<DaraBasecampConfig | null> {
  const agent = await AiAgent.findOne({ where: { agent_name: DARA_AGENT_NAME } });
  const cfg = (agent?.config as any)?.basecamp_gateway;
  if (!cfg || typeof cfg !== 'object') return null;

  const { project_id: projectId, todolist_id: todolistId, assignee_basecamp_person_id: rawAssignee } = cfg;
  if (typeof projectId !== 'string' || !projectId) return null;
  if (typeof todolistId !== 'string' || !todolistId) return null;
  const assigneeBasecampPersonId = typeof rawAssignee === 'number' && rawAssignee > 0 ? rawAssignee : null;

  return { projectId, todolistId, assigneeBasecampPersonId };
}
