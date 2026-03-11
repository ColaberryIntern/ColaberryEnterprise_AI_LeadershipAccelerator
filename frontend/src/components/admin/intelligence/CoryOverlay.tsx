import React, { useEffect, useRef } from 'react';

interface CoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Inline Cory panel — renders as a flex column that pushes the center content
 * instead of overlaying/blurring it. The user can see their data while talking to Cory.
 */
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

  // Focus panel when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div
      ref={panelRef}
      role="complementary"
      aria-label="Cory AI COO Assistant"
      tabIndex={-1}
      className="intel-panel-slide"
      style={{
        width: isOpen ? 400 : 0,
        minWidth: isOpen ? 400 : 0,
        overflow: 'hidden',
        borderLeft: isOpen ? '1px solid var(--color-border)' : 'none',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
      }}
    >
      <div style={{ width: 400, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
          style={{ flexShrink: 0, background: 'var(--color-primary)', color: '#fff' }}
        >
          <div className="d-flex align-items-center gap-2">
            <img
              src="/cory-avatar.png"
              alt="Cory"
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid rgba(255,255,255,0.3)',
              }}
            />
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
    </div>
  );
}
