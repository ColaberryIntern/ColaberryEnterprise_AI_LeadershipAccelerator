import React, { useMemo, useState } from 'react';
import type { Readiness, ReadinessComponent } from './CaseStudyKpi';

/**
 * CaseStudyReadinessModal — what is missing, and a message that says so.
 *
 * Ali: "when I click on the Case Study score, I should see a popup that show's what's
 * missing to get the Case Study score up to a number where it can be turned into a
 * casestudy. This can generate a message that can tell the user what all needs to be added."
 *
 * The number was already traceable — the breakdown sat in a `title` tooltip. A tooltip is
 * unreadable on touch, uncopyable everywhere, and vanishes the moment you move to act on it,
 * which is exactly when you want it. Same data, a surface you can read and copy from.
 *
 * IT RANKS BY POINTS AVAILABLE, NOT BY WEIGHT. "Which gap should this student close first"
 * is answered by what is still unearned — a component worth 40 that already scores 1.0
 * offers nothing, while one worth 15 sitting at 0 offers all fifteen. Sorting by weight
 * would put the finished build at the top of a list of things to do.
 *
 * THE THRESHOLD IS 35, matching the "Case-study candidates" KPI on the page above. Stating
 * the same number twice from one constant is the point: a student told to reach 35 and a
 * dashboard counting candidates at 35 must never disagree.
 */

/** The score at which the delivery page starts counting a build as a candidate. */
export const CANDIDATE_THRESHOLD = 35;

/** Points still available on a component: its full weight less what it has earned. */
export const pointsAvailable = (c: ReadinessComponent): number =>
  Math.round(c.weight * 100 - c.score * c.weight * 100);

export const pointsEarned = (c: ReadinessComponent): number =>
  Math.round(c.score * c.weight * 100);

/**
 * The gaps worth acting on, biggest win first. Components already complete are dropped —
 * they are shown in the table above as earned, and a to-do list containing finished work is
 * not a to-do list.
 */
export function rankedGaps(r: Readiness): ReadinessComponent[] {
  return r.components
    .filter((c) => pointsAvailable(c) > 0)
    .sort((a, b) => pointsAvailable(b) - pointsAvailable(a));
}

/**
 * The message. Written to be sent to the student as-is, so it names the project, states
 * where they are against the bar, and lists what to do in the order that pays best.
 *
 * It never promises the case study will be published — it says what unlocks candidacy,
 * which is the only thing this score actually measures.
 */
export function buildStudentMessage(
  projectName: string,
  studentName: string | null,
  r: Readiness
): string {
  const gaps = rankedGaps(r);
  const shortfall = Math.max(0, CANDIDATE_THRESHOLD - r.score);
  const greeting = studentName ? `Hi ${studentName.split(' ')[0]},` : 'Hi,';

  if (!gaps.length) {
    return [
      greeting, '',
      `${projectName} is at ${r.score}/100 on case-study readiness and there is nothing`,
      'outstanding on the checklist. It is ready to be written up.', '',
    ].join('\n');
  }

  const lines = gaps.map((c) => {
    const what = c.gap || `finish ${c.label.toLowerCase()}`;
    return `  - ${what} (worth up to ${pointsAvailable(c)} points)`;
  });

  return [
    greeting, '',
    `${projectName} is at ${r.score}/100 on case-study readiness.`,
    r.score >= CANDIDATE_THRESHOLD
      ? `That already clears the ${CANDIDATE_THRESHOLD}-point bar to be a case-study candidate. To make it a stronger one:`
      : `It needs ${shortfall} more point${shortfall === 1 ? '' : 's'} to reach ${CANDIDATE_THRESHOLD}, the bar for becoming a case-study candidate. Here is what is missing, biggest win first:`,
    '',
    ...lines,
    '',
    'Closing the top one or two is usually enough.',
    '',
  ].join('\n');
}

interface Props {
  projectName: string;
  studentName: string | null;
  readiness: Readiness;
  onClose: () => void;
}

export default function CaseStudyReadinessModal({
  projectName, studentName, readiness, onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const gaps = useMemo(() => rankedGaps(readiness), [readiness]);
  const message = useMemo(
    () => buildStudentMessage(projectName, studentName, readiness),
    [projectName, studentName, readiness]
  );
  const shortfall = Math.max(0, CANDIDATE_THRESHOLD - readiness.score);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be refused (permissions, insecure context). The textarea below is
      // the fallback and is always selectable, so this needs no error surface.
    }
  };

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" onClick={onClose}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title mb-0">Case-study readiness — {projectName}</h5>
                <div className="small text-muted">
                  {studentName || 'Unassigned'} · {readiness.score}/100
                  {readiness.score >= CANDIDATE_THRESHOLD
                    ? ' · already a candidate'
                    : ` · ${shortfall} short of the ${CANDIDATE_THRESHOLD}-point bar`}
                </div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            <div className="modal-body">
              <table className="table table-sm align-middle">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="text-end">Earned</th>
                    <th className="text-end">Available</th>
                    <th>What is missing</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.components.map((c) => {
                    const avail = pointsAvailable(c);
                    return (
                      <tr key={c.key} className={avail === 0 ? 'text-muted' : undefined}>
                        <td>{c.label}</td>
                        <td className="text-end">{pointsEarned(c)}/{Math.round(c.weight * 100)}</td>
                        <td className="text-end fw-semibold">{avail > 0 ? `+${avail}` : '—'}</td>
                        <td className="small">
                          {c.gap || <span className="text-success">Complete</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {gaps.length > 0 && (
                <>
                  <h6 className="mt-3">Do these first</h6>
                  <ol className="small">
                    {gaps.map((c) => (
                      <li key={c.key}>
                        {c.gap || `finish ${c.label.toLowerCase()}`}{' '}
                        <span className="text-muted">— up to {pointsAvailable(c)} points</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}

              <h6 className="mt-3 d-flex justify-content-between align-items-center">
                <span>Message for the student</span>
                <button className="btn btn-sm btn-outline-primary" onClick={copy}>
                  {copied ? 'Copied' : 'Copy message'}
                </button>
              </h6>
              {/* Read-only and selectable rather than a styled block: the point is to get
                  these words into an email, and select-all works everywhere the Clipboard
                  API does not. */}
              <textarea
                className="form-control font-monospace"
                style={{ fontSize: 12 }}
                rows={Math.min(18, message.split('\n').length + 1)}
                readOnly
                value={message}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
