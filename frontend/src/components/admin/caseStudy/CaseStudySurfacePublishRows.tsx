import React from 'react';
import {
  CASE_STUDY_SURFACES,
  PUBLISHABLE_CASE_STUDY_SURFACES,
} from '../../../config/caseStudySurfaces';
import type { CaseStudySurfaceKey } from '../../../config/caseStudySurfaces';
import type { CaseStudyHirePerson, CaseStudyPublicationSummary } from '../../../services/caseStudyAdminTypes';

/**
 * The HIRE row's second line: WHO goes live. Hire lists people, so an operator about to
 * publish there must see the person, not only the site - and when the record resolves to
 * nobody, the same remedy the publish gate will give, before they click.
 */
export function HirePersonLine({ person, liveUrl }: {
  person: CaseStudyHirePerson | null | undefined;
  liveUrl: string | null;
}): React.ReactElement | null {
  if (person === undefined) return null;
  if (person === null) {
    return (
      <div className="small text-danger mt-1" data-testid="cs-surface-hire-person">
        No person is linked, so Hire will refuse this record. Link the case study&apos;s repository to
        the builder&apos;s project (github_connections) or set case_studies.project_id.
      </div>
    );
  }
  const href = liveUrl ? `${liveUrl.replace(/\/+$/, '')}/talent/${encodeURIComponent(person.portfolioSlug)}/` : null;
  return (
    <div className="small mt-1" data-testid="cs-surface-hire-person">
      {'Lists '}
      {href
        ? <a href={href} target="_blank" rel="noreferrer" className="fw-semibold">{person.name}</a>
        : <span className="fw-semibold">{person.name}</span>}
      <span className="text-muted">
        {person.listed
          ? ' · appears in the directory once published'
          : ' · their portfolio is not published and public, so they will not appear in the directory yet'}
      </span>
    </div>
  );
}
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';

/**
 * One row per surface a record may be published to: where it stands, and the
 * single control that changes it.
 *
 * WHY IT IS A ROW PER SURFACE AND NOT A DROPDOWN. Ali, 2026-09-05: "in the admin,
 * I want to be able to control what Case Study is shown on what site." A select
 * plus one Publish button answers "publish this somewhere"; a reader of that
 * screen still cannot see WHERE this record currently stands without operating
 * the control. Rows answer the question by being read.
 *
 * IT PRESERVES THE RULE `PUBLISH_SURFACE` WAS WRITTEN FOR. That constant exists
 * because publish must never follow the lens tab - an operator exploring the
 * Training lens should not be one click from publishing to it. Nothing here
 * reads `lensSurface`. The surface comes from the row whose button was pressed,
 * so choosing one is a deliberate act with the brand's name printed on it.
 *
 * EACH SURFACE IS A BRAND, WHICH IS WHY THE ADDRESS IS ON SCREEN. AI Flotation
 * is a different company on its own domain and its own Cloudflare zone. An
 * operator publishing a Colaberry record there is making a claim about whose
 * delivery it was, and the least this screen can do is show them where it will
 * appear before they do it, and link them to it afterwards.
 *
 * NOTHING HERE IS DISABLED BY A CLIENT-SIDE OPINION. The publish gate runs
 * server-side on every call, including a repeat publish of something already
 * live, and its refusals arrive as named blockers the panel renders in full. A
 * button greyed out by a guess would replace a list of reasons with a shrug.
 */

export interface CaseStudySurfacePublishRowsProps {
  publications: readonly CaseStudyPublicationSummary[];
  /** Who a Hire publication would list. `null` = nobody; absent = not reported. */
  hirePerson?: CaseStudyHirePerson | null;
  busy: boolean;
  onPublish: (surfaceKey: CaseStudySurfaceKey) => void;
  onUnpublish: (surfaceKey: CaseStudySurfaceKey) => void;
}

export function publicationFor(
  publications: readonly CaseStudyPublicationSummary[],
  surfaceKey: CaseStudySurfaceKey,
): CaseStudyPublicationSummary | null {
  return publications.find((p) => p.surfaceKey === surfaceKey) ?? null;
}

export function CaseStudySurfacePublishRows({
  publications,
  hirePerson,
  busy,
  onPublish,
  onUnpublish,
}: CaseStudySurfacePublishRowsProps): React.ReactElement {
  return (
    <div className="table-responsive mb-3" data-testid="cs-surface-rows">
      <table className="table table-sm align-middle mb-0 small">
        <thead>
          <tr>
            <th scope="col">Site</th>
            <th scope="col">Status</th>
            <th scope="col">Where it appears</th>
            <th scope="col" className="text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {PUBLISHABLE_CASE_STUDY_SURFACES.map((surfaceKey) => {
            const profile = CASE_STUDY_SURFACES[surfaceKey];
            const publication = publicationFor(publications, surfaceKey);
            const live = publication?.status === 'published';
            return (
              <tr key={surfaceKey} data-testid={`cs-surface-row-${surfaceKey}`}>
                <th scope="row" className="fw-semibold">
                  {profile.label}
                  {surfaceKey === 'hire' && <HirePersonLine person={hirePerson} liveUrl={profile.liveUrl} />}
                </th>
                <td data-testid={`cs-surface-status-${surfaceKey}`}>
                  {/* The word, not only a colour: a status a reader has to
                      decode from a dot is a status they can misread. */}
                  <span className={live ? 'text-success fw-semibold' : 'text-muted'}>
                    {live ? 'Published' : 'Not published'}
                  </span>
                </td>
                <td>
                  {profile.liveUrl ? (
                    <a
                      href={profile.liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-monospace"
                    >
                      {profile.liveUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span className="text-muted">no page yet</span>
                  )}
                </td>
                <td className="text-end">
                  {/*
                    PUBLISH IS ALWAYS OFFERED, INCLUDING WHILE LIVE, and the first
                    version of this row got that wrong by showing one control or
                    the other. Re-publishing is not a no-op: it re-runs the gate
                    and re-pins the currently APPROVED snapshot, which is how an
                    edited record actually reaches the public page. Hiding it
                    while live would leave an operator who had just approved a new
                    snapshot with no way to ship it except to unpublish first -
                    taking the page down in order to put it back up.
                  */}
                  <div className="d-flex gap-2 justify-content-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      data-testid={`${CASE_STUDY_CONTROLS.publish}-${surfaceKey}`}
                      onClick={() => onPublish(surfaceKey)}
                      disabled={busy}
                      title={`Run the publish gate for ${profile.label} and publish the approved snapshot if it allows.`}
                    >
                      {live ? 'Republish' : 'Publish'}
                    </button>
                    {live ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        data-testid={`${CASE_STUDY_CONTROLS.unpublish}-${surfaceKey}`}
                        onClick={() => onUnpublish(surfaceKey)}
                        disabled={busy}
                        title="Removes public visibility on this site. Snapshots, evidence and history are kept."
                      >
                        Unpublish
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CaseStudySurfacePublishRows;
