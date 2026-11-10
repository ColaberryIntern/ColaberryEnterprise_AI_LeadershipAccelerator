import React, { useEffect } from 'react';
import LeadCaptureForm from '../LeadCaptureForm';

interface OpenHouseModalProps {
  show: boolean;
  onClose: () => void;
  /** Persona slug, used to namespace the lead formType (e.g. open_house_builders). */
  personaSlug: string;
  submitLabel: string;
  /** Optional override copy — used to reframe the SAME open-house event for a
   *  different audience (e.g. an employer "Live Info Session"). Defaults to the
   *  individual open-house copy. */
  title?: string;
  subtitle?: string;
  successMessage?: string;
}

const OVERLAY: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 1000,
};

const DIALOG: React.CSSProperties = {
  background: '#fff',
  borderRadius: 14,
  maxWidth: 460,
  width: '100%',
  padding: '32px 28px',
  boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
  position: 'relative',
  maxHeight: '90vh',
  overflowY: 'auto',
};

function OpenHouseModal({
  show,
  onClose,
  personaSlug,
  submitLabel,
  // COPY RULE: the word barred by 40 TAC 807.172(d) must not appear on a page a
  // licensed career school advertises with. The approved wording in this repo is
  // "$0 to start" / "No card needed" - see PortalFreeSignupPage,
  // which was corrected on 2026-10-05. These two defaults were missed then and
  // said it twice, in the heading and again in the subtitle, on the membership
  // pages. Corrected here rather than noted for later: it is two strings, and a
  // known advertising-rule breach does not get to stay live while the funnel work
  // around it ships.
  title = 'Reserve Your Open House Seat',
  subtitle = 'Membership starts at $149/month. The Open House costs nothing to attend.',
  successMessage = 'You’re registered. We’ll email you the Open House details shortly.',
}: OpenHouseModalProps) {
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div style={OVERLAY} onClick={onClose} role="presentation">
      <div
        style={DIALOG}
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-house-modal-title"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 14, background: 'none', border: 'none',
            fontSize: 26, lineHeight: 1, color: '#64748b', cursor: 'pointer',
          }}
        >
          {'×'}
        </button>
        <h2 id="open-house-modal-title" style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
          {subtitle}
        </p>
        <LeadCaptureForm
          formType={`open_house_${personaSlug}`}
          // Phone is optional and brings its own permission tick with it. An RSVP
          // is the one moment somebody will give a number for a reminder, and the
          // tick is what makes that number usable rather than just stored.
          fields={['name', 'email', 'phone']}
          submitLabel={submitLabel}
          successMessage={successMessage}
          buttonClassName="btn btn-primary btn-lg w-100"
        />
      </div>
    </div>
  );
}

export default OpenHouseModal;
