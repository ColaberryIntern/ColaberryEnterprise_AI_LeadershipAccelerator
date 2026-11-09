/**
 * R4: attach Maya's memory rows to the PERSON they belong to, where the evidence supports it.
 *
 * admissions_memory rows are keyed on a browser fingerprint (visitor_id) and almost none carry a lead_id (measured
 * 2026-11-09: 114 rows, 1 linked). The evidence for a link is the visitors row of that fingerprint: when the platform
 * already linked the browser to a lead (visitors.lead_id), the memory row gets the same lead_id. Nothing else is
 * inferred: no name matching, no email guessing, and a row whose browser is not linked stays as it is.
 *
 * What it will NOT do:
 *   - overwrite a lead_id that is already set (only `lead_id IS NULL` rows are touched);
 *   - merge or delete rows. Once linked, two rows of one person resolve to ONE memory at read time
 *     (services/admissionsMemoryIdentity.ts picks the oldest), so nothing is destroyed and the change is reversible.
 *
 * Idempotent: a second confirmed run finds nothing unlinked that has evidence, and writes nothing.
 * Reversible: a confirmed run writes the ids it changed to a revert file; `--revert <file>` sets lead_id back to NULL on
 * exactly those ids (and only where the lead_id is still the one this script wrote).
 *
 * Usage, inside the production container:
 *   node dist/scripts/linkAdmissionsMemoryToLeads.js                        (dry run, the default: reports, writes nothing)
 *   node dist/scripts/linkAdmissionsMemoryToLeads.js --confirm-production   (writes the links, prints the revert file path)
 *   node dist/scripts/linkAdmissionsMemoryToLeads.js --revert <file>        (undoes exactly one confirmed run)
 */

import * as fs from 'fs';
import * as path from 'path';
import { QueryTypes } from 'sequelize';

export interface LinkCandidate { memoryId: string; visitorId: string; leadId: number }
export interface LinkReport { mode: 'dry-run' | 'confirmed'; before: { total: number; linked: number }; candidates: number; written: number; after: { total: number; linked: number }; revertFile: string | null }

export interface LinkDeps {
  counts: () => Promise<{ total: number; linked: number }>;
  candidates: () => Promise<LinkCandidate[]>;
  link: (c: LinkCandidate) => Promise<boolean>;
  writeRevert: (rows: LinkCandidate[]) => string;
}

const COUNTS_SQL = 'SELECT COUNT(*)::int AS total, COUNT(lead_id)::int AS linked FROM admissions_memory';
const CANDIDATES_SQL = `SELECT m.id AS "memoryId", m.visitor_id AS "visitorId", v.lead_id AS "leadId"
  FROM admissions_memory m JOIN visitors v ON v.id = m.visitor_id
  WHERE m.lead_id IS NULL AND v.lead_id IS NOT NULL ORDER BY m.created_at ASC`;
const LINK_SQL = 'UPDATE admissions_memory SET lead_id = :leadId WHERE id = :memoryId AND lead_id IS NULL';
const REVERT_SQL = 'UPDATE admissions_memory SET lead_id = NULL WHERE id = :memoryId AND lead_id = :leadId';

export async function runLink(confirm: boolean, deps: LinkDeps): Promise<LinkReport> {
  const before = await deps.counts();
  const candidates = await deps.candidates();
  if (!confirm) {
    return { mode: 'dry-run', before, candidates: candidates.length, written: 0, after: before, revertFile: null };
  }
  const done: LinkCandidate[] = [];
  let revertFile: string | null = null;
  try {
    for (const c of candidates) {
      if (await deps.link(c)) done.push(c);
    }
  } finally {
    // Written even when a link throws partway, so every row this run DID change can be reverted.
    if (done.length > 0) revertFile = deps.writeRevert(done);
  }
  return { mode: 'confirmed', before, candidates: candidates.length, written: done.length, after: await deps.counts(), revertFile };
}

async function sqlDeps(): Promise<LinkDeps & { revert: (c: LinkCandidate) => Promise<boolean> }> {
  const { sequelize } = await import('../config/database');
  const changed = (meta: unknown): number => (typeof meta === 'number' ? meta : (meta as { rowCount?: number })?.rowCount ?? 0);
  return {
    counts: async () => (await sequelize.query<{ total: number; linked: number }>(COUNTS_SQL, { type: QueryTypes.SELECT }))[0],
    candidates: () => sequelize.query<LinkCandidate>(CANDIDATES_SQL, { type: QueryTypes.SELECT }),
    link: async (c) => changed((await sequelize.query(LINK_SQL, { replacements: { leadId: c.leadId, memoryId: c.memoryId } }))[1]) === 1,
    revert: async (c) => changed((await sequelize.query(REVERT_SQL, { replacements: { leadId: c.leadId, memoryId: c.memoryId } }))[1]) === 1,
    writeRevert: (rows) => {
      const file = path.join(process.cwd(), `admissions-memory-link-revert-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2));
      return file;
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const deps = await sqlDeps();
  const { sequelize } = await import('../config/database');
  try {
    const revertAt = args.indexOf('--revert');
    if (revertAt >= 0) {
      const rows = JSON.parse(fs.readFileSync(args[revertAt + 1], 'utf8')) as LinkCandidate[];
      let undone = 0;
      for (const r of rows) if (await deps.revert(r)) undone++;
      console.log(JSON.stringify({ mode: 'revert', rows: rows.length, undone, after: await deps.counts() }));
      return;
    }
    console.log(JSON.stringify(await runLink(args.includes('--confirm-production'), deps)));
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', event: 'link_admissions_memory_failed', error_class: err instanceof Error ? err.name : 'UnknownError', message: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  });
}
