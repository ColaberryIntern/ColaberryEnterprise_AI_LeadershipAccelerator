import React, { useEffect, useRef } from 'react';

interface CoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function CoryOverlay({ isOpen, onClose, children }: CoryOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap: focus panel when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.25)',
          backdropFilter: 'blur(2px)',
          zIndex: 1040,
        }}
        aria-hidden="true"
      />

      {/* Slide-in Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cory AI COO Assistant"
        tabIndex={-1}
        className="cory-overlay-slide"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 420,
          maxWidth: '100vw',
          height: '100vh',
          zIndex: 1050,
          background: 'rgba(255, 255, 255, 0.97)',
          backdropFilter: 'blur(12px)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
          style={{ flexShrink: 0, background: 'var(--color-primary)', color: '#fff' }}
        >
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle"
              style={{
                width: 28,
                height: 28,
                background: 'rgba(255,255,255,0.2)',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              C
            </span>
            <span className="fw-semibold" style={{ fontSize: '0.85rem' }}>
              Cory — AI COO
            </span>
          </div>
          <button
            className="btn btn-sm"
            onClick={onClose}
            aria-label="Close Cory panel"
            style={{
              color: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.1)',
              fontSize: '0.75rem',
              padding: '3px 10px',
            }}
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </>
  );
}
