import { loadClassificationInput } from '../services/growthJourney/classification/inputs';
import { classifyInput } from '../services/growthJourney/classification/classify';
import { allowedOfferFamilies, brandsAllowingFamily, resolveOfferEligibility } from '../services/growthJourney/offerEligibility';
import { classificationResultSchema } from '../schemas/growthJourneyClassificationSchema';
import type { ClassifyOptions } from '../services/growthJourney/classification/types';

/**
 * growthJourneyClassifyDryRun — what would the ladder say about this lead?
 *
 *   node dist/scripts/growthJourneyClassifyDryRun.js --lead 501 [--reply "text"] --no-persist
 *
 * READ-ONLY, BY CONSTRUCTION. `--no-persist` is the only mode and is required
 * so nobody can run it expecting a write. It loads the same inputs the service
 * loads, runs the same deterministic ladder against the same live policy
 * table, and prints the result as JSON. It imports neither the AI module nor
 * the flags module: it cannot call a model whatever the flags say, and it
 * does not consult them — the point is to see the deterministic answer.
 *
 * Exit codes: 0 printed a result · 2 the lead does not resolve · 1 usage or
 * a crash. Output carries no person text: evidence strings are rule names,
 * and the subject is a `lead:<id>` ref.
 */

export interface DryRunArgs {
  leadId: number;
  reply: string | null;
  noPersist: boolean;
}

export function parseArgs(argv: string[]): DryRunArgs {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const leadRaw = get('--lead');
  const leadId = leadRaw ? Number(leadRaw) : NaN;
  if (!Number.isInteger(leadId) || leadId <= 0) throw new Error('usage: --lead <positive integer> [--reply <text>] --no-persist');
  if (!argv.includes('--no-persist')) throw new Error('--no-persist is required: this script has no persisting mode');
  return { leadId, reply: get('--reply'), noPersist: true };
}

/** The ladder's live dependencies, with NO model hook — deliberately. */
export function dryRunOptions(): ClassifyOptions {
  return {
    eligibility: (brandId, offerFamily) => resolveOfferEligibility({ brandId, offerFamily }),
    allowedFamilies: (brandId) => allowedOfferFamilies(brandId),
    allowingBrands: (offerFamily) => brandsAllowingFamily(offerFamily),
  };
}

export async function runDryRun(
  args: DryRunArgs,
  out: (line: string) => void = (l) => console.log(l),
  opts: ClassifyOptions = dryRunOptions(),
): Promise<number> {
  const loaded = await loadClassificationInput(
    { leadId: args.leadId },
    args.reply ? { reply: { body: args.reply, channel: 'email' } } : {},
  );
  if (loaded.status === 'unresolved') {
    out(JSON.stringify({ dry_run: true, persisted: false, subject: `lead:${args.leadId}`, status: 'unresolved', reason: loaded.reason }));
    return 2;
  }
  const result = await classifyInput(loaded.input, opts);
  // The printed shape is the contract the Zod schema states; a drift fails here, loudly.
  const parsed = classificationResultSchema.safeParse(result);
  if (!parsed.success) throw new Error(`result does not match classificationResultSchema: ${parsed.error.issues.length} issue(s)`);
  out(
    JSON.stringify(
      {
        dry_run: true,
        persisted: false,
        subject: loaded.input.subject_ref,
        brand: loaded.brand ? { brand_slug: loaded.brand.brand_slug, default_program_slug: loaded.brand.default_program_slug } : null,
        inputs_unavailable: loaded.unavailable,
        result: parsed.data,
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
      console.error(`[growthJourneyClassifyDryRun] ${(err as { message?: string })?.message ?? err}`);
      process.exitCode = 1;
    })
    .finally(shutdown);
}
