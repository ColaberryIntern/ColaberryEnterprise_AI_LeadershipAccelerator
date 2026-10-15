import React from 'react';

/**
 * AssignmentOverviewPanel — an advisory "who owns this contract" summary for the gov Build step.
 *
 * It assigns nothing and changes no gate. The real assignment controls already exist and sit
 * directly below it: "Create the monitored project" (assign the whole build to one intern ->
 * creates their monitored project) and the per-story assign in the coverage cross-check. This
 * panel just makes the state legible from data the admin workspace already holds:
 *   - whether a delivery project exists yet (assignment needs one),
 *   - the roster of interns who can build this contract (assignableBuilders = active builder-role
 *     members of the delivery project),
 *   - how many build stories are already assigned, and
 *   - the one prerequisite that is easy to miss: an intern must be a builder-role MEMBER of the
 *     delivery project to appear in the picker AND to see the contract in their own portal.
 *
 * Grounded only in ws.build; fabricates nothing.
 */
export function AssignmentOverviewPanel({ deliveryProjectId, builders, stories }: {
  deliveryProjectId?: string | null;
  builders: { identityId: string; email: string | null; roles: string[] }[];
  stories: { id: string; assigneeIdentityId?: string | null }[];
}): React.ReactElement {
  const roster = Array.isArray(builders) ? builders : [];
  const allStories = Array.isArray(stories) ? stories : [];
  const assigned = allStories.filter((s) => !!s.assigneeIdentityId).length;
  const total = allStories.length;
  const pct = total ? Math.round((assigned / total) * 100) : 0;

  if (!deliveryProjectId) {
    return (
      <div className="alert alert-secondary py-2 mb-1 small" role="status">
        <i className="ri-information-line me-1" aria-hidden="true" />
        No delivery project yet — approve the pursuit first. Once it exists, interns added as builders on it appear here and can be assigned.
      </div>
    );
  }

  return (
    <div className="mb-1">
      <div className="row g-3">
        {/* Who can build this contract */}
        <div className="col-12 col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="fw-semibold small mb-2"><i className="ri-team-line me-1" aria-hidden="true" />Who can build this contract <span className="text-secondary fw-normal">({roster.length})</span></div>
            {roster.length === 0 ? (
              <div className="alert alert-warning py-2 mb-0 small" role="status">
                <i className="ri-error-warning-line me-1" aria-hidden="true" />
                No interns are members of this contract yet. Add the gov interns as builder-role members of this delivery project so they appear in the picker below <em>and</em> can see the contract in their portal.
              </div>
            ) : (
              <ul className="list-unstyled mb-0">
                {roster.map((b) => (
                  <li key={b.identityId} className="d-flex align-items-center gap-2 py-1 border-bottom">
                    <i className="ri-user-line text-secondary" aria-hidden="true" />
                    <span className="small flex-grow-1">{b.email ?? b.identityId}</span>
                    {b.roles?.length ? <span className="badge bg-light text-secondary border" style={{ whiteSpace: 'nowrap' }}>{b.roles.join(', ')}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Story assignment coverage */}
        <div className="col-12 col-md-6">
          <div className="border rounded p-3 h-100">
            <div className="fw-semibold small mb-2"><i className="ri-checkbox-multiple-line me-1" aria-hidden="true" />Build stories assigned</div>
            <div className="d-flex justify-content-between small"><span className="text-secondary">Assigned</span><span className="fw-semibold">{assigned} of {total}</span></div>
            <div className="progress mt-1" style={{ height: 8 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`progress-bar ${total && assigned === total ? 'bg-success' : 'bg-info'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="small text-secondary mt-2">
              {total === 0 ? 'No build stories yet — generate the plan first.' : 'Assign whole-build (below) or story-by-story in the coverage cross-check.'}
            </div>
          </div>
        </div>
      </div>

      <div className="small text-secondary mt-2">
        <i className="ri-information-line me-1" aria-hidden="true" />
        Two ways to assign, both below: <strong>Create the monitored project</strong> gives one intern the whole build (their own monitored project), or assign individual stories in the coverage cross-check. One contract per intern for now. The intern sees their contract at their portal once they are a member here; they never see who else is assigned. This summary assigns nothing.
      </div>
    </div>
  );
}
