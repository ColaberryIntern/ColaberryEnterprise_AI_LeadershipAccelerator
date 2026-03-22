import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import ExecutiveAwarenessPanel from './ExecutiveAwarenessPanel';
import api from '../utils/api';
import { useAdminUser } from '../hooks/useAdminUser';

const CoryPanel = lazy(() => import('./admin/intelligence/CoryPanel'));

// No-op callbacks for floating chat (no dashboard to populate)
const noop = () => {};

// ─── Component ──────────────────────────────────────────────────────────────

export default function GlobalCoryWidget() {
  const location = useLocation();
  const adminUser = useAdminUser();
  const [isHovered, setIsHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [badge, setBadge] = useState<{ count: number; maxSeverity: string }>({ count: 0, maxSeverity: 'none' });
  const [stabilityScore, setStabilityScore] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);

  const isAdmin = location.pathname.startsWith('/admin');
  const isCoryAuthorized = adminUser?.email === 'ali@colaberry.com' || adminUser?.role === 'super_admin';

  const fetchBadge = useCallback(async () => {
    try {
      const [badgeRes, riskRes] = await Promise.all([
        api.get('/api/admin/executive-awareness/badge'),
        api.get('/api/admin/strategic-intelligence/risk').catch(() => ({ data: null })),
      ]);
      setBadge(badgeRes.data);
      if (riskRes.data?.stabilityScore != null) {
        setStabilityScore(riskRes.data.stabilityScore);
      }
    } catch {
      // Silent fail — badge is non-critical
    }
  }, []);

  // Poll badge every 30s on admin routes
  useEffect(() => {
    if (!isAdmin) {
      setBadge({ count: 0, maxSeverity: 'none' });
      return;
    }
    fetchBadge();
    intervalRef.current = setInterval(fetchBadge, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAdmin, fetchBadge]);

  // Refresh badge when panel closes
  useEffect(() => {
    if (!panelOpen && isAdmin) fetchBadge();
  }, [panelOpen, isAdmin, fetchBadge]);

  // Close on Escape
  useEffect(() => {
    if (!chatOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        else setChatOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen, isFullscreen]);

  // Focus chat panel when opened
  useEffect(() => {
    if (chatOpen && chatPanelRef.current) {
      chatPanelRef.current.focus();
    }
  }, [chatOpen]);

  // Reset fullscreen when closed
  useEffect(() => {
    if (!chatOpen) setIsFullscreen(false);
  }, [chatOpen]);

  // Don't render on the Intelligence OS page itself (it has its own CoryPanel)
  if (location.pathname === '/admin/intelligence') return null;

  // Only visible to ali@colaberry.com or super_admin
  if (!isCoryAuthorized) return null;

  const handleClick = () => {
    if (isAdmin && badge.count > 0 && !chatOpen) {
      setPanelOpen((prev) => !prev);
    } else {
      setChatOpen((prev) => !prev);
      setPanelOpen(false);
    }
  };

  // Badge color by severity
  const badgeColor =
    badge.maxSeverity === 'critical' ? '#e53e3e' :
    badge.maxSeverity === 'high' ? '#dd6b20' :
    badge.maxSeverity === 'important' ? '#3182ce' :
    '#a0aec0';

  const isCritical = badge.maxSeverity === 'critical';

  // Stability ring color
  const stabilityRingColor = stabilityScore != null
    ? (stabilityScore >= 80 ? '#38a169' : stabilityScore >= 60 ? '#d69e2e' : stabilityScore >= 40 ? '#dd6b20' : '#e53e3e')
    : 'var(--color-primary)';

  // ── Floating chat panel styles ──
  const chatPanelStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 10001,
        background: '#fff',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }
    : {
        position: 'fixed',
        bottom: 80,
        right: 24,
        width: 400,
        height: chatOpen ? 560 : 0,
        maxHeight: 'calc(100vh - 120px)',
        zIndex: 10001,
        background: '#fff',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(26, 54, 93, 0.25)',
        transition: 'height 0.25s ease, opacity 0.2s ease',
        opacity: chatOpen ? 1 : 0,
        pointerEvents: chatOpen ? 'auto' : 'none',
      };

  return (
    <div className="global-cory-widget">
      {/* Floating avatar button */}
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={chatOpen ? 'Close Cory chat' : badge.count > 0 ? `Cory — ${badge.count} executive events` : 'Open Cory — AI COO'}
        title={chatOpen ? 'Close Cory' : badge.count > 0 ? `${badge.count} executive event${badge.count !== 1 ? 's' : ''}` : stabilityScore != null ? `Cory — Stability: ${stabilityScore}/100` : 'Cory — AI COO'}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {/* Pulsing ring for critical events */}
        {isCritical && badge.count > 0 && (
          <span
            className="cory-critical-pulse"
            style={{
              position: 'absolute',
              inset: -4,
              borderRadius: '50%',
              border: '2px solid #e53e3e',
              animation: 'cory-pulse 2s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Stability score ring */}
        {stabilityScore != null && !isCritical && (
          <span
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              border: `3px solid ${stabilityRingColor}`,
              pointerEvents: 'none',
              opacity: 0.8,
            }}
          />
        )}

        <img
          src="/cory-avatar.jpg"
          alt="Cory — AI COO"
          className="global-cory-avatar"
          style={{
            ...(stabilityScore != null ? { border: 'none' } : {}),
            ...(isHovered ? { transform: 'scale(1.1)', boxShadow: '0 6px 24px rgba(26, 54, 93, 0.45)' } : {}),
          }}
        />

        {/* Badge counter */}
        {badge.count > 0 && !chatOpen && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              background: badgeColor,
              color: '#fff',
              borderRadius: '50%',
              width: badge.count > 9 ? 22 : 18,
              height: badge.count > 9 ? 22 : 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.6rem',
              fontWeight: 700,
              lineHeight: 1,
              border: '2px solid #fff',
              pointerEvents: 'none',
            }}
          >
            {badge.count > 99 ? '99+' : badge.count}
          </span>
        )}

        {/* Name tooltip on hover */}
        {isHovered && !chatOpen && (
          <span
            className="position-absolute bg-dark text-white rounded px-2 py-1"
            style={{
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 8,
              fontSize: '0.72rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            Cory — AI COO
          </span>
        )}
      </button>

      {/* Executive Awareness Panel */}
      <ExecutiveAwarenessPanel open={panelOpen} onClose={() => setPanelOpen(false)} />

      {/* Fullscreen backdrop */}
      {isFullscreen && chatOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setIsFullscreen(false)}
        />
      )}

      {/* Floating Cory Chat Panel */}
      <div
        ref={chatPanelRef}
        role={isFullscreen ? 'dialog' : 'complementary'}
        aria-label={isFullscreen ? 'Cory AI COO — Full Screen' : 'Cory AI COO Chat'}
        aria-modal={isFullscreen ? true : undefined}
        tabIndex={-1}
        style={chatPanelStyle}
      >
        {/* Header */}
        <div
          className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom"
          style={{
            flexShrink: 0,
            background: 'var(--color-primary)',
            color: '#fff',
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
                border: '2px solid rgba(255,255,255,0.3)',
              }}
            />
            <div>
              <span className="fw-semibold" style={{ fontSize: isFullscreen ? '1rem' : '0.85rem' }}>
                Cory &mdash; AI COO
              </span>
              {isFullscreen && (
                <div style={{ fontSize: '0.7rem', opacity: 0.75 }}>Full analysis mode</div>
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
              onClick={() => setChatOpen(false)}
              aria-label="Close Cory chat"
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

        {/* CoryPanel content — lazy loaded, never unmounted once opened */}
        <div
          className={isFullscreen ? 'flex-grow-1 d-flex justify-content-center' : 'flex-grow-1'}
          style={{ minHeight: 0, overflow: 'hidden' }}
        >
          <div style={isFullscreen ? { width: '100%', maxWidth: 820, height: '100%' } : { width: 400, height: '100%' }}>
            {chatOpen && (
              <Suspense fallback={
                <div className="d-flex justify-content-center align-items-center h-100">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading Cory...</span>
                  </div>
                </div>
              }>
                <CoryPanel
                  onVisualizationsUpdate={noop}
                  onSummaryUpdate={noop}
                  onInsightsUpdate={noop}
                  externalQuery={null}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
