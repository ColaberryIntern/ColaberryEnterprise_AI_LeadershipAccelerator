import { loadDecisionContext } from '../services/growthJourney/decision/loadDecisionContext';
import { decideForSubject } from '../services/growthJourney/governor/decideForSubject';
import { decisionInputHash, productionDeps } from '../services/growthJourney/decisionService';
import type { GrowthJourneyFlags } from '../config/growthJourneyFlags';

/**
 * growthJourneyDecideDryRun — what would the Governor decide for this subject in this brand?
 *
 *   node dist/scripts/growthJourneyDecideDryRun.js --lead 501 --brand <brand uuid> --no-persist
 *
 * READ-ONLY, BY CONSTRUCTION. `--no-persist` is the only mode and is required so
 * nobody can run it expecting a write. It loads the same context the writer
 * loads — through the read-only loader, so no profile projection is written
 * either — runs the same pipeline with the same production dependencies, and
 * prints the decision as JSON. It does not import the flags module: the decision
 * capability is passed in as ON for the duration of the print, because the
 * point is to see what the Governor would say, and nothing here can act on it.
 *
 * Output carries no person text and no address: candidates, suppressions,
 * gaps and reasons are rule names; the subject is a `lead:<id>` or
 * `enrollment:<id>` ref; the brand is a slug. `redactForLogs` is not needed
 * because nothing printed can carry an email, and a test asserts that.
 *
 * Exit codes: 0 printed a decision (a refusal is a decision) · 2 the subject
 * does not resolve or the brand has no programme · 1 usage or a crash.
 */

export interface DryRunArgs {
  leadId: number | null;
  enrollmentId: string | null;
  brandId: string;
  noPersist: boolean;
}

export function parseArgs(argv: string[]): DryRunArgs {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const leadRaw = get('--lead');
  const enrollmentId = get('--enrollment');
  const brandId = get('--brand');
  const leadId = leadRaw ? Number(leadRaw) : null;
  if (leadId !== null && (!Number.isInteger(leadId) || leadId <= 0)) throw new Error('usage: --lead <positive integer> | --enrollment <id>, --brand <uuid>, --no-persist');
  if (leadId === null && !enrollmentId) throw new Error('usage: one of --lead <id> or --enrollment <id> is required');
  if (!brandId) throw new Error('usage: --brand <brand uuid> is required');
  if (!argv.includes('--no-persist')) throw new Error('--no-persist is required: this script has no persisting mode');
  return { leadId, enrollmentId, brandId, noPersist: true };
}

/** The capability ON for the print, and nothing else. The master must be on too or the pipeline refuses. */
export const DRY_RUN_FLAGS: GrowthJourneyFlags = Object.freeze({
  growthJourneyEnabled: true,
  journeySignalIngest: false,
  journeyClassification: false,
  journeyDecisions: true,
  journeyHandoffs: false,
  journeyExecution: false,
});

export async function runDryRun(args: DryRunArgs, out: (line: string) => void = (l) => console.log(l), asOf: Date = new Date()): Promise<number> {
  const anchor = args.leadId !== null ? { leadId: args.leadId } : { enrollmentId: args.enrollmentId as string };
  const loaded = await loadDecisionContext({ anchor, brandId: args.brandId, asOf });
  if (loaded.status !== 'loaded') {
    out(JSON.stringify({ dry_run: true, persisted: false, brand_id: args.brandId, status: loaded.status, ...('reason' in loaded ? { reason: loaded.reason } : {}) }));
    return 2;
  }
  const outcome = await decideForSubject(loaded.ctx, loaded.strategy, productionDeps(), DRY_RUN_FLAGS);
  if (outcome.status === 'disabled') throw new Error('the pipeline reported disabled with the dry-run flags on');
  const d = outcome.decision;
  out(
    JSON.stringify(
      {
        dry_run: true,
        persisted: false,
        subject: loaded.ctx.subject_ref,
        brand: loaded.brand.slug,
        program: { slug: loaded.program.slug, kind: loaded.program.kind, status: loaded.program.status },
        state: loaded.ctx.state,
        overlays: loaded.ctx.overlays,
        lifecycle_projected: loaded.lifecycle.projected,
        inputs_unavailable: loaded.unavailable,
        input_hash: decisionInputHash(loaded.ctx).slice(0, 16),
        decision: {
          selected_action: d.selected_action,
          selected_path: d.selected_path,
          selected_channel: d.selected_channel,
          reason: d.reason,
          candidates: d.candidates.map((c) => ({ action: c.action_type, tier: c.priority_tier, channel: c.channel, purposes: c.required_assets.map((q) => q.asset_type) })),
          suppressed: d.suppressed,
          deferred_actions: d.deferred_actions.map((x) => ({ would: x.would, reason: x.reason })),
          content_gaps: d.content_gaps,
          requires_human_review: d.requires_human_review,
          ai_involved: d.ai_involved,
          ruleset_version: d.ruleset_version,
        },
      },
      null,
      2,
    ),
  );
  return 0;
}

async function shutdown(): Promise<void> {
  try {
    const { sequelize } = await import('../config/database');
    await sequelize.close();
  } catch {
    // The result is printed; a close failure must not turn it into a failed run.
  }
}

if (require.main === module) {
  (async () => {
    const { connectDatabase } = await import('../config/database');
    await import('../models');
    await connectDatabase();
    return runDryRun(parseArgs(process.argv.slice(2)));
  })()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      console.error(`[growthJourneyDecideDryRun] ${(err as { message?: string })?.message ?? err}`);
      process.exitCode = 1;
    })
    .finally(shutdown);
}
