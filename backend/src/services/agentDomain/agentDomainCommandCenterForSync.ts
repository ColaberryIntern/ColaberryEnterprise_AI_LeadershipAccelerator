/**
 * agentDomainCommandCenterForSync -- the bridge between the domain board and the builder's repo.
 *
 * ## What was broken (AF3.9)
 *
 * `renderDocs` supplies a Command Center story when the published plan does not contain one, and it
 * looked for the BARE id `STORY-000`. The ten agent-domain projects namespace theirs as
 * `<domain>.STORY-000` -- deliberately, because a test asserts every story id across all ten is
 * distinct, and that invariant is what stopped a stale browser tab matching on `story_id` alone
 * from overwriting eighteen published tasks belonging to another project.
 *
 * So the lookup always missed, and every domain builder's repo was handed the Student Build
 * Pipeline's generic five-criteria Command Center instead of their own six. Measured in production
 * 1 Nov 2026: 10 of 10 have the right task row, 0 of 10 have it in the plan.
 *
 * `sbp/govPlanForSync.ts` is the same shape of fix for gov builds, and its existence is the reason
 * this one is small: the pattern was already set, it had simply never been built for agent domains.
 * `isDomainCommandCenterStoryId` was written to recognise the namespaced id and had NO PRODUCTION
 * CALLER at all -- the function that knew the rule was never asked. It is now the guard on the
 * per-story prompt route, which is the place that has to answer the question from an id alone.
 *
 * ## Failure posture
 *
 * NEVER THROWS, and a failure returns `null` rather than a partial override. The caller then
 * renders exactly as it did before, which is the wrong Command Center but a working repo -- the
 * same trade `refreshRepoDocuments` makes everywhere else: a sync must not fail because a
 * best-effort enrichment did. Every outcome is logged with an `error_class`.
 *
 * `null` for a non-domain project is the overwhelmingly common answer and is not a failure: every
 * ordinary SBP build takes that path and keeps the behaviour it has always had.
 */
/**
 * ## EVERY IMPORT HERE IS TYPE-ONLY, AND THE VALUE IMPORTS ARE DEFERRED
 *
 * This module is reached on two hot paths that are overwhelmingly NOT agent-domain projects: every
 * repo sync and every documents-bundle download. Importing the renderers eagerly pulled the whole
 * capability-record graph -- `agentDomainStoryTemplates`, `capabilityRecord`, the ten capability
 * files and the 443-capability contract check -- plus the database config into both, for every
 * ordinary student build that was then going to get `null` anyway.
 *
 * It showed up as two test timeouts rather than as a production incident, which is luck: the cost
 * is real either way and an ordinary build should not pay to load another subsystem. So the value
 * imports happen AFTER the one cheap indexed query has confirmed this is a domain project.
 */
import type { CommandCenterOverride } from '../sbp/renderDocs';
import type {
  SnapshotAgentInput,
  SnapshotGovernanceRow,
  SnapshotStoryVerdict,
} from './agentDomainSnapshot';

function logLine(
  event: string,
  correlationId: string | null | undefined,
  outcome: 'success' | 'failure' | 'partial',
  context: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'agent-domain-command-center',
    event,
    outcome,
    correlation_id: correlationId ?? null,
    context,
  }));
}

/** The domain this project is, or null. Exported so a caller can ask the question on its own. */
export async function domainKeyForProject(projectId: string): Promise<string | null> {
  if (!projectId) return null;
  const { sequelize } = await import('../../config/database');
  const { QueryTypes } = await import('sequelize');
  const rows = await sequelize.query<{ domain_key: string; agent_id: string | null }>(
    `SELECT domain_key, agent_id::text AS agent_id
       FROM agent_domain_projects
      WHERE student_project_id = $1
      LIMIT 1`,
    { bind: [projectId], type: QueryTypes.SELECT },
  );
  return rows.length ? rows[0].domain_key : null;
}

