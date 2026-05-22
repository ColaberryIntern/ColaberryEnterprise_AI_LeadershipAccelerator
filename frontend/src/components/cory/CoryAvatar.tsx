/**
 * CoryAvatar — Floating AI Architect button.
 *
 * Fixed bottom-right corner on portal pages where it's mounted.
 *
 * 2026-05-22: click now opens the GlobalCoryWidget chat in place
 * (was: navigated to `/portal/project/cory` fullscreen, which broke
 * the operator's context — modals closed, scroll lost, "go back to
 * where I was" required a manual navigate). The route still exists
 * for bookmark / search compatibility; nothing links to it anymore.
 */
import React, { useState } from 'react';
import { useCoryOpen } from '../../hooks/useCoryAsk';

export default function CoryAvatar() {
  const openCory = useCoryOpen();
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
      }}
    >
      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 0,
            background: 'var(--color-primary)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          Ask Cory anything
          <div style={{
            position: 'absolute',
            bottom: -5,
            right: 18,
            width: 10,
            height: 10,
            background: 'var(--color-primary)',
            transform: 'rotate(45deg)',
          }}></div>
        </div>
      )}

      {/* Avatar button */}
      <button
        className="btn"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => openCory('cory-avatar')}
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a365d, #3b82f6)',
          color: '#fff',
          fontSize: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: hovered
            ? '0 4px 20px rgba(59, 130, 246, 0.5)'
            : '0 2px 12px rgba(0,0,0,0.15)',
          border: 'none',
          transition: 'all 0.2s ease',
          transform: hovered ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        <i className="bi bi-robot"></i>
      </button>
    </div>
  );
}
