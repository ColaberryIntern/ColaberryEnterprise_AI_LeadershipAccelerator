import React from 'react';

interface CoryOrbProps {
  onClick: () => void;
  isOpen: boolean;
  hasNotification?: boolean;
}

export default function CoryOrb({ onClick, isOpen, hasNotification }: CoryOrbProps) {
  return (
    <button
      className="cory-orb-button"
      onClick={onClick}
      aria-label={isOpen ? 'Close Cory AI COO' : 'Open Cory AI COO'}
      title="Cory — AI COO"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: 'var(--color-primary)',
        color: '#fff',
        border: 'none',
        fontSize: '1.4rem',
        fontWeight: 700,
        cursor: 'pointer',
        zIndex: 1060,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(26, 54, 93, 0.35)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {isOpen ? (
        <svg width="22" height="22" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
        </svg>
      ) : (
        <img
          src="/cory-avatar.jpg"
          alt="Cory"
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      )}
      {hasNotification && !isOpen && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--color-secondary)',
            border: '2px solid #fff',
          }}
        />
      )}
    </button>
  );
}
