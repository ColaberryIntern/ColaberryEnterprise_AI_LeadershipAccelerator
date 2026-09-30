import fs from 'fs';
import path from 'path';
import type {
  CaseStudyRepoAccessStatus,
  CaseStudySyncStatus,
  CaseStudySyncTrigger,
} from '../../types/caseStudy';

/**
 * Every `a | b | c` doc comment on a Case Study model must list exactly the
 * union that governs its column.
 *
 * WHY THIS EXISTS. An audit of all 30 such comments found 13 wrong. Not
 * imprecise — wrong, in both directions at once: naming values nothing can
 * produce while omitting values the code writes every day. `case_studies.status`
 * omitted `published`. `case_study_repositories.access_status` said
 * `ok | unauthorized | not_found | unknown` against a real union of
 * `connected | read_only | unavailable | deleted | rate_limited | unknown`, so
 * every value but one was invented and `access_status === 'ok'` is a condition
 * that can never be true. `case_study_snapshots.generated_by` had no member in
 * common with its union at all.
 *
 * These are not cosmetic. Every one of these columns is `DataTypes.STRING`, so
 * the model constrains nothing and the union is the entire contract. The comment
 * is where a reader meets that contract while looking at the table, and the
 * realistic failure is not confusion — it is someone widening a working guard to
 * match a broken comment, or writing a condition against a value that cannot
 * occur.
 *
 * So the rule is directional: COMMENTS FOLLOW THE UNION, never the reverse.
 *
 * HOW A COMMENT IS RESOLVED. Only two ways, both explicit:
 *   1. a union in `src/types/caseStudy*.ts` whose doc comment names the
 *      `table.column` it governs (a union may name several — `verification_class`
 *      is shared by three tables), or
 *   2. a `CHECK (col IN (...))` in the DDL.
 * There is deliberately NO fallback that matches a comment to a union by its
 * members. Such a fallback can only ever confirm a comment that is already
 * correct; a wrong comment matches nothing and is reported as merely unbacked.
 * That is exactly how five of the thirteen defects survived the first pass of
 * the audit that produced this file.
 *
 * Adding a member to any of these unions WILL fail this test. That is the point:
 * the failure names the comment to update, and the alternative is a comment that
 * silently stops being true.
 */

const SRC = path.join(__dirname, '..', '..');
const read = (p: string): string => fs.readFileSync(p, 'utf8');

/**
 * A doc comment and the field it precedes. The body may not contain a comment
 * terminator, so this always pairs a field with its OWN comment.
 *
 * It deliberately does not require the member list to sit at the start of a
 * single-line comment. An earlier version did, and so skipped both multi-line
 * comments on `CaseStudySyncRun` entirely — which meant the assertion that
 * `scheduled` is absent passed against an empty list rather than against the
 * comment, the precise failure this suite exists to prevent.
 */
const DOC_FIELD = /\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*(\w+)\??:/g;

/**
 * A member may contain a hyphen — `ai-flotation` is a real surface key. An
 * extractor stopping at the hyphen reports two correct comments as broken, which
 * is what the first version of this scan did.
 */
const MEMBER_RUN = /[a-z][a-z0-9_-]*(?:\s*\|\s*[a-z][a-z0-9_-]*)+/;

/** `case_stud`, not `case_study`: the table is `case_studies`, which the literal
 *  `case_study` cannot match. `case_study_metrics` does match, so the mapping
 *  looks mostly present while every `case_studies.*` column falls silently out. */
const COLUMN_REF = /`?(case_stud\w*)\.(\w+)`?/g;

interface Listing {
  readonly file: string;
  readonly field: string;
  readonly key: string;
  readonly documented: readonly string[];
}

function typesSource(): string {
  const dir = path.join(SRC, 'types');
  return fs
    .readdirSync(dir)
    .filter((f) => /^caseStudy\w*\.ts$/.test(f))
    .map((f) => read(path.join(dir, f)))
    .join('\n');
}

/** Union name -> members, across every Case Study types module. Reading only
 *  `caseStudy.ts` misses four unions that live in `caseStudyStory.ts`. */
function unions(source: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of source.matchAll(/export type (CaseStudy\w+)\s*=([^;]+);/g)) {
    const members = [...m[2].matchAll(/'([^']+)'/g)].map((q) => q[1]);
    if (members.length) out[m[1]] = members;
  }
  return out;
}

/**
 * `table.column` -> union name, from the annotation above each union.
 *
 * The comment body may not itself contain a comment terminator. Without that
 * guard the match can begin
 * at a DISTANT comment and run through intervening ones to reach the union, so a
 * column named in some unrelated comment is attributed to the wrong union. A
 * wrong mapping is worse than a missing one: it produces a confident verdict
 * against a contract that does not govern the field.
 */
function ownership(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*?)\*\/\s*export type (CaseStudy\w+)\s*=/g)) {
    for (const ref of m[1].matchAll(COLUMN_REF)) out[`${ref[1]}.${ref[2]}`] = m[2];
  }
  return out;
}

