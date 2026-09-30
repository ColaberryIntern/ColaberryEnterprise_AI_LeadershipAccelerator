/**
 * capstoneReaders — the two Capstone Record bands that do not come from the
 * project: what the student can prove, and what they said along the way.
 *
 * Both were previously hardcoded to `[]` in capstoneRecordStore.gatherInputs,
 * which was the honest placeholder while no reader existed — an absent band
 * renders as absent, never as zero. These are those readers.
 *
 * ── SHAPE: PURE EXTRACTION, THIN I/O ────────────────────────────────────────
 *
 * The interesting logic — which ritual field is the headline, which fields make
 * up the body, how a domain gets its label — is pure and exported, so it is
 * tested from literals rather than from a database. The exported `read*`
 * functions are the thin I/O shell around it and degrade to `[]` rather than
 * throwing: one unreadable band must not cost a student their whole record.
 *
 * ── REVOKING CONSENT MUST RECOMPILE ─────────────────────────────────────────
 *
 * READ THIS BEFORE BUILDING THE CONSENT TOGGLE.
 *
 * A published record is served from the STORED snapshot (`content_json`), which
 * is what keeps an already-sent link stable. That design has one sharp edge, and
 * it points at consent: clearing `shared_to_portfolio` on a post changes what
 * THIS reader returns, but it does not touch a snapshot that was compiled while
 * the flag was still set. The post stays on the live public page until something
 * recompiles the record.
 *
 * So the toggle that clears the flag MUST call `compileAndStore(projectId)` in
 * the same request, and must not report success to the student until it has.
 * "I unshared it" has to mean the page changed, not that a column changed. No
 * student can grant consent yet — there is no UI — so this is latent rather than
 * live, which is exactly why it is written down here rather than discovered by
 * the first person who revokes.
 */
import { RITUALS, RitualConfig } from '../runtime/communityRituals';
import type { CompilerInputs } from './capstoneRecordCompiler';

/** A ritual post's stored field values, keyed by RitualField.key. */
export type RitualValues = Record<string, string | string[]>;

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

/** A field value may be a list; render it the way the wall does. */
function valueToText(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return clean(v.map((x) => String(x).trim()).filter(Boolean).join(', '));
  return clean(v);
}

/**
 * Split one ritual post into the headline and the body beneath it.
 *
 * The field selection MIRRORS the cohort wall (PeerWinsPanel's `storyFields`):
 * the configured `headlineField` is the headline, and the body is the remaining
 * prose fields — never the link, the chip list, the copy-box prompt, or the
 * debate side, all of which are wall furniture that reads as noise stripped of
 * the wall around it.
 *
 * Mirroring rather than inventing a second rule matters because the student
 * approved what they saw on the wall. A portfolio that silently surfaces a
 * different subset of their answer is publishing something they never reviewed.
 *
 * Dropping the `mono` field costs less than it appears. Week 4's ritual puts the
 * student's best prompt in a copy box, and excluding it here leaves only their
 * sentence about what it is for — but the prompt itself is already on the record
 * in the artifacts band, as the real file from their `prompts/` folder, linked at
 * the commit it was written in. Re-printing it as a paragraph would be a worse
 * copy of something the record already links properly.
 */
export function ritualHeadlineAndBody(
  week: number,
  values: RitualValues | null | undefined,
): { headline: string | null; body: string | null } {
  const ritual: RitualConfig | undefined = RITUALS[week];
  if (!ritual || !values) return { headline: null, body: null };

  const headline = valueToText(values[ritual.headlineField]);

  const bodyFields = ritual.fields.filter(
    (f) => f.key !== ritual.headlineField && f.kind !== 'link' && f.kind !== 'list' && f.kind !== 'choice' && !f.mono,
  );
  const body = clean(
    bodyFields
      .map((f) => valueToText(values[f.key]))
      .filter(Boolean)
      .join('\n\n'),
  );

  return { headline, body };
}

// ── competencies ────────────────────────────────────────────────────────────

export interface RawCompetencyRow { domain_id: string; evidence_count?: number | null }
export interface RawDomainRow { domain_id: string; name?: string | null }

/**
 * Attach a human label to each scored domain. PURE.
 *
 * `confidence` is deliberately NOT carried onto the record. It is a model's
 * estimate, and a portfolio that prints "Governance 0.62" invites a reader to
 * treat a derived number as a grade the student earned. The record shows how
 * many distinct pieces of evidence support a claim instead, which is a fact,
 * and which the reader can go and check against the linked artifacts.
 *
 * A domain with no matching row in `competency_domains` keeps a null label; the
 * compiler falls back to the domain_id rather than dropping the row, so a
 * missing seed degrades to an ugly label, not to a silently shorter list.
 */
export function mapCompetencies(
  rows: RawCompetencyRow[],
  domains: RawDomainRow[],
): CompilerInputs['competencies'] {
  const labelById = new Map<string, string>();
  for (const d of domains) {
    const label = clean(d.name);
    if (d.domain_id && label) labelById.set(d.domain_id, label);
  }
  return rows.map((r) => ({
    domain_id: r.domain_id,
    label: labelById.get(r.domain_id) ?? null,
    evidence_count: r.evidence_count ?? 0,
  }));
}

