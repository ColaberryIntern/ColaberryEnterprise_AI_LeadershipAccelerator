import React, { useEffect } from 'react';
import LeadCaptureForm from '../LeadCaptureForm';

interface OpenHouseModalProps {
  show: boolean;
  onClose: () => void;
  /** Persona slug, used to namespace the lead formType (e.g. open_house_builders). */
  personaSlug: string;
  submitLabel: string;
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

function OpenHouseModal({ show, onClose, personaSlug, submitLabel }: OpenHouseModalProps) {
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
          Reserve Your Free Open House Seat
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
          Membership starts at $149/month. The Open House is free.
        </p>
        <LeadCaptureForm
          formType={`open_house_${personaSlug}`}
          fields={['name', 'email']}
          submitLabel={submitLabel}
          successMessage="You’re registered. We’ll email you the Open House details shortly."
          buttonClassName="btn btn-primary btn-lg w-100"
        />
      </div>
    </div>
  );
}

export default OpenHouseModal;
