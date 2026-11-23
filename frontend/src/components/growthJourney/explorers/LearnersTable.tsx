import React from 'react';
import StatusBadge from '../../admin/shell/StatusBadge';
import LearnerName from '../../explorerGrowth/LearnerName';
import type { ExplorerLearnerRow } from '../../../services/explorerGrowthApi';

/**
 * The roster table: rows in, a click out, nothing fetched.
 *
 * ─── WHY THIS IS RE-CREATED RATHER THAN IMPORTED ────────────────────────────
 *
 * Explorer's roster lives inside `JourneyTab`, which calls Explorer's UNSCOPED
 * client internally. Reusing that wrapper would serve one brand's learners under
 * another brand's name, which is the single failure this build exists to
 * prevent, and the execution contract says each such surface is re-created as a
 * prop-taking component for exactly that reason.
 *
 * I did try extracting the table out of `JourneyTab` so both pages rendered one
 * definition. That is the better structure and it is NOT worth it here: the
 * extraction is a rewrite of a 268-line component on Explorer's live page, and
 * `/admin/explorer-growth` must keep working after this ships. A scripted
 * attempt broke its JSX outright. So the markup is re-created here and
 * Explorer's file is untouched.
 *
 * The leaves are still shared - `LearnerName` and `StatusBadge` are imported, so
 * the per-learner links, the 360 profile, the GHL record and every badge tone
 * come from one definition. What is duplicated is the table scaffold around
 * them, which is the part least likely to change and the easiest to compare.
 */

/*
 * NO EM DASHES, AND NO BARE DASH AS A PLACEHOLDER.
 *
 * `frontendTypographyLint` is a tree-wide shrink-only ratchet: any NEW file with
 * an em or en dash in rendered copy fails it, and house style is "a comma, a
 * full stop, a colon or the word 'to'". Explorer's own components use an em dash
 * freely and are in its recorded baseline; these files are new, so they are not.
 *
 * The constraint turned out to be an improvement. Explorer renders an em dash for
 * every absent value, which says only "there is nothing here" - it cannot
 * distinguish a learner who has never been scored from one whose score is
 * unrecorded from a field that does not apply. These panels say the word
 * instead: `not scored`, `not recorded`, `none`, `n/a`.
 */
function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="d-inline-block me-2 text-nowrap" title={label}>
      <span className="text-muted small">{label}</span>{' '}
      {/* A word, not 0: a learner with no score is not a learner scoring zero. */}
      <span className="fw-semibold">{value ?? 'n/a'}</span>
    </span>
  );
}

interface Props {
  rows: ExplorerLearnerRow[];
  onOpen: (row: ExplorerLearnerRow) => void;
}

export default function LearnersTable({ rows, onOpen }: Props) {
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th>Learner</th>
            <th>State</th>
            <th>Overlays</th>
            <th className="text-nowrap">E / I / F</th>
            <th className="text-end text-nowrap">Idle (days)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.enrollment_id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpen(r)}
              data-testid="gj-learner-row"
            >
              <td>
                {/* The 360 profile and the GHL record, one click each. Neither
                    opens the drawer, which is why they are their own component. */}
                <div className="fw-semibold">
                  <LearnerName
                    enrollmentId={r.enrollment_id}
                    email={r.email_normalized}
                    leadId={r.lead_id}
                    ghlUrl={r.ghl_url}
                  />
                </div>
                <div className="text-muted small font-monospace">
                  {r.enrollment_id.slice(0, 8)}…
                </div>
              </td>
              <td>
                {r.primary_state ? (
                  <StatusBadge label={r.primary_state.replace(/_/g, ' ')} tone="info" />
                ) : (
                  <span className="text-muted">none</span>
                )}
              </td>
              <td>
                {r.overlays.length === 0 ? (
                  <span className="text-muted small">none</span>
                ) : (
                  <div className="d-flex flex-wrap gap-1">
                    {r.overlays.map((o) => (
                      <StatusBadge
                        key={o}
                        label={o.replace(/_/g, ' ')}
                        tone={o === 'FRICTION' || o === 'DORMANT' ? 'warning' : 'neutral'}
                      />
                    ))}
                  </div>
                )}
              </td>
              <td className="text-nowrap">
                <Score label="E" value={r.e_score} />
                <Score label="I" value={r.i_score} />
                <Score label="F" value={r.f_score} />
              </td>
              <td className="text-end">
                {r.days_since_last_activity ?? <span className="text-muted">not recorded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
