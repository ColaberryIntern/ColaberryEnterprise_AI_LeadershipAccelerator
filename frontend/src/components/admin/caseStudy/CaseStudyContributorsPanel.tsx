import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import CaseStudyOverrideField from './CaseStudyOverrideField';
import { controlIdAt, formatDate } from './caseStudyDesk';
import type { ContributorView } from './caseStudySnapshotView';

/**
 * CaseStudyContributorsPanel — spec §18's Contributors section.
 *
 * Consent is modelled as three states, not as an optional name: `named`
 * requires a recorded consent timestamp, `role_only` credits the work without
 * the person, and `anonymous` is not projected at all — it survives publicly
 * only as a count. So honest crediting never costs somebody their privacy, and
 * this panel makes the three visibly different rather than showing one list of
 * names with a checkbox beside it.
 *
 * A `named` contributor with no `consentRecordedAt` is called out in red because
 * the publish gate will refuse the record for it (`builder_consent`).
 */

interface Props {
  contributors: readonly ContributorView[];
  busy: boolean;
  onApplyOverride: (path: string, value: string, note?: string) => void;
}

export default function CaseStudyContributorsPanel({
  contributors, busy, onApplyOverride,
}: Props): React.ReactElement {
  const named = contributors.filter((c) => c.displayMode === 'named');
  const anonymous = contributors.filter((c) => c.displayMode === 'anonymous');

  return (
    <SectionCard title="Contributors" icon="team-line" className="mb-4">
      {contributors.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-contributors-empty">
          No contributors in this snapshot. The public page shows no credits section rather than
          an empty one.
        </p>
      ) : (
        <>
          <p className="small text-muted">
            {named.length} named, {contributors.length - named.length - anonymous.length} credited
            by role only, {anonymous.length} anonymous. Anonymous contributors are never projected;
            they appear publicly only in a count.
          </p>
          <div className="table-responsive mb-3">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Display mode</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Kind</th>
                  <th>Consent recorded</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((person) => (
                  <tr key={person.path} data-testid={`cs-contributor-${person.path}`}>
                    <td><StatusBadge label={person.displayMode || 'unknown'} /></td>
                    <td>
                      {person.displayMode === 'named'
                        ? (person.displayName || '—')
                        : <span className="text-muted">not shown in this mode</span>}
                    </td>
                    <td className="small">{person.role || '—'}</td>
                    <td className="small">{person.kind || '—'}</td>
                    <td className="small">
                      {person.displayMode !== 'named'
                        ? <span className="text-muted">not required</span>
                        : person.consentRecordedAt
                          ? formatDate(person.consentRecordedAt)
                          : (
                            <span className="text-danger">
                              named without recorded consent — publication will be refused
                            </span>
                          )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row g-3">
            {contributors.slice(0, 2).map((person, index) => (
              <div className="col-lg-6" key={`contributor-override-${person.path}`}>
                <CaseStudyOverrideField
                  label={`Role — ${person.displayName || person.role || person.path}`}
                  path={`${person.path}.role`}
                  generated={person.role}
                  testId={controlIdAt('contributors', index)}
                  busy={busy}
                  onApply={onApplyOverride}
                  help="How the contribution is described publicly. Changing a role never changes a consent state."
                />
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
