import { Request, Response } from 'express';
import { AiAgent, Brand, JourneyPath, JourneyProgram, TenantMembership } from '../models';
import { growthJourneyFlagSummary, resolveGrowthJourneyFlags, type GrowthJourneyFlagSummary } from '../config/growthJourneyFlags';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../services/agentRegistry/growthJourneyAgents';
import { terminologyOf, type JourneyTerminology } from '../services/growthJourney/journeyTerminology';
import { logReadFailure } from './growthJourneyController';

/**
 * The Growth Journey's CONFIGURATION registry (Phase 6, T604).
 *
 * ─── WHY IT IS READABLE WHILE THE MASTER FLAG IS OFF ────────────────────────
 *
 * Every other journey route 404s when `GROWTH_JOURNEY_ENABLED` is off, which is
 * right: those routes read subjects, decisions and receipts, and a dark system
 * has none. But the question an operator has BEFORE turning anything on is
 * exactly the one those 404s refuse to answer - which brands and programmes
 * exist, what each programme calls its people, which flags are set, whether the
 * memberships that scope every read are populated, and whether the three agents
 * are enabled. A Command Center that shows nothing until the flag is on cannot
 * be used to decide whether to turn the flag on.
 *
 * So this controller is mounted on its own router, BEFORE `growthJourneyRoutes`
 * applies `requireGrowthJourneyEnabled` to the whole prefix (see
 * `routes/admin/growthJourneyStatusRoutes.ts` for the ordering, which is the
 * mechanism, and `adminRoutes.ts` for the mount line that makes it true).
 *
 * ─── WHAT IT MAY RETURN, AND WHAT IT MAY NOT ────────────────────────────────
 *
 * CONFIGURATION ONLY: brands, programmes, paths, terminology, flag booleans, a
 * membership COUNT reduced to a boolean, and the three agent names with their
 * enabled state and last run. Not one row of any journey table - no subject, no
 * classification, no decision, no handoff, no receipt - and therefore no
 * address, no name of a person, nothing a person could be identified by. The
 * access suite asserts that with an adversarial brand name, and the tenancy
 * guard is unchanged: this is the platform's own configuration, which is why it
 * is admin-only rather than brand-scoped.
 */

export interface StatusRegistryBrand {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  default_journey_program_id: string | null;
}

export interface StatusRegistryProgram {
  id: string;
  brand_id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  /** From `metadata.terminology`; null when the seed has not run on this row. */
  terminology: JourneyTerminology | null;
}

export interface StatusRegistryPath {
  program_id: string;
  offer_family: string;
  name: string;
  status: string;
}

export interface StatusRegistryAgent {
  agent_name: string;
  /** Null when the registry declares the agent but no row has been seeded yet. */
  enabled: boolean | null;
  last_run_at: string | null;
}

export interface StatusRegistry {
  brands: StatusRegistryBrand[];
  programs: StatusRegistryProgram[];
  paths: StatusRegistryPath[];
  /**
   * The six switches as they are SET - `growthJourneyFlagSummary`'s shape, not this file's.
   * The flags module owns the names: its dark-launch guard fails any other file that reads a
   * sub-flag directly, and it caught this controller's first draft doing exactly that.
   */
  flags: GrowthJourneyFlagSummary;
  /** Every journey read scopes by the caller's memberships; with none, every admin sees nothing. */
  memberships_populated: boolean;
  agents: StatusRegistryAgent[];
}

export async function getStatusRegistryHandler(req: Request, res: Response): Promise<void> {
  try {
    const flags = growthJourneyFlagSummary(resolveGrowthJourneyFlags());
    const [brandRows, programRows, pathRows, membershipCount, agentRows] = await Promise.all([
      Brand.findAll({ attributes: ['id', 'tenant_id', 'slug', 'name', 'status', 'default_journey_program_id'], order: [['slug', 'ASC']] }),
      JourneyProgram.findAll({ attributes: ['id', 'brand_id', 'slug', 'name', 'kind', 'status', 'metadata'], order: [['slug', 'ASC']] }),
      JourneyPath.findAll({ attributes: ['program_id', 'offer_family', 'name', 'status'], order: [['offer_family', 'ASC']] }),
      TenantMembership.count(),
      AiAgent.findAll({ attributes: ['agent_name', 'enabled', 'last_run_at'], where: { agent_name: GROWTH_JOURNEY_AGENT_ENTRIES.map((a) => a.agent_name) } }),
    ]);

    const byName = new Map(agentRows.map((a) => [String(a.get('agent_name')), a]));
    const registry: StatusRegistry = {
      brands: brandRows.map((b) => ({
        id: String(b.get('id')),
        tenant_id: String(b.get('tenant_id')),
        slug: String(b.get('slug')),
        name: String(b.get('name')),
        status: String(b.get('status')),
        default_journey_program_id: (b.get('default_journey_program_id') as string | null) ?? null,
      })),
      programs: programRows.map((p) => ({
        id: String(p.get('id')),
        brand_id: String(p.get('brand_id')),
        slug: String(p.get('slug')),
        name: String(p.get('name')),
        kind: String(p.get('kind')),
        status: String(p.get('status')),
        terminology: terminologyOf(p.get('metadata')),
      })),
      paths: pathRows.map((p) => ({
        program_id: String(p.get('program_id')),
        offer_family: String(p.get('offer_family')),
        name: String(p.get('name')),
        status: String(p.get('status')),
      })),
      flags,
      // A COUNT, reduced to a boolean: how many memberships exist is not this answer's business,
      // and "is every admin currently scoped to nothing" is.
      memberships_populated: membershipCount > 0,
      agents: GROWTH_JOURNEY_AGENT_ENTRIES.map((entry) => {
        const row = byName.get(entry.agent_name);
        const lastRun = row?.get('last_run_at') as Date | null | undefined;
        return {
          agent_name: entry.agent_name,
          enabled: row ? Boolean(row.get('enabled')) : null,
          last_run_at: lastRun ? new Date(lastRun).toISOString() : null,
        };
      }),
    };
    res.json(registry);
  } catch (err) {
    const errorClass = logReadFailure(req, err, 'status_registry_read_failed');
    res.status(500).json({ error: 'Status registry read failed', error_class: errorClass });
  }
}
