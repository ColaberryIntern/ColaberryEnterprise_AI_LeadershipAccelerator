import React, { useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';

/**
 * Curriculum completion — which parts of the curriculum this cohort is actually finishing.
 *
 * WEEK FIRST, CARDS ON DEMAND. Ali: "I should see top level metrics at the week level and
 * then more when I drill down I can see the content metrics." A cohort has ~1,290 cards;
 * rendering them all flat is a wall nobody reads. Weeks collapse to one row each, and a
 * week opens into its sections.
 *
 * ORDER IS THE CURRICULUM'S, NOT A RANKING. Weeks ascend, sections are the buckets, cards
 * sit in their own `order`. Sorting by completion would answer "what is finished" while
 * destroying the thing the view is for — seeing WHERE in the sequence people stop.
 *
 * UNPUBLISHED SINKS. Within every section, unpublished cards fall to the bottom (the API
 * sorts them there) and render greyed. They stay visible because a card withheld from
 * students is a fact about the curriculum, not noise.
 *
 * PACE LIVES ON THE CLASS DASHBOARD, NOT HERE. The gold/green/yellow/red bands and the
 * per-student table were originally in this file, which buried them two clicks deep in a
 * drill-down tab and made a hand-written `?tab=curriculum` URL the only practical way to
 * reach them. They are now `StudentPacePanel`, rendered on the Class Dashboard where Ali
 * asked for them. This tab answers "which parts of the curriculum are people finishing";
 * that panel answers "where is each student". Same endpoint, opposite halves.
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

/**
 * One scale for every completion figure on the page, so a colour means the same thing in
 * the week row and in the card row under it. Thresholds are deliberately low: against 49
 * students, a card completed by a fifth of them is doing well, and a scale calibrated to
 * 80% would render the entire curriculum red and distinguish nothing.
 */
export function completionTone(pct: number): { cls: string; label: string } {
  if (pct >= 40) return { cls: 'success', label: 'strong' };
  if (pct >= 20) return { cls: 'primary', label: 'moderate' };
  if (pct >= 5) return { cls: 'warning', label: 'thin' };
  return { cls: 'danger', label: 'skipped' };
}

const bucketLabel = (b: string) => b.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Bar({ pct }: { pct: number }) {
  const tone = completionTone(pct);
  return (
    <div className="progress" style={{ height: 8, width: 120 }} title={`${pct}% — ${tone.label}`}>
      <div className={`progress-bar bg-${tone.cls}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function CurriculumCompletionTab({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<Completion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    let live = true;
    api.get(`/api/admin/accelerator/cohorts/${cohortId}/curriculum-completion`)
      .then((res) => { if (live) setData(res.data); })
      .catch((e) => { if (live) setError(e?.response?.data?.error || 'Could not load curriculum completion'); });
    return () => { live = false; };
  }, [cohortId]);

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

  if (error) return <div className="alert alert-warning">{error}</div>;
  if (!data) return <div className="text-muted p-3">Loading curriculum completion...</div>;

  return (
    <div data-testid="curriculum-completion">
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h5 className="mb-1">Curriculum completion</h5>
          <p className="text-muted small mb-0">
            Completion of every card, in curriculum order, against {data.activeStudents} active
            students. The class is on <strong>week {data.scheduledWeek}</strong>, from{' '}
            {data.deliveredSessions} sessions delivered.
          </p>
        </div>
      </div>

      {totals && (
        <p className="small text-muted">
          Mean completion across weeks already taught: <strong>{totals.taught}%</strong>.
          Weeks not yet reached: <strong>{totals.ahead}%</strong>.
        </p>
      )}

      <div className="table-responsive mb-4">
        <table className="table table-sm align-middle">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Week</th>
              <th style={{ width: 130 }}>Completion</th>
              <th style={{ width: 90 }}>Cards</th>
              <th>Students who completed anything</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => {
              const key = String(w.week);
              const open = openWeeks.has(key);
              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => toggle(key)}
                    style={{ cursor: 'pointer' }}
                    className={w.isScheduledWeek ? 'table-active' : undefined}
                  >
                    <td>
                      <strong>{w.week === null ? 'Unscheduled library' : `Week ${w.week}`}</strong>
                      {w.isScheduledWeek && <span className="badge bg-dark ms-2">class is here</span>}
                    </td>
                    <td><Bar pct={w.completedPct} /> <span className="small ms-1">{w.completedPct}%</span></td>
                    <td className="small">
                      {w.publishedCardCount}
                      {w.cardCount !== w.publishedCardCount && (
                        <span className="text-muted"> +{w.cardCount - w.publishedCardCount} unpub</span>
                      )}
                    </td>
                    <td className="small">{w.studentsCompletedAny} of {data.activeStudents}</td>
                  </tr>
                  {open && w.sections.map((sec) => (
                    <React.Fragment key={`${key}-${sec.bucket}`}>
                      <tr className="table-light">
                        <td className="ps-4 small fw-bold" colSpan={2}>{bucketLabel(sec.bucket)}</td>
                        <td className="small">{sec.cardCount}</td>
                        <td className="small">{sec.completedPct}%</td>
                      </tr>
                      {sec.cards.map((card) => (
                        <tr key={card.id} className={card.published ? undefined : 'text-muted'}>
                          <td className="ps-5 small" colSpan={2}>
                            {/* Clicking a card opens it where it is authored. Ali:
                                "clicking on that card takes me to the card in the curriculum." */}
                            <a
                              href={`/admin/curriculum?card=${card.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {card.title || '(untitled)'}
                            </a>
                            {!card.published && <span className="badge bg-secondary ms-2">not published</span>}
                          </td>
                          <td className="small">{card.completedCount}</td>
                          <td className="small">
                            <Bar pct={card.completedPct} />
                            <span className="ms-1">{card.completedPct}%</span>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
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