/** `table.column` -> the CHECK's IN list, across every DDL module. */
function ddlChecks(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const dir = path.join(SRC, 'db');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const src = read(path.join(dir, f));
    for (const table of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\s*\)`/g)) {
      for (const c of table[2].matchAll(/CHECK \((\w+) IN \(([^)]+)\)\)/g)) {
        out[`${table[1]}.${c[1]}`] = [...c[2].matchAll(/'([^']+)'/g)].map((q) => q[1]);
      }
    }
  }
  return out;
}

/** Every listing comment on every Case Study model, keyed by real table name. */
function listings(): Listing[] {
  const out: Listing[] = [];
  const dir = path.join(SRC, 'models');
  for (const f of fs.readdirSync(dir).filter((x) => /^CaseStudy.*\.ts$/.test(x))) {
    const src = read(path.join(dir, f));
    const table = src.match(/tableName:\s*'([^']+)'/)?.[1];
    if (!table) continue;
    for (const m of src.matchAll(DOC_FIELD)) {
      const run = m[1].match(MEMBER_RUN);
      if (!run) continue; // an ordinary prose comment, not a member listing
      out.push({
        file: f,
        field: m[2],
        key: `${table}.${m[2]}`,
        documented: run[0].split('|').map((s) => s.trim()),
      });
    }
  }
  return out;
}

const TYPES = typesSource();
const UNIONS = unions(TYPES);
const OWNS = ownership(TYPES);
const CHECKS = ddlChecks();
const LISTINGS = listings();

/** The members governing one column, or null when nothing claims it. */
function governing(key: string): { members: string[]; via: string } | null {
  if (OWNS[key] && UNIONS[OWNS[key]]) return { members: UNIONS[OWNS[key]], via: OWNS[key] };
  if (CHECKS[key]) return { members: CHECKS[key], via: 'DDL CHECK' };
  return null;
}

const documentedFor = (key: string): readonly string[] =>
  LISTINGS.find((l) => l.key === key)?.documented ?? [];

describe('Case Study model doc comments list exactly the unions that govern them', () => {
  it('reads a plausible amount of source, so no assertion below can pass vacuously', () => {
    // Every check in this file iterates over extracted items. If extraction
    // silently returns little or nothing, the iterations are empty and the suite
    // reports a clean bill of health over having read almost nothing. These
    // floors are well under the real counts (30 / 36 / 1) and exist only to
    // catch an extractor that has stopped working.
    expect(LISTINGS.length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(UNIONS).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(CHECKS).length).toBeGreaterThanOrEqual(1);
    // And specific known comments must be among them — a count alone is
    // satisfied by 25 wrong extractions. One single-line and one multi-line,
    // because an extractor that handles only the first shape still clears a
    // count floor while silently skipping every comment of the second.
    expect(LISTINGS.map((l) => l.key)).toContain('case_study_repositories.access_status');
    expect(LISTINGS.map((l) => l.key)).toContain('case_study_sync_runs.status');
  });

  it('resolves every listing comment to a union or a DDL CHECK', () => {
    const unresolved = LISTINGS.filter((l) => governing(l.key) === null).map(
      (l) => `${l.file} ${l.field} (${l.key})`
    );
    // An unresolved comment is not a lesser problem than a wrong one: it is a
    // comment nothing can check. Annotate the union with its `table.column` (or
    // add the union) rather than deleting the comment.
    expect(unresolved).toEqual([]);
  });

  it('documents exactly the members of the governing union, no more and no fewer', () => {
    const wrong = LISTINGS.map((l) => {
      const g = governing(l.key);
      if (!g) return null;
      const invented = l.documented.filter((d) => !g.members.includes(d));
      const missing = g.members.filter((m) => !l.documented.includes(m));
      if (!invented.length && !missing.length) return null;
      return `${l.file} ${l.field}: invented [${invented.join(', ')}], missing [${missing.join(', ')}] vs ${g.via}`;
    }).filter(Boolean);
    expect(wrong).toEqual([]);
  });

  describe('the individual defects this file was written for', () => {
    it('does not document `scheduled` on a sync trigger, which nothing can produce', () => {
      // The Zod enum in caseStudySyncService.ts rejects it outright, and there
      // is no cron entry for Case Study sync. Documenting it invites someone to
      // widen the enum to match.
      expect(documentedFor('case_study_sync_runs.trigger')).not.toContain('scheduled');
    });

    it('documents `unchanged`, the idempotent-rerun outcome of a sync', () => {
      // Its absence changes what a reader believes about re-running a sync: that
      // it must end in one of four states, and never in the fifth that a
      // correctly-behaving no-op actually returns.
      expect(documentedFor('case_study_sync_runs.status')).toContain('unchanged');
    });

    it('does not document `ok` as a repository access status', () => {
      // The worst of the thirteen. The real union has no `ok`, so any condition
      // written from the old comment — `access_status === 'ok'` — is false for
      // every row that will ever exist, and reads as correct.
      expect(documentedFor('case_study_repositories.access_status')).not.toContain('ok');
      expect(documentedFor('case_study_repositories.access_status')).toContain('connected');
    });

    it('documents `published` as a case study status', () => {
      // Omitted by the original comment. It is the status the entire product is
      // about.
      expect(documentedFor('case_studies.status')).toContain('published');
    });

    it('documents `anonymized` visibility, which the consent model depends on', () => {
      // The old comment offered `internal`, which does not exist, and omitted
      // `anonymized` — the visibility that carries the whole anonymisation axis.
      expect(documentedFor('case_studies.visibility')).toContain('anonymized');
      expect(documentedFor('case_studies.visibility')).not.toContain('internal');
    });
  });

  it('the unions are the source of truth, and the type system agrees', () => {
    // Compile-time corroboration that the parsed lists above are the real unions
    // rather than strings that happen to match: these assignments fail `tsc` if a
    // member is renamed or removed, which file reading cannot see.
    const trigger: CaseStudySyncTrigger = 'reconciliation';
    const status: CaseStudySyncStatus = 'unchanged';
    const access: CaseStudyRepoAccessStatus = 'connected';
    expect(UNIONS.CaseStudySyncTrigger).toContain(trigger);
    expect(UNIONS.CaseStudySyncStatus).toContain(status);
    expect(UNIONS.CaseStudyRepoAccessStatus).toContain(access);
  });
});
