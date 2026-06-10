import React from 'react';

// Attention Blind-Spot Heat Map. A word cloud built only from HIDDEN emails.
// Visual encoding (per spec):
//   size     = frequency across hidden emails
//   color    = average Opportunity Risk Score (green high / amber med / gray low)
//   opacity  = classification confidence
//   rotation = average age of matching emails
// Click a word -> topic drilldown.

export interface HeatMapWord {
  topic: string;
  frequency: number;
  avgScore: number;
  band: 'high' | 'medium' | 'low';
  avgAgeHours: number;
  avgConfidence: number;
}

const BAND_COLOR: Record<string, string> = { high: '#16a34a', medium: '#d97706', low: '#94a3b8' };

interface Props {
  words: HeatMapWord[];
  onSelectTopic: (topic: string) => void;
}

export default function MissedOpportunitiesHeatMap({ words, onSelectTopic }: Props) {
  if (!words.length) {
    return (
      <div style={{ color: '#64748b', fontStyle: 'italic', padding: '40px 0', textAlign: 'center' }}>
        No hidden topics for this day.
      </div>
    );
  }

  const maxFreq = Math.max(...words.map((w) => w.frequency));
  // Rotation: older average age tilts the word more (capped at ±20°).
  const rotationFor = (ageHours: number) => {
    const deg = Math.min(20, Math.round(ageHours / 6));
    return deg;
  };

  return (
    <div>
      <div
        style={{
          background: 'linear-gradient(135deg,#0f172a 0%,#16223f 100%)',
          borderRadius: 12,
          padding: '28px 22px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px 14px',
          minHeight: 160,
        }}
      >
        {words.map((w) => {
          const size = 14 + Math.round((w.frequency / maxFreq) * 24); // 14-38px
          const opacity = Math.max(0.5, Math.min(1, w.avgConfidence / 100));
          return (
            <button
              key={w.topic}
              type="button"
              onClick={() => onSelectTopic(w.topic)}
              title={`${w.topic} · avg score ${w.avgScore} · ${w.frequency} mentions · ${w.avgConfidence}% filter confidence · ~${w.avgAgeHours}h old`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: size,
                fontWeight: 800,
                color: BAND_COLOR[w.band],
                opacity,
                transform: `rotate(-${rotationFor(w.avgAgeHours)}deg)`,
                lineHeight: 1.1,
                padding: 0,
                transition: 'transform 0.15s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'rotate(0deg) scale(1.08)'; e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = `rotate(-${rotationFor(w.avgAgeHours)}deg)`; e.currentTarget.style.opacity = String(opacity); }}
            >
              {w.topic}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11, color: '#64748b', marginTop: 10 }}>
        <span><strong style={{ color: '#16a34a' }}>●</strong> High opportunity</span>
        <span><strong style={{ color: '#d97706' }}>●</strong> Medium</span>
        <span><strong style={{ color: '#94a3b8' }}>●</strong> Low</span>
        <span>Size = volume</span>
        <span>Opacity = filter confidence</span>
        <span>Tilt = age</span>
      </div>
    </div>
  );
}