/**
 * Read one student's scored competency domains.
 *
 * The zero-evidence filter lives in the compiler, not here, so the rule that a
 * competency needs evidence to appear is stated in exactly one place.
 */
export async function readCompetencies(enrollmentId: string): Promise<CompilerInputs['competencies']> {
  try {
    const { default: StudentCompetency } = await import('../../models/StudentCompetency');
    const { default: CompetencyDomain } = await import('../../models/CompetencyDomain');

    const rows: any[] = await StudentCompetency.findAll({ where: { enrollment_id: enrollmentId } });
    if (!rows.length) return [];

    const domains: any[] = await CompetencyDomain.findAll({ where: { is_active: true } }).catch(() => []);
    return mapCompetencies(
      rows.map((r) => ({ domain_id: String(r.domain_id), evidence_count: r.evidence_count })),
      domains.map((d) => ({ domain_id: String(d.domain_id), name: d.name })),
    );
  } catch (err: any) {
    console.warn('[capstone] competencies unreadable:', err?.message);
    return [];
  }
}

// ── community posts ─────────────────────────────────────────────────────────

export interface RawPostRow {
  week: number | null;
  ritual_meta?: { ritual?: string; values?: RitualValues } | null;
  /** Used only to pick one post per week; never rendered. */
  updated_at?: Date | string | null;
  /** Tiebreak only. Two posts with the same timestamp must still resolve the same way. */
  id?: string | null;
}

/**
 * Turn consented post rows into the compiler's post inputs. PURE.
 *
 * ONE POST PER WEEK. A student can edit or re-post a ritual, and two rows for
 * week 12 would render the manifesto twice and make `deriveHeadline` depend on
 * which row the database happened to return first. The most recently updated
 * row wins, which is the one the student last chose to stand behind.
 *
 * The id tiebreak is not decoration. `findAll` without an ORDER BY returns rows
 * in whatever order Postgres finds them, so two posts sharing a timestamp — or
 * both missing one — would resolve differently between two runs, and the record
 * would version on every compile while nothing had actually changed. That is the
 * same class of bug as a clock in a pure compiler: non-determinism upstream
 * defeats determinism downstream. The query orders too; this makes the pure
 * function correct on its own rather than correct only when well fed.
 *
 * Every row reaching here has already had consent checked at the query. `shared`
 * is set true rather than read from the row for exactly that reason: it is the
 * caller's job to have filtered, and passing an unconsented row into this
 * function should be impossible rather than merely discouraged.
 */
export function mapSharedPosts(rows: RawPostRow[]): CompilerInputs['posts'] {
  const latestByWeek = new Map<number, RawPostRow>();
  for (const row of rows) {
    if (typeof row.week !== 'number') continue;
    const current = latestByWeek.get(row.week);
    if (!current) { latestByWeek.set(row.week, row); continue; }
    // An unparseable or absent timestamp sorts as 0 rather than NaN, so it loses
    // to any real one instead of poisoning the comparison (every NaN comparison
    // is false, which would silently keep whichever row arrived first).
    const stamp = (r: RawPostRow) => {
      const t = new Date(r.updated_at ?? 0).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const a = stamp(current); const b = stamp(row);
    if (b > a || (b === a && String(row.id ?? '') > String(current.id ?? ''))) {
      latestByWeek.set(row.week, row);
    }
  }

  const out: CompilerInputs['posts'] = [];
  for (const [week, row] of latestByWeek) {
    const { headline, body } = ritualHeadlineAndBody(week, row.ritual_meta?.values);
    // No headline means nothing to show. The compiler drops these too; skipping
    // here keeps the record from carrying rows that render as an empty card.
    if (!headline) continue;
    out.push({ week, headline, body, shared: true });
  }
  return out.sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
}

/**
 * Read the ritual posts this student has consented to publish.
 *
 * Two filters, both load-bearing:
 *
 *   shared_to_portfolio = true — consent is per post and defaults off. Being
 *     visible on the cohort wall is not consent to appear on a public page.
 *   status = 'visible'         — a post removed by moderation must never
 *     resurface on a portfolio because consent was granted before it was
 *     removed. Moderation has to win over a stale grant, and the only way it
 *     reliably does is if this query never sees removed rows.
 */
export async function readSharedPosts(enrollmentId: string): Promise<CompilerInputs['posts']> {
  try {
    const { default: CommunityMember } = await import('../../models/CommunityMember');
    const member: any = await CommunityMember.findOne({ where: { enrollment_id: enrollmentId } });
    // No community member row is the normal state for a student who never
    // posted, not an error.
    if (!member) return [];

    const { default: CommunityPost } = await import('../../models/CommunityPost');
    const rows: any[] = await CommunityPost.findAll({
      where: { member_id: member.id, shared_to_portfolio: true, status: 'visible' },
      // Explicit ordering because an unordered findAll returns whatever order
      // Postgres happens to produce, and the record's determinism depends on
      // this input being stable across compiles.
      order: [['updated_at', 'ASC'], ['id', 'ASC']],
    });

    return mapSharedPosts(rows.map((r) => ({
      week: typeof r.week === 'number' ? r.week : null,
      ritual_meta: r.ritual_meta,
      updated_at: r.updated_at,
      id: r.id ? String(r.id) : null,
    })));
  } catch (err: any) {
    console.warn('[capstone] community posts unreadable:', err?.message);
    return [];
  }
}
