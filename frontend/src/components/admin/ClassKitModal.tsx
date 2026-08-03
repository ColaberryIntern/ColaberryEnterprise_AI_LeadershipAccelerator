import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

// Class Kit — the instructor's one-page, projector-friendly launch panel for a
// single live session. Opened from the Kit button on each session row.
//
//   • "Start Class" opens the Meet room in a new tab (guarded when no link yet).
//   • The QR is server-generated SVG (trusted) — students scan it to check in,
//     which marks attendance AND drops them into the class.
//   • "Print" isolates just this card (see the scoped @media print block) so an
//     instructor can hand out or post a paper copy.
//
// Uses the shared admin axios instance (`api`), which attaches the admin JWT.

interface KitSession {
  id: string;
  session_number: number;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
}

interface ClassKit {
  session: KitSession;
  meeting_link: string | null;
  cohort_name: string;
  roster_count: number;
  checkin_url: string;
  qr_svg: string;
}

interface Props {
  sessionId: string;
  onClose: () => void;
}

function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "13:00"/"13:00:00" → "1:00 PM"; leaves already-formatted strings untouched. */
function formatTime(t: string): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${period}`;
}

const ClassKitModal: React.FC<Props> = ({ sessionId, onClose }) => {
  const [kit, setKit] = useState<ClassKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<ClassKit>(`/api/admin/accelerator/sessions/${sessionId}/kit`)
      .then((res) => setKit(res.data))
      .catch(() => setError('Could not load the Class Kit. Please try again.'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Close on Escape — matches expected modal behavior.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const timeLabel = kit
    ? [formatTime(kit.session.start_time), formatTime(kit.session.end_time)].filter(Boolean).join(' – ')
    : '';

  return (
    <div className="modal show d-block class-kit-modal" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} role="dialog" aria-modal="true" aria-label="Class Kit" onClick={onClose}>
      <style>{PRINT_CSS}</style>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          {/* Toolbar — hidden on print */}
          <div className="modal-header class-kit-noprint">
            <h6 className="modal-title fw-semibold mb-0">Class Kit</h6>
            <div className="d-flex gap-2 align-items-center">
              <button className="btn btn-sm btn-outline-secondary" onClick={() => window.print()} disabled={!kit}>
                <i className="ri-printer-line" aria-hidden="true" /> Print
              </button>
              <button className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
          </div>

          <div className="modal-body class-kit-print p-4 p-md-5">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading…</span></div>
              </div>
            ) : error ? (
              <div className="text-center py-4">
                <p className="text-danger mb-3">{error}</p>
                <button className="btn btn-sm btn-outline-primary" onClick={load}>Try again</button>
              </div>
            ) : kit ? (
              <div className="text-center">
                {/* Header */}
                <div className="mb-1 text-uppercase fw-bold" style={{ letterSpacing: '.06em', fontSize: 12, color: 'var(--brand-accent, #FB2832)' }}>
                  {kit.cohort_name}
                </div>
                <h2 className="fw-bold mb-1" style={{ fontSize: 26, lineHeight: 1.2 }}>
                  Session {kit.session.session_number}: {kit.session.title}
                </h2>
                <p className="text-muted mb-4" style={{ fontSize: 15 }}>
                  {formatDate(kit.session.session_date)}{timeLabel ? ` · ${timeLabel}` : ''}
                </p>

                {/* Start Class */}
                <div className="class-kit-noprint mb-4">
                  {kit.meeting_link ? (
                    <a
                      className="btn btn-lg btn-primary px-5 fw-semibold"
                      href={kit.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <i className="ri-vidicon-line me-2" aria-hidden="true" /> Start Class
                    </a>
                  ) : (
                    <button className="btn btn-lg btn-outline-secondary px-5" disabled title="No meeting link yet — generate one from the session row.">
                      No meeting link yet
                    </button>
                  )}
                </div>

                {/* QR — server-generated SVG (trusted), students scan to check in */}
                <div className="d-inline-flex flex-column align-items-center">
                  <div
                    className="class-kit-qr p-3 bg-white rounded border"
                    // qr_svg is generated by our own backend (qrcode lib), never user input.
                    dangerouslySetInnerHTML={{ __html: kit.qr_svg }}
                  />
                  <div className="text-muted mt-3" style={{ fontSize: 14, maxWidth: 340 }}>
                    Students scan to check in (marks attendance + joins the class)
                  </div>
                  <code className="d-block mt-2 text-break" style={{ fontSize: 12.5, color: 'var(--bs-secondary-color, #6c757d)' }}>
                    {kit.checkin_url}
                  </code>
                </div>

                {/* Roster count */}
                <div className="mt-4 pt-3 border-top">
                  <span className="fw-semibold" style={{ fontSize: 16 }}>{kit.roster_count}</span>
                  <span className="text-muted ms-1" style={{ fontSize: 14 }}>
                    {kit.roster_count === 1 ? 'student on the roster' : 'students on the roster'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

// Print isolation: hide everything on the page, then reveal only the kit card so
// window.print() yields a clean handout instead of the whole admin app.
const PRINT_CSS = `
.class-kit-qr :where(svg, img){ width:230px; height:230px; display:block; }
@media print{
  body * { visibility:hidden !important; }
  .class-kit-print, .class-kit-print * { visibility:visible !important; }
  .class-kit-noprint{ display:none !important; }
  .class-kit-modal{ position:absolute !important; inset:0 !important; background:#fff !important; padding:0 !important; }
  .class-kit-modal .modal-dialog{ max-width:100% !important; margin:0 !important; }
  .class-kit-modal .modal-content{ border:0 !important; box-shadow:none !important; }
  .class-kit-print{ position:absolute; left:0; top:0; width:100%; }
  .class-kit-qr :where(svg, img){ width:300px; height:300px; }
}
`;

export default ClassKitModal;
