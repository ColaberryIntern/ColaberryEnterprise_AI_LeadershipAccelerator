import { getMgmtStatus } from '../access/mgmtBridgeService';
import { listGovContractsFor } from '../factory/govContractsList';
import { listAgentFactoryFor } from '../agentDomain/agentFactoryList';

/**
 * C92: the raw cards behind the admin sidebar's LIVE sub-lists (adminNav.ts `subLists`), for the Campus HQ building, so the
 * tower shows the same sub-items the sidebar shows for the same person (Ali, 2026-10-30: "make sure the 2 are in sync and stay
 * in sync"). Each list comes from the SAME function the admin route uses (govContractsList / agentFactoryList), with the viewer's
 * EFFECTIVE sections (getMgmtStatus, the same sections their admin token carries) and their email (the same identity the bridged
 * admin session uses). A section the viewer does not hold returns no list, as the sidebar fetches nothing for it.
 *
 * Fail-soft per list, like the sidebar: a list that errors (or an unconfigured gov container) is empty and logged, never a
 * failure of the whole building.
 */
export interface HqSubnavCards { gov: unknown[]; agents: unknown[] }

function failed(list: string) {
  return (err: unknown): unknown[] => {
    console.warn(JSON.stringify({
      level: 'warn', service: 'backend', event: 'campus_hq_subnav_list_failed', outcome: 'failure',
      error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error', context: { list },
    }));
    return [];
  };
}

export async function getHqSubnav(enrollmentId: string, email: string): Promise<HqSubnavCards> {
  const { sections } = await getMgmtStatus(enrollmentId);
  const viewer = { email, sections };
  const [gov, agents] = await Promise.all([
    sections.includes('gov_contracts') ? listGovContractsFor(viewer).then((r) => r?.projects ?? []).catch(failed('gov')) : Promise.resolve([]),
    sections.includes('agents') ? listAgentFactoryFor(viewer).then((r) => r.agents).catch(failed('agents')) : Promise.resolve([]),
  ]);
  return { gov, agents };
}
