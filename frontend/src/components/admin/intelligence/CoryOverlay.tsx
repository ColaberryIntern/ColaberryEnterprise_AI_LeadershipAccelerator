import React, { useEffect, useRef, useState } from 'react';

interface CoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Cory panel — supports side-panel (400px inline) and full-screen (ChatGPT-like) modes.
 * Full-screen gives a wide, spacious layout for reading long analyses.
 */
export default function CoryOverlay({ isOpen, onClose, children }: CoryOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFullscreen, onClose]);

  // Focus panel when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  // Reset fullscreen when panel closes
  useEffect(() => {
    if (!isOpen) setIsFullscreen(false);
  }, [isOpen]);

  // ── Full-screen mode ──
  if (isFullscreen && isOpen) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1080,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsFullscreen(false);
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Cory AI COO — Full Screen"
          aria-modal="true"
          tabIndex={-1}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            bottom: 16,
            background: '#fff',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
          }}
        >
          {/* Fullscreen Header */}
          <div
            className="d-flex align-items-center justify-content-between px-4 py-3"
            style={{ flexShrink: 0, background: 'var(--color-primary)', color: '#fff' }}
          >
            <div className="d-flex align-items-center gap-3">
              <img
                src="/cory-avatar.jpg"
                alt="Cory"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid rgba(255,255,255,0.4)',
                }}
              />
              <div>
                <div className="fw-semibold" style={{ fontSize: '1rem' }}>
                  Cory &mdash; AI Chief Operating Officer
                </div>
                <div style={{ fontSize: '0.7rem', opacity: 0.75 }}>
                  Full analysis mode &middot; Ask anything
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setIsFullscreen(false)}
                title="Exit full screen"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.1)',
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                }}
              >
                Minimize
              </button>
              <button
                className="btn btn-sm"
                onClick={onClose}
                title="Close Cory"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  background: 'rgba(255,255,255,0.1)',
                  fontSize: '0.75rem',
                  padding: '4px 12px',
                }}
              >
                Close
              </button>
            </div>
          </div>

          {/* Fullscreen Content — centered with max-width for readability */}
          <div className="flex-grow-1 d-flex justify-content-center" style={{ minHeight: 0, overflow: 'hidden' }}>
            <div style={{ width: '100%', maxWidth: 820, height: '100%' }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Side-panel mode ──
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
              src="/cory-avatar.jpg"
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
          <div className="d-flex align-items-center gap-1">
            <button
              className="btn btn-sm"
              onClick={() => setIsFullscreen(true)}
              title="Expand to full screen"
              style={{
                color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)',
                fontSize: '0.7rem',
                padding: '3px 8px',
                lineHeight: 1,
              }}
            >
              &#x26F6;
            </button>
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
        </div>

        {/* Content */}
        <div className="flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
