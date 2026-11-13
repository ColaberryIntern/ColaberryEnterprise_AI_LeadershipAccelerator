/**
 * SV0.3 (Services Upgrade, Basecamp todo 10506775213): validate docs/services/taxonomy_v2.json against the catalog
 * snapshot and the whitepaper manifest. Read-only; exits 1 with every problem listed if the taxonomy breaks the
 * Gov AI Compatibility Contract. SV2.2 runs this before it writes a single service row.
 *
 *   npx ts-node --transpile-only src/scripts/validateServicesTaxonomy.ts [docsServicesDir]
 */
import fs from 'fs';
import path from 'path';
import { CatalogSnapshot, Manifest, TaxonomyV2 } from '../services/servicesUpgrade/schemas';
import { validateTaxonomy } from '../services/servicesUpgrade/taxonomyValidator';

function main(): void {
  const dir = process.argv[2] || path.join(__dirname, '..', '..', '..', 'docs', 'services');
  const read = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const taxonomy = TaxonomyV2.parse(read('taxonomy_v2.json'));
  // basedOnSnapshot is repo-relative (docs/services/baseline/...); dir is <repo>/docs/services.
  const repoRoot = path.join(dir, '..', '..');
  const snapshot = CatalogSnapshot.parse(JSON.parse(fs.readFileSync(path.join(repoRoot, taxonomy.basedOnSnapshot), 'utf8')));
  const manifest = Manifest.parse(read('whitepaper_manifest.json'));
  const problems = validateTaxonomy(taxonomy, snapshot, manifest);
  if (problems.length) {
    console.error(JSON.stringify({ event: 'svc_taxonomy_invalid', outcome: 'failure', error_class: 'ContractViolation', problems }, null, 2));
    process.exitCode = 1;
    return;
  }
  const counts = taxonomy.services.reduce<Record<string, number>>((a, s) => ({ ...a, [s.action]: (a[s.action] || 0) + 1 }), {});
  console.log(JSON.stringify({ event: 'svc_taxonomy_valid', outcome: 'success', services: taxonomy.services.length, ...counts }));
}

main();
