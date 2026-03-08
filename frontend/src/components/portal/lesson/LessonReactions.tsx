import React, { useState } from 'react';

interface LessonReactionsProps {
  onConfused?: () => void;
}

const REACTIONS = [
  { id: 'helpful', emoji: '\uD83D\uDC4D', label: 'Helpful' },
  { id: 'interesting', emoji: '\uD83D\uDCA1', label: 'Interesting' },
  { id: 'mindblown', emoji: '\uD83E\uDD2F', label: 'Mind Blown' },
  { id: 'confused', emoji: '\uD83D\uDE15', label: 'Confused' },
];

export default function LessonReactions({ onConfused }: LessonReactionsProps) {
  const [active, setActive] = useState<string | null>(null);

  const handleClick = (id: string) => {
    if (active === id) {
      setActive(null);
      return;
    }
    setActive(id);
    if (id === 'confused') {
      onConfused?.();
    }
  };

  return (
    <div className="d-flex align-items-center gap-2 py-3">
      <span className="small fw-medium" style={{ color: '#64748b', fontSize: 12 }}>
        How was this lesson?
      </span>
      <div className="d-flex gap-1">
        {REACTIONS.map(r => {
          const isActive = active === r.id;
          const isConfused = r.id === 'confused';
          return (
            <button
              key={r.id}
              className="btn btn-sm d-flex align-items-center gap-1"
              style={{
                fontSize: 14,
                padding: '4px 10px',
                borderRadius: 20,
                border: `1.5px solid ${isActive ? (isConfused ? '#fecaca' : '#c7d2fe') : '#e2e8f0'}`,
                background: isActive ? (isConfused ? '#fef2f2' : '#eef2ff') : '#fff',
                color: isActive ? (isConfused ? '#ef4444' : '#6366f1') : '#64748b',
                transition: 'all 0.15s',
                lineHeight: 1,
              }}
              onClick={() => handleClick(r.id)}
              title={r.label}
            >
              <span>{r.emoji}</span>
              <span style={{ fontSize: 11 }}>{r.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
