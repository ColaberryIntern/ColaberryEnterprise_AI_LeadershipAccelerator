import { QueryTypes } from 'sequelize';
import { seedAgentIdentity, type AgentIdentityIds } from '../agentBlueprint/agentIdentitySeed';
import AiAgent from '../../models/AiAgent';
import { DOMAIN_AGENT_ENTRIES } from '../agentRegistry/domainAgents';

/**
 * AI Employee Consolidation Program, employees #2 to #10 — the ten Agent Factory domain agents.
 *
 * Dara is #1 and `daraIdentitySeed.ts` is the pattern this follows: a thin wrapper that supplies
 * config, while the real identity mechanic stays in `agentBlueprint/agentIdentitySeed.ts`. The
 * difference is that this one is a LOOP over ten rather than one hand-written file per employee,
 * because ten hand-written near-identical files is how they drift.
 *
 * ## Why this is needed at all
 *
 * AF3.1 created the ten `ai_agents` rows. The transparency page an intern opens is already
 * generic and needs NO code change per agent -- but it renders an agent with no identity as
 * EMPTY rather than broken. So an intern handed their agent today opens a working console
 * showing nothing. Identity is what fills it.
 *
 * ## What this creates, and what it deliberately does not
 *
 * Creates, per agent: an `Enrollment`, a `CommunityMember` and an `AdminUser` with role
 * `ai_staff` and `is_ai_operated: true` -- the same three rows Reese and Dara have, and the same
 * `AdminUser` model human staff use.
 *
 * Does NOT touch `enabled`, `autonomy_level` or `tools_granted`. Release Zero's floor is
 * unchanged by this: the agents stay disabled, at observe, with no capability. An identity lets
 * an agent be SEEN and addressed; it does not let it act.
 *
 * `portal_enabled: false` on the enrollment, so none of these appears as a learner.
 *
 * ## Idempotent
 *
 * `seedAgentIdentity` is findOrCreate throughout, keyed on the email, which is why the email is
 * derived from the stable domain key rather than from a display name somebody might rename.
 * Running it on every boot is the intended usage, exactly as Reese's and Dara's are.
 */

/** Resolve each domain's accountable manager, so the identity carries the same human as R0 did. */
async function managerOrgMemberIdByDomain(): Promise<Record<string, string | null>> {
  const { sequelize } = await import('../../config/database');
  const rows = await sequelize.query<{ domain_key: string; manager_identity_id: string | null }>(
    `SELECT domain_key, NULLIF(manager_identity_id, '') AS manager_identity_id
       FROM agent_domain_projects`,
    { type: QueryTypes.SELECT },
  );
  const out: Record<string, string | null> = {};
  for (const r of rows) out[r.domain_key] = r.manager_identity_id;
  return out;
}

/** `MarketingDomainAgent` -> `marketing`. The registry name is the only link back to the key. */
export function domainKeyOf(agentName: string): string {
  return agentName
    .replace(/DomainAgent$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

export function domainAgentEmail(domainKey: string): string {
  return `${domainKey.replace(/_/g, '-')}-agent@colaberry.com`;
}

/**
 * `product_experience` -> `Product Experience Agent`.
 *
 * Derived rather than read off the registry entry: `AgentSeedEntry` has no `display_name` field
 * (agent_name, agent_type, module, source_file, trigger_type, schedule, category, description,
 * and the optional identity extras -- that is the whole shape). An earlier draft read
 * `entry.display_name` and typechecked clean locally on TypeScript 4.9.5 while failing on the
 * declared 5.7.3, which is the version CI installs.
 */
export function domainAgentDisplayName(domainKey: string): string {
  const words = domainKey
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${words} Agent`;
}

export interface DomainIdentityResult {
  readonly agentName: string;
  readonly email: string;
  readonly ids: AgentIdentityIds | null;
  readonly error?: string;
}

/**
 * Seed all ten. One failure never stops the other nine: each is wrapped, because a single bad
 * row should not leave eight interns without an identity on their agent.
 */
export async function seedDomainAgentIdentities(): Promise<DomainIdentityResult[]> {
  const managers = await managerOrgMemberIdByDomain();
  const results: DomainIdentityResult[] = [];

  for (const entry of DOMAIN_AGENT_ENTRIES) {
    const domainKey = domainKeyOf(entry.agent_name);
    const email = domainAgentEmail(domainKey);
    try {
      const ids = await seedAgentIdentity({
        agentName: entry.agent_name,
        email,
        displayName: domainAgentDisplayName(domainKey),
        role: 'ai_staff',
        // `staff`, matching Dara. These are employees, not mentors: none has a student surface.
        communityRole: 'staff',
        enrollmentDefaults: {
          company: 'Colaberry',
          payment_status: 'paid',
          payment_method: 'invoice',
          payment_mode: 'live',
          enrollment_type: 'standard',
          portal_enabled: false,
        },
        // No proactive capability exists for any of these, so there is no eligible population
        // to gate. Same posture as Dara's.
        pilotCohortGate: false,
        // WITHOUT THIS, EVERY ONE OF THESE WAS REFUSED ON EVERY BOOT. `domainAgents.ts` ships all
        // ten with `tools_granted: []` deliberately -- granting one is AF7.1 and needs a manager
        // -- and Agent Ticket Standard Step 4 refuses an empty tool list. Measured in production
        // 2026-10-30: nine refusals per restart, fail-open, so the only visible symptom was seven
        // interns opening an agent console that rendered empty. The exemption is honoured only
        // while the agent is disabled and at observe, re-read off the row by the gate itself, so
        // this does not become a way to register a live actor without declared capabilities.
        nonTicketCreating: {
          reason:
            'Release Zero floor: disabled, at observe, no tools granted, no schedule and no '
            + 'trigger. It creates no tickets because it cannot act at all. It exists so the '
            + 'domain has an inspectable agent to build on, and a capability grant is AF7.1.',
        },
        // The domain's accountable manager, already set on the AiAgent row by AF3.1. Passing it
        // here keeps the identity consistent with the org chart rather than relying on the
        // self-heal, and `seedAgentIdentity` only writes it when the field is null anyway.
        ...(managers[domainKey] ? { reportsToOrgMemberId: managers[domainKey] as string } : {}),
      } as Parameters<typeof seedAgentIdentity>[0]);

      // Employees #2-#10 of the consolidation program, same classification Dara carries.
      // Idempotent and never overwrites, mirroring her seed's posture exactly.
      const agent = await AiAgent.findByPk(ids.aiAgentId);
      if (agent && !(agent as any).record_kind) {
        await agent.update({ record_kind: 'employee' } as any);
      }

      results.push({ agentName: entry.agent_name, email, ids });
    } catch (err: any) {
      // Logged and carried, not thrown: nine identities are better than none.
      console.warn(`[AI Ops] domain agent identity seed failed for ${entry.agent_name}: `
        + `${err?.message}`);
      results.push({ agentName: entry.agent_name, email, ids: null, error: err?.message });
    }
  }

  return results;
}
