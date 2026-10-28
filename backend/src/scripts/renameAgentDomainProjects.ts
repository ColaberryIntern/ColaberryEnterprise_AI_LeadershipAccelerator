/**
 * Renames the ten agent-domain projects from their raw machine key to their human title.
 * AF2.7 item 3.
 *
 * The provisioner wrote `name: plan.domain_key`, so all ten landed in production reading
 * `admissions`, `product_experience`, `learner_success` — snake_case, lower case — on the same
 * surfaces where every other student project carries a real name. The provisioner is fixed, but
 * it creates rows with `findOrCreate`, which honours `defaults` ONLY when it actually creates.
 * A re-run is a deliberate no-op, so it will never repair a row that already exists. This does.
 *
 * Names come from `domainProjectName` — the SAME function the provisioner now calls — so a row
 * this script renames and a row the provisioner creates can never end up with different text.
 *
 * Idempotent: a row already carrying its title is counted and skipped, so a second run writes
 * nothing. A row carrying neither the key nor the title was renamed by somebody on purpose, and
 * is reported and LEFT ALONE rather than overwritten — a cosmetic repair must not clobber a
 * deliberate human edit.
 *
 * Run (dry-run, default — prints what WOULD change, writes nothing):
 *   npx ts-node src/scripts/renameAgentDomainProjects.ts
 * Run (applies the writes):
 *   npx ts-node src/scripts/renameAgentDomainProjects.ts --execute
 */
import Project from '../models/Project';
import { derivedProjectId } from '../services/agentDomain/agentDomainProvisionPlan';
import { AGENT_DOMAIN_KEYS, domainProjectName } from '../services/agentDomain/agentDomainRegistry';

export interface RenameOutcome {
  readonly domain_key: string;
  readonly project_id: string;
  readonly from: string | null;
  readonly to: string;
  /** `missing` — no such project row. `already` — nothing to do. `renamed` — key -> title.
   *  `skipped_custom` — a name that is neither, so somebody set it deliberately. */
  readonly action: 'missing' | 'already' | 'renamed' | 'skipped_custom';
}

export async function planRenames(): Promise<RenameOutcome[]> {
  const out: RenameOutcome[] = [];
  for (const domainKey of AGENT_DOMAIN_KEYS) {
    const projectId = derivedProjectId(domainKey);
    const title = domainProjectName(domainKey);
    // eslint-disable-next-line no-await-in-loop
    const row = await Project.findByPk(projectId, { attributes: ['id', 'name'] });
    const current = row ? (row.name ?? null) : null;

    let action: RenameOutcome['action'];
    if (!row) action = 'missing';
    else if (current === title) action = 'already';
    else if (current === domainKey) action = 'renamed';
    else action = 'skipped_custom';

    out.push({ domain_key: domainKey, project_id: projectId, from: current, to: title, action });
  }
  return out;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const execute = argv.includes('--execute');
  const outcomes = await planRenames();

  for (const o of outcomes) {
    if (o.action === 'renamed') {
      if (execute) {
        // Scoped to `name` by the explicit `fields` list: this row carries the lifecycle the
        // provisioner registered, and a full-instance save would rewrite columns this repair has
        // no business touching.
        // eslint-disable-next-line no-await-in-loop
        await Project.update({ name: o.to }, { where: { id: o.project_id }, fields: ['name'] });
      }
      console.log(`${execute ? 'RENAMED' : 'WOULD RENAME'}  ${o.domain_key}: ${JSON.stringify(o.from)} -> ${JSON.stringify(o.to)}`);
    } else if (o.action === 'skipped_custom') {
      console.log(`SKIPPED (custom name, left alone)  ${o.domain_key}: ${JSON.stringify(o.from)}`);
    } else if (o.action === 'missing') {
      console.log(`MISSING (no project row)  ${o.domain_key}  ${o.project_id}`);
    } else {
      console.log(`ALREADY CORRECT  ${o.domain_key}: ${JSON.stringify(o.from)}`);
    }
  }

  const count = (a: RenameOutcome['action']): number => outcomes.filter((o) => o.action === a).length;
  console.log(`\n${execute ? 'applied' : 'dry run'} — ${count('renamed')} to rename, ${count('already')} already correct, `
    + `${count('skipped_custom')} custom (untouched), ${count('missing')} missing, ${outcomes.length} domains checked`);
  if (!execute && count('renamed') > 0) console.log('Re-run with --execute to apply.');
}

/* istanbul ignore next — entry point only; `main` is what the tests drive. */
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('renameAgentDomainProjects failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