/** The live agent row behind this domain, or null when none is linked. */
/**
 * AF12.1. The verification verdicts this project's stories already carry.
 *
 * `buildVerificationService` writes `student_tasks.verification_json` on every sync, for every
 * story. Nothing ever showed it to the builder: measured 3 Nov 2026, 264 stories across the ten
 * agent domains carried an `in_progress` verdict while their page read "not started", and the
 * count of unverified stories with SOME criteria claimed was zero across the whole platform.
 *
 * Read here so the snapshot can carry it into the builder's own repository, which is where their
 * Command Center reads from. A story with no verdict yet is returned with nulls rather than
 * skipped: the page has to be able to say "not checked" as distinct from "checked and clear".
 *
 * `checked_at` is deliberately NOT selected. It moves every sync, and this file takes part in the
 * change comparison, so carrying it would make each sync a commit whose only difference is a
 * timestamp (FR-026).
 */
async function storyVerdictsForProject(projectId: string): Promise<SnapshotStoryVerdict[]> {
  const { sequelize } = await import('../../config/database');
  const { QueryTypes } = await import('sequelize');
  const rows = await sequelize.query<{
    story_id: string;
    title: string;
    status: string;
    verification_state: string | null;
    criteria_passed: number | null;
    criteria_total: number | null;
    reasons: unknown;
    outstanding: unknown;
    commit_sha: string | null;
    verified_at: Date | string | null;
  }>(
    `SELECT st.story_id,
            st.title,
            st.status,
            st.verification_json->>'state'                     AS verification_state,
            (st.verification_json->>'criteria_passed')::int    AS criteria_passed,
            (st.verification_json->>'criteria_total')::int     AS criteria_total,
            coalesce(st.verification_json->'reasons', '[]'::jsonb)     AS reasons,
            coalesce(st.verification_json->'outstanding', '[]'::jsonb) AS outstanding,
            st.verification_json->>'commit_sha'                AS commit_sha,
            st.verified_at
       FROM student_tasks st
      WHERE st.project_id = $1
      ORDER BY st.story_id`,
    { bind: [projectId], type: QueryTypes.SELECT },
  );

  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  return rows.map((r) => ({
    story_id: r.story_id,
    title: r.title,
    status: r.status,
    verification_state: r.verification_state,
    criteria_passed: r.criteria_passed,
    criteria_total: r.criteria_total,
    reasons: strings(r.reasons),
    outstanding: strings(r.outstanding),
    commit_sha: r.commit_sha,
    verified: Boolean(r.verified_at),
  }));
}

async function agentForProject(projectId: string): Promise<SnapshotAgentInput | null> {
  const { sequelize } = await import('../../config/database');
  const { QueryTypes } = await import('sequelize');
  // `tools_granted` is JSONB, not `text[]`. Read through the column directly rather than
  // `unnest`, which does not exist for jsonb and fails at the database rather than in review.
  const rows = await sequelize.query<{
    agent_id: string | null;
    display_name: string | null;
    enabled: boolean | null;
    autonomy_level: string | null;
    autonomy_level_set_at: Date | string | null;
    autonomy_level_source: string | null;
    tools_granted: unknown;
  }>(
    `SELECT aa.id::text                      AS agent_id,
            aa.config->>'display_name'       AS display_name,
            aa.enabled,
            aa.autonomy_level,
            aa.autonomy_level_set_at,
            aa.autonomy_level_source,
            coalesce(aa.tools_granted, '[]'::jsonb) AS tools_granted
       FROM agent_domain_projects adp
       JOIN ai_agents aa ON aa.id = adp.agent_id
      WHERE adp.student_project_id = $1
      LIMIT 1`,
    { bind: [projectId], type: QueryTypes.SELECT },
  );
  if (!rows.length) return null;
  const r = rows[0];
  const setAt = r.autonomy_level_set_at;
  return {
    agent_id: r.agent_id,
    display_name: r.display_name,
    enabled: r.enabled,
    autonomy_level: r.autonomy_level,
    autonomy_level_set_at: setAt instanceof Date ? setAt.toISOString() : (setAt ?? null),
    autonomy_level_source: r.autonomy_level_source,
    tools_granted: Array.isArray(r.tools_granted) ? r.tools_granted.map((t) => String(t)) : [],
  };
}

