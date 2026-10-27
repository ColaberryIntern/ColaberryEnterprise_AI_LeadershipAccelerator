import React from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/**
 * ProjectOverview is the cockpit's OVERVIEW tab: a read-only brief of everything an intern (or an admin viewing
 * as the intern) may safely see about their assigned gov project. It shows the solicitation facts, the
 * established requirements (the compliance matrix), and the price-free submission readiness. Every field is read
 * straight from the student-safe projection (StudentGovProjectView) and already crosses the API trust boundary;
 * nothing internal (pricing, win probability, competitor or bid economics, or any assignee identity) is loaded
 * or rendered here. This component only arranges already-safe fields: it fetches nothing and edits nothing.
 */
const pretty = (s: string | null | undefined): string => (s ?? '').replace(/[_-]+/g, ' ').trim().toLowerCase();

/** Conservative color heuristic for a free-text state. The raw text is always kept as the label, so an imperfect
 *  color never misleads: a satisfied-looking state reads green, an open-looking one amber, everything else neutral. */
const stateTag = (s: string): string => {
  const v = (s || '').toLowerCase();
  if (/satisf|met|complete|done|verif|accept|ready|pass/.test(v)) return 'ok';
  if (/open|gap|miss|pend|todo|unmet|draft|block/.test(v)) return 'warn';
  return '';
};
const priorityTag = (p: string): string => (/high|must|crit|mandat|shall/.test((p || '').toLowerCase()) ? 'warn' : '');

export default function ProjectOverview({ view }: { view: StudentGovProjectView }): React.ReactElement {
  const reqs = view.requirements ?? [];
  const counts = view.requirementCounts ?? { total: reqs.length, proposal: 0, build: 0 };
  const keyDates = (view.keyDates ?? []).filter((k) => k && (k.text || k.date));
  const checklist = view.submissionChecklist ?? null;

  return (
    <section className="gck-overview">
      <div className="gck-panel">
        <h3 className="gck-eyebrow" style={{ marginBottom: 10 }}>Solicitation</h3>
        <div className="gck-kv">
          <div><span className="k">Agency</span><span className="v">{view.agency || 'Not captured'}</span></div>
          <div><span className="k">Project status</span><span className="v">{pretty(view.status) || 'active'}</span></div>
          <div><span className="k">Requirements</span><span className="v gck-num">{counts.total}</span></div>
        </div>
        {keyDates.length > 0 ? (
          <ul className="gck-dates">
            {keyDates.map((k, i) => (
              <li key={i}>{k.date && <b className="gck-num">{k.date}</b>}<span>{k.text}</span></li>
            ))}
          </ul>
        ) : (
          <p className="gck-empty" style={{ marginTop: 10 }}>No key dates were detected in the solicitation yet.</p>
        )}
      </div>

      <div>
        <div className="gck-filters" style={{ justifyContent: 'space-between' }}>
          <span className="gck-eyebrow">Established requirements</span>
          <span className="gck-eyebrow">{counts.total} total &middot; {counts.proposal} proposal &middot; {counts.build} build</span>
        </div>
        {reqs.length === 0 ? (
          <div className="gck-empty">No requirements have been established for this project yet.</div>
        ) : (
          <div className="gck-reqs">
            {reqs.map((r) => (
              <div className="gck-reqrow" key={r.canonicalReqId}>
                <span className="gck-key">{r.canonicalReqId}</span>
                <span className="gck-reqtext">{r.statement}</span>
                <span className="gck-tags">
                  {r.priority && <span className={`gck-tag ${priorityTag(r.priority)}`}>{pretty(r.priority)}</span>}
                  {(r.tracks ?? []).map((t) => <span className="gck-tag" key={t}>{pretty(t)}</span>)}
                  {r.evidenceState && <span className={`gck-tag ${stateTag(r.evidenceState)}`}>{pretty(r.evidenceState)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {checklist && (
        <div>
          <div className="gck-filters" style={{ justifyContent: 'space-between' }}>
            <span className="gck-eyebrow">Submission readiness</span>
            <span className="gck-eyebrow">
              {checklist.counts.approved}/{checklist.counts.total} approved
              {checklist.ready
                ? <> &middot; <b style={{ color: 'var(--ok)' }}>ready to submit</b></>
                : <> &middot; {checklist.counts.remaining} remaining</>}
            </span>
          </div>
          {checklist.items.length === 0 ? (
            <div className="gck-empty">The submission checklist is empty.</div>
          ) : (
            <div className="gck-reqs">
              {checklist.items.map((it) => (
                <div className="gck-reqrow" key={it.requirementId}>
                  <span className={`gck-tag ${it.approved ? 'ok' : stateTag(it.status)}`} style={{ flex: 'none' }}>
                    {it.approved ? 'approved' : (pretty(it.status) || 'pending')}
                  </span>
                  <span className="gck-reqtext">{it.statement}</span>
                  {it.openGapCount > 0 && (
                    <span className="gck-tags"><span className="gck-tag warn">{it.openGapCount} open gap{it.openGapCount === 1 ? '' : 's'}</span></span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
