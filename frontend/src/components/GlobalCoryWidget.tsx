import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ExecutiveAwarenessPanel from './ExecutiveAwarenessPanel';
import api from '../utils/api';

// ─── Component ──────────────────────────────────────────────────────────────

export default function GlobalCoryWidget() {
  const location = useLocation();
  const [isHovered, setIsHovered] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [badge, setBadge] = useState<{ count: number; maxSeverity: string }>({ count: 0, maxSeverity: 'none' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = location.pathname.startsWith('/admin');

  const fetchBadge = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/executive-awareness/badge');
      setBadge(res.data);
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

  // Don't render on the Intelligence OS page itself (it has its own CoryOrb)
  if (location.pathname === '/admin/intelligence') return null;

  const handleClick = () => {
    if (isAdmin && badge.count > 0) {
      setPanelOpen((prev) => !prev);
    } else {
      const context = encodeURIComponent(location.pathname);
      window.open(`/admin/intelligence?cory=open&context=${context}`, '_blank');
    }
  };

  // Badge color by severity
  const badgeColor =
    badge.maxSeverity === 'critical' ? '#e53e3e' :
    badge.maxSeverity === 'high' ? '#dd6b20' :
    badge.maxSeverity === 'important' ? '#3182ce' :
    '#a0aec0';

  const isCritical = badge.maxSeverity === 'critical';

  return (
    <div className="global-cory-widget">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={badge.count > 0 ? `Cory — ${badge.count} executive events` : 'Open Cory — AI COO'}
        title={badge.count > 0 ? `${badge.count} executive event${badge.count !== 1 ? 's' : ''}` : 'Cory — AI COO'}
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

        <img
          src="/cory-avatar.jpg"
          alt="Cory — AI COO"
          className="global-cory-avatar"
          style={isHovered ? { transform: 'scale(1.1)', boxShadow: '0 6px 24px rgba(26, 54, 93, 0.45)' } : undefined}
        />

        {/* Badge counter */}
        {badge.count > 0 && (
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
        {isHovered && (
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
    </div>
  );
}
