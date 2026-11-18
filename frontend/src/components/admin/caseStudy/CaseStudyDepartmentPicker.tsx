import React, { useEffect, useState } from 'react';
import { CASE_STUDY_DEPARTMENTS } from '../../../services/caseStudyDepartments';

/**
 * W10: tag a case study with the departments it touches (several allowed).
 *
 * Writes the override `taxonomy.departments`, which becomes a new snapshot version like every other
 * override and must be approved and republished before /proof shows it. The server refuses any slug
 * outside the six. Nothing is written until the reviewer presses Apply.
 */
interface Props {
  readonly current: readonly string[];
  readonly busy: boolean;
  readonly disabledReason?: string;
  readonly onApply: (path: string, value: unknown) => void;
}

export const DEPARTMENTS_PATH = 'taxonomy.departments';

export default function CaseStudyDepartmentPicker({ current, busy, disabledReason, onApply }: Props): React.ReactElement {
  const [picked, setPicked] = useState<string[]>([...current]);
  useEffect(() => { setPicked([...current]); }, [current]);
  const toggle = (slug: string): void =>
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  // The vocabulary's order, so the stored list does not depend on click order.
  const ordered = CASE_STUDY_DEPARTMENTS.map((d) => d.slug).filter((s) => picked.includes(s));
  const unchanged = ordered.join(',') === CASE_STUDY_DEPARTMENTS.map((d) => d.slug).filter((s) => current.includes(s)).join(',');
  const disabled = busy || Boolean(disabledReason);

  return (
    <fieldset className="mb-3" data-testid="cs-departments">
      <legend className="small fw-semibold mb-1">Departments</legend>
      <p className="small text-muted mb-2">
        Which departments this work served. Shown on /proof and in the header Proof menu once approved and published.
      </p>
      <div className="d-flex flex-wrap gap-3 mb-2">
        {CASE_STUDY_DEPARTMENTS.map((d) => (
          <label key={d.slug} className="form-check small mb-0">
            <input
              type="checkbox"
              className="form-check-input"
              value={d.slug}
              checked={picked.includes(d.slug)}
              disabled={disabled}
              onChange={() => toggle(d.slug)}
            />
            <span className="form-check-label">{d.label}</span>
          </label>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        disabled={disabled || unchanged}
        title={disabledReason}
        onClick={() => onApply(DEPARTMENTS_PATH, ordered)}
        data-testid="cs-departments-apply"
      >
        Apply departments
      </button>
    </fieldset>
  );
}
