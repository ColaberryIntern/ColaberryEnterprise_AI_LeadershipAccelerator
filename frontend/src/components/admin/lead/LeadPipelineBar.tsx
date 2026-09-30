import React, { useState } from 'react';
import api from '../../../utils/api';
import { PIPELINE_STAGES, PIPELINE_STAGE_COLORS } from '../../../constants';

/**
 * The pipeline stage selector, extracted from AdminLeadDetailPage.
 *
 * WHY EXTRACTED RATHER THAN REIMPLEMENTED. The 360 profile is intended to
 * replace the Lead detail page, so every action has to move across with the
 * same behaviour. A second implementation of a WRITE path is worse than a
 * second implementation of a read: the two would drift, and the one people
 * stopped looking at would be the one still writing.
 *
 * Both pages render this, so there is exactly one place a stage change is made.
 */

interface Props {
  leadId: number;
  stage: string | null;
  /** Fires after a successful write, so callers can refresh their own views. */
  onChanged?: (stage: string) => void;
}

function stageColor(key: string): string {
  return (PIPELINE_STAGE_COLORS as Record<string, string>)[key] || '#6c757d';
}

export default function LeadPipelineBar({ leadId, stage, onChanged }: Props) {
  const [current, setCurrent] = useState<string | null>(stage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: string) => {
    if (next === current || saving) return;
    const previous = current;
    // Optimistic, exactly as the lead page does it — the bar should respond
    // immediately — but reverted on failure rather than left showing a stage
    // the database does not have.
    setCurrent(next);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/leads/${leadId}/pipeline`, {
        pipeline_stage: next,
        from_stage: previous,
      });
      onChanged?.(next);
    } catch {
      setCurrent(previous);
      setError('Could not change the stage. It is unchanged.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className="text-muted small fw-bold me-2">Pipeline:</span>
        {PIPELINE_STAGES.map((s: { key: string; label: string }) => (
          <button
            key={s.key}
            type="button"
            disabled={saving}
            className={`btn btn-sm ${current === s.key ? 'text-white' : 'btn-outline-secondary'}`}
            style={current === s.key
              ? { backgroundColor: stageColor(s.key), borderColor: stageColor(s.key) }
              : undefined}
            onClick={() => change(s.key)}
            aria-pressed={current === s.key}
          >
            {s.label}
          </button>
        ))}
      </div>
      {/* A failed write says so. Silently reverting would look like a misclick. */}
      {error && <div className="text-danger small mt-2">{error}</div>}
    </div>
  );
}
