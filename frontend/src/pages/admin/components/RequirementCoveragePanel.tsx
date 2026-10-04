import React from 'react';
import type { RequirementCoverage } from '../../../services/adminInternshipApi';

/**
 * What the customer said, next to what the plan contains.
 *
 *     "I want to show all the requirements through this process."
 *     (Ali, 2026-09-29, after Swati's detailed requirements came back short)
 *
 * The two silent cuts were fixed at source, and neither proves the model
 * complied. This is the screen that lets a reviewer check rather than trust,
 * and its whole job is to be readable at a glance and honest at a second look.
 *
 * ── WHAT IT MUST NOT IMPLY ─────────────────────────────────────────────────
 *
 * The comparison is per AREA, not per requirement: a plan requirement cites the
 * dimension it came from, never an item id. So an area with no citing
 * requirement is "look here first", not "a requirement was lost" — a
 * requirement is allowed to omit its provenance. The copy says "nothing in the
 * plan cites this" rather than "missing", and the items are shown verbatim so
 * the last step is the reviewer's eye, which is what was asked for.
 */
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' };

const RequirementCoveragePanel: React.FC<{
  coverage: RequirementCoverage;
  summary?: string | null;
}> = ({ coverage, summary }) => {
  const { dimensions, unaccounted_dimensions: unaccounted, dropped } = coverage;
  const clean = unaccounted.length === 0 && dropped.length === 0;

  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: 6, padding: '10px 12px' }}>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="text-muted" style={eyebrow}>What they said, and what the plan covers</span>
        <span
          className="badge"
          style={{
            background: clean ? '#2e7d5b' : '#a8690f',
            color: '#fff', fontSize: 11, fontWeight: 600,
          }}
        >
          {clean ? 'every area is cited' : `${unaccounted.length} area${unaccounted.length === 1 ? '' : 's'} not cited`}
        </span>
      </div>

      {summary && <div className="text-muted mb-2" style={{ fontSize: 12.5 }}>{summary}</div>}

      {dropped.length > 0 && (
        <div className="alert alert-warning py-2 mb-2" role="alert" style={{ fontSize: 12.5 }}>
          <strong>{dropped.length} item(s) could not be carried from the conversation.</strong>
          <ul className="mb-0 mt-1" style={{ paddingLeft: 18 }}>
            {dropped.map((d, i) => (
              <li key={`${d.dimension}-${i}`}><span className="text-muted">{d.dimension}:</span> {d.value} <em>({d.reason})</em></li>
            ))}
          </ul>
        </div>
      )}

      <div className="d-flex flex-column gap-1">
        {dimensions.map((d) => (
          <details
            key={d.dimension}
            open={d.unaccounted}
            style={{
              borderLeft: `3px solid ${d.unaccounted ? '#a8690f' : '#e9ecef'}`,
              paddingLeft: 8,
            }}
          >
            <summary style={{ fontSize: 13, cursor: 'pointer' }}>
              <strong>{d.label}</strong>
              <span className="text-muted">
                {' · '}{d.stated.length} said
                {d.requirement_ids.length > 0
                  ? ` · ${d.requirement_ids.join(', ')}`
                  : ' · nothing in the plan cites this'}
              </span>
            </summary>
            <ul className="mb-1 mt-1" style={{ paddingLeft: 18, fontSize: 12.5 }}>
              {d.stated.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </details>
        ))}
      </div>

      {coverage.requirements_without_provenance.length > 0 && (
        <div className="text-muted mt-2" style={{ fontSize: 12 }}>
          {coverage.requirements_without_provenance.length} requirement(s) cite no area of the conversation
          ({coverage.requirements_without_provenance.join(', ')}). That is the model&apos;s own addition,
          not necessarily wrong.
        </div>
      )}
    </div>
  );
};

export default RequirementCoveragePanel;
