import React, { useEffect, useRef, useState } from 'react';

interface CoryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Cory panel — supports side-panel (400px inline) and full-screen modes.
 * Uses a single DOM tree so children (CoryPanel) never unmount — chat history is preserved.
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

  // ── Backdrop (fullscreen only) ──
  const backdrop = isFullscreen && isOpen ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1079,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={() => setIsFullscreen(false)}
    />
  ) : null;

  // ── Single panel — CSS changes for fullscreen, DOM stays the same ──
  const panelStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1080,
        background: '#fff',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }
    : {
        width: isOpen ? 400 : 0,
        minWidth: isOpen ? 400 : 0,
        overflow: 'hidden',
        borderLeft: isOpen ? '1px solid var(--color-border)' : 'none',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
      };

  return (
    <>
      {backdrop}
      <div
        ref={panelRef}
        role={isFullscreen ? 'dialog' : 'complementary'}
        aria-label={isFullscreen ? 'Cory AI COO — Full Screen' : 'Cory AI COO Assistant'}
        aria-modal={isFullscreen ? true : undefined}
        tabIndex={-1}
        className={isFullscreen ? '' : 'intel-panel-slide'}
        style={panelStyle}
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
          style={{
            flexShrink: 0,
            background: 'var(--color-primary)',
            color: '#fff',
            ...(isFullscreen ? { padding: '12px 20px' } : {}),
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <img
              src="/cory-avatar.jpg"
              alt="Cory"
              style={{
                width: isFullscreen ? 36 : 28,
                height: isFullscreen ? 36 : 28,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid rgba(255,255,255,${isFullscreen ? 0.4 : 0.3})`,
              }}
            />
            <div>
              <span className="fw-semibold" style={{ fontSize: isFullscreen ? '1rem' : '0.85rem' }}>
                Cory &mdash; AI COO
              </span>
              {isFullscreen && (
                <div style={{ fontSize: '0.7rem', opacity: 0.75 }}>
                  Full analysis mode
                </div>
              )}
            </div>
          </div>
          <div className="d-flex align-items-center gap-1">
            <button
              className="btn btn-sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit full screen' : 'Expand to full screen'}
              style={{
                color: 'rgba(255,255,255,0.85)',
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.1)',
                fontSize: '0.7rem',
                padding: '3px 8px',
                lineHeight: 1,
              }}
            >
              {isFullscreen ? 'Minimize' : '\u26F6'}
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

        {/* Content — same children always, never unmounted */}
        <div
          className={isFullscreen ? 'flex-grow-1 d-flex justify-content-center' : 'flex-grow-1'}
          style={{ minHeight: 0, overflow: 'hidden' }}
        >
          <div style={isFullscreen ? { width: '100%', maxWidth: 820, height: '100%' } : { width: isOpen ? 400 : 0, height: '100%' }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