/** This domain's governance queue. An empty queue is a real state, not a failed read. */
async function governanceForDomain(domainKey: string): Promise<SnapshotGovernanceRow[]> {
  const { default: AgentDomainChangeRequest } = await import('../../models/AgentDomainChangeRequest');
  const rows = await AgentDomainChangeRequest.findAll({
    where: { domain_key: domainKey },
    order: [['requested_at', 'DESC']],
    limit: 200,
  });
  return rows.map((r) => {
    const row = r as unknown as {
      id: string; kind: string; title: string; status: string;
      requested_at: Date | string | null; approved_at: Date | string | null;
      declined_reason: string | null;
    };
    const iso = (v: Date | string | null): string | null => (
      v instanceof Date ? v.toISOString() : (v ?? null)
    );
    return {
      id: String(row.id),
      kind: String(row.kind),
      title: String(row.title),
      status: String(row.status),
      requested_at: iso(row.requested_at),
      approved_at: iso(row.approved_at),
      declined_reason: row.declined_reason ?? null,
    };
  });
}

/**
 * The Command Center override for this project, or null if it is not an agent-domain project.
 *
 * The snapshot is best-effort SEPARATELY from the story. A database hiccup reading the agent row
 * must not cost the builder the correct story doc -- that is the whole point of the ticket -- so a
 * snapshot failure degrades to no snapshot file and the story still lands. Criterion 2 already
 * requires a panel with no data to say so in words, so an absent snapshot renders honestly.
 */
export async function domainCommandCenterOverrideForProject(
  projectId: string,
  correlationId?: string | null,
): Promise<CommandCenterOverride | null> {
  if (!projectId) return null;

  let domainKey: string | null = null;
  try {
    domainKey = await domainKeyForProject(projectId);
  } catch (err: unknown) {
    logLine('agent_domain_cc_lookup_failed', correlationId, 'failure', {
      projectId, error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    });
    return null;
  }
  if (!domainKey) return null;

  // Only now, with a confirmed domain, is it worth loading the renderers.
  let seed: { id: string; release: string; acceptance: string[] };
  let doc: string;
  let tombstone: string;
  let barePath: string;
  try {
    const {
      BARE_COMMAND_CENTER_DOC_PATH,
      domainCommandCenterDoc,
      domainCommandCenterSeed,
      supersededBareCommandCenterDoc,
    } = await import('./agentDomainCommandCenterDoc');
    seed = domainCommandCenterSeed(domainKey);
    doc = domainCommandCenterDoc(domainKey);
    tombstone = supersededBareCommandCenterDoc(domainKey);
    barePath = BARE_COMMAND_CENTER_DOC_PATH;
  } catch (err: unknown) {
    // An unregistered domain key, or a generator that no longer produces a Command Center. Both
    // are real defects and both are better reported than papered over with a half-built override.
    logLine('agent_domain_cc_render_failed', correlationId, 'failure', {
      projectId,
      domain_key: domainKey,
      error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    });
    return null;
  }

  const files: Array<{ path: string; content: string }> = [
    { path: barePath, content: tombstone },
  ];

  try {
    const [
      { AGENT_DOMAIN_SNAPSHOT_PATH, buildAgentDomainSnapshot, serialiseAgentDomainSnapshot },
      { loadDomainMatrix },
      agent,
      governance,
      stories,
    ] = await Promise.all([
      import('./agentDomainSnapshot'),
      import('./capabilityRecord'),
      agentForProject(projectId),
      governanceForDomain(domainKey),
      storyVerdictsForProject(projectId),
    ]);
    files.push({
      path: AGENT_DOMAIN_SNAPSHOT_PATH,
      content: serialiseAgentDomainSnapshot(buildAgentDomainSnapshot({
        domain_key: domainKey,
        agent,
        matrix: loadDomainMatrix(domainKey),
        governance,
        stories,
      })),
    });
  } catch (err: unknown) {
    logLine('agent_domain_cc_snapshot_failed', correlationId, 'partial', {
      projectId,
      domain_key: domainKey,
      error_class: (err as { constructor?: { name?: string } })?.constructor?.name ?? 'Error',
    });
  }

  logLine('agent_domain_cc_override_built', correlationId, 'success', {
    projectId,
    domain_key: domainKey,
    story_id: seed.id,
    acceptance: seed.acceptance.length,
    extra_files: files.map((f) => f.path),
  });

  return {
    storyId: seed.id,
    release: seed.release,
    acceptance: seed.acceptance,
    doc,
    files,
  };
}
