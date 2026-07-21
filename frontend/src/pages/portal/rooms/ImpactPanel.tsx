import React, { useEffect, useState } from 'react';
import { fetchImpact, ImpactResponse } from '../../../services/roomsApi';
import { levelFor } from '../../../services/onboardingApi';

// Phase B #3 — "make recognition visible." Two things at once: the viewer's own
// impact (badges they've earned + live level/points), and a cohort recognition
// wall so students SEE their peers being recognized (social proof → contagion).
// Self-hides if the Rooms feature is off or the API 404s.

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const ImpactPanel: React.FC = () => {
  const [data, setData] = useState<ImpactResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchImpact().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed || !data) return null;
  const { impact, recognition } = data;
  const earned = impact.total_contributions > 0;

  return (
    <div className="te-card rm-impact" style={{ padding: 16, marginTop: 16 }}>
      <div className="rm-impact-head">
        <p className="rm-strip-title" style={{ margin: 0 }}>🏅 Your impact</p>
        <span className="rm-lvlpill">{levelFor(impact.points).name} · {impact.points} pts</span>
      </div>

      {earned ? (
        <div className="rm-badges">
          {impact.badges.map((b) => (
            <div className="rm-badge" key={b.category} title={b.blurb}>
              <span className="rm-badge-emoji">{b.emoji}</span>
              <span className="rm-badge-label">{b.label}</span>
              <span className="rm-badge-count">×{b.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rm-impact-empty">Host a session, help a cohortmate, or just show up — your recognition shows up here.</p>
      )}

      {recognition.length > 0 && (
        <div className="rm-reco">
          <div className="rm-reco-hdr">Recent recognition in your cohort</div>
          {recognition.slice(0, 6).map((r, i) => (
            <div className="rm-reco-row" key={`${r.enrollment_id}-${i}`}>
              <span className="rm-reco-emoji">{r.emoji}</span>
              <span className="rm-reco-txt"><b>{r.display_name}</b> earned <b>{r.label}</b></span>
              <span className="rm-reco-ago">{ago(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImpactPanel;
