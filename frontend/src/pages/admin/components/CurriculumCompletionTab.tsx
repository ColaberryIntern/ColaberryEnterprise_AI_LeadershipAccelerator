import React, { useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';

/**
 * Curriculum completion — which parts of the curriculum this cohort is actually finishing.
 *
 * A HEATMAP, NOT A LIST OF BARS. Weeks are rows, the seven curriculum sections are columns,
 * and every cell is the mean completion of that section in that week. The bar-per-week
 * version this replaces answered "how much of week 4 got done" and hid the only question
 * worth asking next: WHICH PART of it. Two weeks reading 13% and 12% look identical as bars
 * while one lost its Build cards and the other lost Reflect.
 *
 * The shape is legible the moment it renders. Against the July 2026 cohort, `advance` is
 * 0% in every week but the first, and `share` and `build` collapse after week 3 while
 * `learn` and `pre_class` hold — a pattern that was present in the old view and unreadable
 * in it.
 *
 * ORDER IS THE CURRICULUM'S, NOT A RANKING. Weeks ascend; columns run pre-class → learn →
 * practice → build → reflect → share → advance, the order a week is taught. Sorting either
 * axis by completion would answer "what is finished" while destroying the thing the view is
 * for — seeing WHERE in the sequence people stop.
 *
 * UNPUBLISHED IS EXCLUDED FROM THE MEANS, NOT HIDDEN. The API already averages published
 * cards only. Unpublished cards still appear in the drill-down, hatched, because a card
 * withheld from students is a fact about the curriculum, not noise.
 *
 * PACE LIVES ON THE CLASS DASHBOARD, NOT HERE. The gold/green/yellow/red bands and the
 * per-student table are `StudentPacePanel`. This tab answers "which parts of the curriculum
 * are people finishing"; that panel answers "where is each student". Same endpoint,
 * opposite halves.
 */

interface Card {
  id: string; title: string; type: string; bucket: string; order: number;
  published: boolean; completedCount: number; completedPct: number;
}
interface Section { bucket: string; cardCount: number; completedPct: number; cards: Card[] }
interface Week {
  week: number | null; cardCount: number; publishedCardCount: number; completedPct: number;
  studentsCompletedAny: number; isScheduledWeek: boolean; sections: Section[];
}
/** The response also carries `pace` and `students`; StudentPacePanel renders those on the
 *  Class Dashboard and fetches them with `?view=pace`. This tab reads the tree only. */
interface Completion {
  scheduledWeek: number; deliveredSessions: number; activeStudents: number;
  weeks: Week[];
}

/** The order a week is taught. The API sorts sections this way too; the UI repeats it
 *  because it must render a column for a section a given week does not have at all. */
const BUCKETS = [
  'pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance',
] as const;

const BUCKET_LABEL: Record<string, string> = {
  pre_class: 'Pre-class', learn: 'Learn', practice: 'Practice', build: 'Build',
  reflect: 'Reflect', share: 'Share', advance: 'Advance',
};

/**
 * The ramp, from Ali's prototype. Six steps of one hue rather than a red-to-green scale,
 * because these numbers are a density and not a pass/fail — 23% of a cohort completing a
 * card is genuinely good here, and a stoplight palette would paint the whole curriculum red
 * and distinguish nothing.
 */
const RAMP = ['#f2f5fa', '#d4e2f6', '#a9c6ec', '#6f9fdd', '#2f6fc8', '#164a93'];
const HATCH = 'repeating-linear-gradient(135deg,#efeee9 0 4px,#e2e1da 4px 8px)';

/**
 * BREAKPOINTS ARE MEASURED, NOT CHOSEN. The prototype used 10/25/40/55, which suits
 * card-level numbers (they reach 63.3%) but not the section means this grid is mostly made
 * of — those top out at 32%, so the top two shades never rendered at all.
 *
 * Counted across the July 2026 cohort's 90 section cells and 1,268 published card cells:
 *
 *   10/25/40/55  sections 12 / 55 / 21 / 2 / 0 / 0   <- two shades unused, 55 in one bucket
 *    5/12/22/32  sections 12 / 44 / 11 / 18 / 4 / 1  <- all six used
 *
 * The first is a heatmap that renders almost entirely in one tint, which is the same as
 * having no heatmap. Shade 1 still holds 44 cells under the second, and that is honest:
 * weeks 7 to 12 have not been taught yet and genuinely sit near zero.
 *
 * Card cells share the scale rather than getting their own. A colour has to mean the same
 * thing in a week row and in the card row under it, or the drill-down silently re-bases and
 * a card looks stronger than the section containing it.
 */
export function shadeFor(pct: number): number {
  if (pct >= 32) return 5;
  if (pct >= 22) return 4;
  if (pct >= 12) return 3;
  if (pct >= 5) return 2;
  if (pct > 0) return 1;
  return 0;
}

/** One cell. `dark` flips the text at the point the background stops being a light tint. */
function Cell({ pct, sub, title }: { pct: number; sub?: string; title?: string }) {
  const s = shadeFor(pct);
  return (
    <div
      title={title}
      style={{
        background: RAMP[s],
        color: s >= 4 ? '#fff' : '#1c1c1a',
        borderRadius: 4,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {Math.round(pct)}%
      {sub && <small style={{ marginLeft: 5, opacity: 0.7, fontSize: 11 }}>{sub}</small>}
    </div>
  );
}

function EmptyCell({ label, hatched }: { label: string; hatched?: boolean }) {
  return (
    <div
      title={label === '—' ? 'No cards of this type in this week' : label}
      style={{
        background: hatched ? HATCH : 'transparent',
        border: hatched ? '1px solid #e3e2dc' : '1px dashed #e3e2dc',
        borderRadius: 4,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: '#8f8e88',
      }}
    >
      {label}
    </div>
  );
}

export default function CurriculumCompletionTab({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<Completion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum-completion`)
      .then((res) => { if (live) setData(res.data); })
      .catch((e) => { if (live) setError(e?.response?.data?.error || 'Could not load curriculum completion'); });
    return () => { live = false; };
  }, [cohortId]);

  useEffect(() => { setOpenWeeks(new Set()); }, [cohortId]);

  const toggle = (key: string) => setOpenWeeks((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const totals = useMemo(() => {
    if (!data) return null;
    const scheduled = data.weeks.filter((w) => w.week !== null && w.week <= data.scheduledWeek);
    const ahead = data.weeks.filter((w) => w.week !== null && w.week > data.scheduledWeek);
    const mean = (arr: Week[]) => (arr.length
      ? Math.round((arr.reduce((s, w) => s + w.completedPct, 0) / arr.length) * 10) / 10 : 0);
    return { taught: mean(scheduled), ahead: mean(ahead) };
  }, [data]);

  /** Column means across every week, so a section that the cohort skips wholesale reads as
   *  one number instead of having to be traced down the column. */
  const columnMeans = useMemo(() => {
    if (!data) return {} as Record<string, number | null>;
    const out: Record<string, number | null> = {};
    BUCKETS.forEach((b) => {
      const vals = data.weeks
        .map((w) => w.sections.find((s) => s.bucket === b))
        .filter((s): s is Section => Boolean(s) && (s as Section).cards.some((c) => c.published))
        .map((s) => s.completedPct);
      out[b] = vals.length
        ? Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10 : null;
    });
    return out;
  }, [data]);

  if (error) return <div className="alert alert-warning">{error}</div>;
  if (!data) return <div className="text-muted p-3">Loading curriculum completion...</div>;

  const colWidth = `${Math.floor(52 / BUCKETS.length)}%`;

  return (
    <div data-testid="curriculum-completion">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-2">
        <div>
          <h5 className="mb-1">Curriculum completion</h5>
          <p className="text-muted small mb-0">
            Mean share of {data.activeStudents} active students completing each section&apos;s
            cards, in curriculum order. The class is on <strong>week {data.scheduledWeek}</strong>,
            from {data.deliveredSessions} sessions delivered. Click a week to open its cards.
          </p>
        </div>
        {/* Carried over from the duplicate curriculum section this view replaced. That
            section was read-only apart from this one control, and authoring has to stay
            one click away. */}
        <a
          className="btn btn-sm btn-outline-primary text-nowrap"
          href="/admin/orchestration?tab=composer"
          target="_blank"
          rel="noreferrer"
        >
          Open Composer
        </a>
      </div>

      {/* Legend. Without it the ramp is decoration; with it every cell is readable. */}
      <div className="d-flex align-items-center gap-2 flex-wrap mb-3 small text-muted">
        <span>0%</span>
        <span className="d-flex" style={{ gap: 2 }}>
          {RAMP.map((c) => (
            <i key={c} style={{ width: 26, height: 12, background: c, borderRadius: 2, display: 'block' }} />
          ))}
        </span>
        <span>32%+</span>
        <span className="ms-3 d-inline-flex align-items-center gap-1">
          <i style={{ width: 26, height: 12, background: HATCH, border: '1px solid #e3e2dc', borderRadius: 2, display: 'block' }} />
          unpublished, excluded from the means
        </span>
      </div>

      {totals && (
        <p className="small text-muted">
          Mean completion across weeks already taught: <strong>{totals.taught}%</strong>.
          Weeks not yet reached: <strong>{totals.ahead}%</strong>.
        </p>
      )}

      <div className="table-responsive mb-4">
        <table className="table table-sm align-middle" style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
          <thead>
            <tr>
              <th style={{ width: '26%' }}>Week</th>
              {BUCKETS.map((b) => (
                <th key={b} className="text-center small" style={{ width: colWidth }}>
                  {BUCKET_LABEL[b]}
                  <span className="d-block text-muted fw-normal" style={{ fontSize: 11 }}>
                    {columnMeans[b] === null ? 'no cards' : `${columnMeans[b]}% avg`}
                  </span>
                </th>
              ))}
              <th className="text-center small" style={{ width: '10%' }}>
                All
                <span className="d-block text-muted fw-normal" style={{ fontSize: 11 }}>week</span>
              </th>
              <th className="small" style={{ width: '12%' }}>Reached</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => {
              const key = String(w.week);
              const open = openWeeks.has(key);
              const byBucket = new Map(w.sections.map((s) => [s.bucket, s]));
              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    style={{ cursor: 'pointer' }}
                    className={w.isScheduledWeek ? 'table-active' : undefined}
                  >
                    <td>
                      <i
                        className={`ri-arrow-${open ? 'down' : 'right'}-s-line me-1`}
                        aria-hidden="true"
                      />
                      <strong>{w.week === null ? 'Unscheduled library' : `Week ${w.week}`}</strong>
                      {w.isScheduledWeek && <span className="badge bg-dark ms-2">class is here</span>}
                      <span className="d-block text-muted" style={{ fontSize: 11, paddingLeft: 20 }}>
                        {w.publishedCardCount} cards
                        {w.cardCount !== w.publishedCardCount
                          && ` +${w.cardCount - w.publishedCardCount} unpub`}
                      </span>
                    </td>
                    {BUCKETS.map((b) => {
                      const sec = byBucket.get(b);
                      const publishedInSection = sec?.cards.filter((c) => c.published).length ?? 0;
                      if (!sec || !publishedInSection) {
                        return <td key={b}><EmptyCell label="—" /></td>;
                      }
                      return (
                        <td key={b}>
                          <Cell
                            pct={sec.completedPct}
                            title={`${BUCKET_LABEL[b]}, week ${w.week ?? '—'}: ${sec.completedPct}% across ${publishedInSection} published card${publishedInSection === 1 ? '' : 's'}`}
                          />
                        </td>
                      );
                    })}
                    <td><Cell pct={w.completedPct} title={`Whole week: ${w.completedPct}%`} /></td>
                    <td className="small">{w.studentsCompletedAny} of {data.activeStudents}</td>
                  </tr>

                  {/* Drill-down: one row per card, sitting under its own section column, so a
                      card's position in the grid still says which part of the week it is. */}
                  {open && w.sections.flatMap((sec) => sec.cards).map((card) => (
                    <tr key={card.id}>
                      <td className="small" style={{ paddingLeft: 28 }}>
                        {/* CARDS ARE AUTHORED IN THE COMPOSER. This used to point at
                            `/admin/curriculum?card=<id>`, which is not a route in
                            adminRoutes.tsx at all — every card title was a dead link. The
                            Composer is the real destination, but it reads only `?tab=` and
                            `?type=`, so it cannot focus a single card yet; the id rides
                            along so the link starts working the day it can. */}
                        <a
                          href={`/admin/orchestration?tab=composer&card=${card.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className={card.published ? undefined : 'text-muted'}
                          onClick={(e) => e.stopPropagation()}
                          title="Open the Composer — it cannot jump to a single card yet"
                        >
                          {card.title || '(untitled)'}
                        </a>
                        {!card.published && (
                          <span className="badge bg-secondary ms-2" style={{ fontSize: 10 }}>not published</span>
                        )}
                      </td>
                      {BUCKETS.map((b) => {
                        if (b !== card.bucket) return <td key={b} />;
                        if (!card.published) {
                          return <td key={b}><EmptyCell label="unpub" hatched /></td>;
                        }
                        return (
                          <td key={b}>
                            <Cell
                              pct={card.completedPct}
                              sub={String(card.completedCount)}
                              title={`${card.completedCount} of ${data.activeStudents} students`}
                            />
                          </td>
                        );
                      })}
                      <td />
                      <td />
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
