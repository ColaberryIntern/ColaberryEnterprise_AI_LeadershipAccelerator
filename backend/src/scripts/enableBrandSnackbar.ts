/**
 * Turn the landing-page snack bar on for brands that already exist.
 *
 * The column default now ships `true` (ensureLandingPageSnackbarSchema), so brands created from
 * here on show a snack bar with no operator step. `SET DEFAULT` deliberately does not touch rows
 * that already exist, so brands created before that change still read `false` - including the one
 * serving /lp/colaberry-training/ai-learning-platform. This script flips those, by name, once.
 *
 * It is a script and not a line in the boot DDL on purpose: a blanket UPDATE at boot would also
 * re-enable a brand an operator had deliberately switched off, every restart, which would make the
 * off switch a lie. Naming the brand is the consent.
 *
 * READ-ONLY UNLESS `--apply`. Without it the script reports what it would change and writes
 * nothing, so the state can be inspected before anything moves.
 *
 * Run (on the VPS, inside the backend container):
 *   docker exec accelerator-backend node dist/scripts/enableBrandSnackbar.js colaberry-training
 *   docker exec accelerator-backend node dist/scripts/enableBrandSnackbar.js colaberry-training --apply
 *   docker exec accelerator-backend node dist/scripts/enableBrandSnackbar.js --all
 *
 * Output: one line per brand, plus each of its published hosted pages and the effective state the
 * renderer will compute for it.
 */

import { connectDatabase } from '../config/database';
import '../models';
import { Brand, LandingPage } from '../models';
import { isSnackbarEnabled } from '../services/marketing/landingPageSnackbar';

interface Args {
  slugs: string[];
  all: boolean;
  apply: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const flags = argv.filter((a) => a.startsWith('--'));
  const slugs = argv.filter((a) => !a.startsWith('--'));
  return {
    slugs,
    all: flags.includes('--all'),
    apply: flags.includes('--apply'),
  };
}

function describeOverride(override: boolean | null): string {
  if (override === null) return 'follows brand';
  return override ? 'forced ON' : 'forced OFF';
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.all && args.slugs.length === 0) {
    console.error('Usage: enableBrandSnackbar.js <brand-slug> [...] [--apply]');
    console.error('       enableBrandSnackbar.js --all [--apply]');
    process.exit(2);
  }

  await connectDatabase();

  const brands = args.all
    ? await Brand.findAll({ order: [['slug', 'ASC']] })
    : await Brand.findAll({ where: { slug: args.slugs }, order: [['slug', 'ASC']] });

  if (brands.length === 0) {
    console.error(`No brand matched: ${args.slugs.join(', ')}`);
    process.exit(1);
  }

  if (!args.all) {
    const found = new Set(brands.map((b) => b.slug));
    const absent = args.slugs.filter((s) => !found.has(s));
    if (absent.length) console.error(`WARNING: no brand with slug: ${absent.join(', ')}`);
  }

  console.log(args.apply ? '=== APPLYING ===' : '=== DRY RUN (no writes; pass --apply) ===');

  let changed = 0;
  let alreadyOn = 0;

  for (const brand of brands) {
    const before = brand.snackbar_default_enabled;
    const willChange = before !== true;
    if (willChange) {
      changed += 1;
      if (args.apply) {
        // Idempotent by its WHERE: a brand already true is not written again.
        await Brand.update(
          { snackbar_default_enabled: true },
          { where: { id: brand.id, snackbar_default_enabled: false } },
        );
      }
    } else {
      alreadyOn += 1;
    }

    const verb = willChange ? (args.apply ? 'ENABLED' : 'would enable') : 'already on';
    console.log(`\n${brand.slug} (${brand.name}) — brand default ${before} → ${verb}`);

    const pages = await LandingPage.findAll({
      where: { brand_id: brand.id, kind: 'hosted', status: 'published' },
      order: [['slug', 'ASC']],
    });

    if (pages.length === 0) {
      console.log('  no published hosted pages — nothing renders a snack bar for this brand yet');
      continue;
    }

    for (const page of pages) {
      const effectiveDefault = willChange ? true : before;
      const effective = isSnackbarEnabled(effectiveDefault, page.snackbar_enabled);
      console.log(
        `  /lp/${brand.slug}/${page.slug} — page override: ${describeOverride(page.snackbar_enabled)}`
        + ` → snack bar ${effective ? 'SHOWS' : 'hidden'}`,
      );
    }
  }

  console.log(
    `\n${brands.length} brand(s): ${changed} ${args.apply ? 'changed' : 'to change'}, ${alreadyOn} already on.`,
  );
  if (!args.apply && changed > 0) console.log('Re-run with --apply to write.');

  process.exit(0);
}

if (require.main === module) {
  run().catch((err: unknown) => {
    console.error('enableBrandSnackbar failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
