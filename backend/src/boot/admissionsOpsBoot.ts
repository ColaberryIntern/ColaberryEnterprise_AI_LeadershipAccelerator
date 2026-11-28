import { ensureAdmissionsOpsAgentSchema } from '../db/ensureAdmissionsOpsAgentSchema';

/**
 * Admissions & Ops Command Center: everything the workspace needs at boot, in ONE place, so server.ts (4,000+ lines,
 * over the ceiling) is touched by exactly one call and never again (the boot/placementBoot.ts pattern). Later releases
 * add their ensure*Schema calls here. Each schema module is additive and idempotent.
 */
export async function startAdmissionsOps(): Promise<void> {
  await ensureAdmissionsOpsAgentSchema();
}
