import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

// Class Details — the read-only "what is this class about" panel for a single live
// session. Opened by clicking a session's Title in the admin Accelerator sessions
// table. It maps the session to its Week Blueprint and shows the curriculum intent:
// topic, purpose, learning objectives, competencies, evidence produced, and student
// outcomes. When a session has no mapped week/blueprint it says so plainly.
//
// Uses the shared admin axios instance (`api`), which attaches the admin JWT. It
// self-fetches by sessionId, mirroring ClassKitModal.

interface Blueprint {
  week?: number | null;
  title?: string | null;
  purpose?: string | null;
  learning_objectives?: unknown;
  competencies?: unknown;
  evidence_produced?: unknown;
  student_outcomes?: unknown;
}

interface CurriculumResponse {
  session_title: string;
  week: number | null;
  blueprint: Blueprint | null;
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

// Normalize a blueprint field (which may arrive as a string, a string[], a JSON
// string, or an object) into a clean list of readable strings. Guards nulls so a
// missing/oddly-shaped field never crashes the render.
function toList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    // Some fields arrive as a JSON-encoded array string — unwrap it if so.
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).map((x) => x.trim()).filter(Boolean);
        }
      } catch { /* fall through — treat as plain text */ }
    }
    return [s];
  }
  if (typeof value === 'object') {
    try { return [JSON.stringify(value, null, 2)]; } catch { return []; }
  }
  return [String(value)];
}

// A labeled block that renders a blueprint field as a bullet list. Renders nothing
// when the field is empty, so missing data leaves no empty scaffolding behind.
const ListField: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  const items = toList(value);
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: 11, letterSpacing: '.05em' }}>
        {label}
      </div>
      <ul className="mb-0 ps-3" style={{ fontSize: 14, lineHeight: 1.5 }}>
        {items.map((item, i) => (
          <li key={i} className="mb-1">{item}</li>
        ))}
      </ul>
    </div>
  );
};

// Competencies read best as chips rather than a bullet list.
const ChipField: React.FC<{ label: string; value: unknown }> = ({ label, value }) => {
  const items = toList(value);
  if (items.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: 11, letterSpacing: '.05em' }}>
        {label}
      </div>
      <div className="d-flex flex-wrap gap-2">
        {items.map((item, i) => (
          <span key={i} className="badge rounded-pill text-bg-light text-dark border" style={{ fontSize: 12.5, fontWeight: 500 }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

const ClassDetailsModal: React.FC<Props> = ({ sessionId, onClose }) => {
  const [data, setData] = useState<CurriculumResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<CurriculumResponse>(`/api/admin/accelerator/sessions/${sessionId}/curriculum`)
      .then((res) => setData(res.data))
      .catch(() => setError('Could not load the class details. Please try again.'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape — matches ClassKitModal behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const week = data?.week ?? data?.blueprint?.week ?? null;
  const bp = data?.blueprint || null;
  const hasCurriculum = week != null && !!bp;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Class Details"
      onClick={onClose}
    >
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header">
            <h6 className="modal-title fw-semibold mb-0">Class Details</h6>
            <button className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body p-4">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-danger mb-3">{error}</p>
                <button className="btn btn-sm btn-outline-primary" onClick={load}>Try again</button>
              </div>
            ) : data ? (
              <>
                {/* Session identity */}
                <div className="mb-3">
                  {week != null && (
                    <div className="mb-1 text-uppercase fw-bold" style={{ letterSpacing: '.06em', fontSize: 12, color: 'var(--brand-accent, #FB2832)' }}>
                      Week {week}
                    </div>
                  )}
                  <h2 className="fw-bold mb-0" style={{ fontSize: 22, lineHeight: 1.25 }}>
                    {data.session_title || 'Untitled session'}
                  </h2>
                </div>

                {!hasCurriculum ? (
                  <div className="text-muted py-3" style={{ fontSize: 14 }}>
                    No mapped curriculum for this class.
                  </div>
                ) : (
                  <div className="pt-2 border-top">
                    {/* Blueprint topic + purpose */}
                    {bp?.title && (
                      <div className="mb-3">
                        <div className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: 11, letterSpacing: '.05em' }}>
                          Topic
                        </div>
                        <div className="fw-semibold" style={{ fontSize: 15 }}>{bp.title}</div>
                      </div>
                    )}
                    {bp?.purpose && (
                      <div className="mb-3">
                        <div className="text-uppercase fw-semibold text-muted mb-2" style={{ fontSize: 11, letterSpacing: '.05em' }}>
                          Purpose
                        </div>
                        <p className="mb-0" style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{bp.purpose}</p>
                      </div>
                    )}

                    <ListField label="Learning Objectives" value={bp?.learning_objectives} />
                    <ChipField label="Competencies" value={bp?.competencies} />
                    <ListField label="Evidence Produced" value={bp?.evidence_produced} />
                    <ListField label="Student Outcomes" value={bp?.student_outcomes} />
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClassDetailsModal;
