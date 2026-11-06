import React, { useEffect, useState } from 'react';
import {
  fetchHireListingSettings, setHireAvailability,
  type HireAvailabilityKind, type HireListingSettings,
} from '../../../services/hireListingApi';

/**
 * HireAvailabilityPanel - the learner says, in their own words, whether they are looking.
 *
 * It appears on hire.refactored.ai beside their name ONLY once they are listed there
 * (a published case study about their work), and only while it is set. It lists nobody
 * by itself. Clearing it removes the line; nothing is ever inferred from activity.
 */

const KINDS: Array<{ value: HireAvailabilityKind; label: string; example: string }> = [
  { value: 'open', label: 'Open to roles', example: 'Open to FDE roles' },
  { value: 'interviewing', label: 'Interviewing', example: 'Interviewing, open to intros' },
  { value: 'placed', label: 'Placed', example: 'Placed, not looking' },
];

const HireAvailabilityPanel: React.FC = () => {
  const [settings, setSettings] = useState<HireListingSettings | null>(null);
  const [kind, setKind] = useState<HireAvailabilityKind>('open');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    fetchHireListingSettings()
      .then((s) => {
        if (!live) return;
        setSettings(s);
        if (s.availability) { setKind(s.availability.status); setLabel(s.availability.label); }
      })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, []);

  const save = async (value: { status: HireAvailabilityKind; label: string } | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const s = await setHireAvailability(value);
      setSettings(s);
      if (!value) setLabel('');
      setMessage(value ? 'Saved.' : 'Cleared. Nothing shows beside your name.');
    } catch {
      setMessage('That did not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // No portfolio page yet: the address panel above creates it; there is nothing to set.
  if (missing) return null;
  if (!settings) return <p className="cp-muted">Loading…</p>;

  const trimmed = label.trim();
  return (
    <section className="cp-card" data-testid="hire-availability-panel">
      <h3 className="cp-card-h">Availability on Hire · Refactored</h3>
      <p className="cp-muted" style={{ marginTop: 0 }}>
        Shown beside your name on hire.refactored.ai once a case study about your work is
        published there. Your words, and only while you leave them set.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span className="cp-muted">Status</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as HireAvailabilityKind)} disabled={busy} data-testid="hire-availability-kind">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 220 }}>
          <span className="cp-muted">What employers see</span>
          <input
            value={label}
            maxLength={80}
            placeholder={KINDS.find((k) => k.value === kind)?.example}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            data-testid="hire-availability-label"
          />
        </label>
        <button type="button" className="cp-btn cp-btn-primary" disabled={busy || !trimmed} onClick={() => save({ status: kind, label: trimmed })} data-testid="hire-availability-save">
          Save
        </button>
        {settings.availability && (
          <button type="button" className="cp-btn" disabled={busy} onClick={() => save(null)} data-testid="hire-availability-clear">
            Clear
          </button>
        )}
      </div>
      {message && <p className="cp-muted" role="status" data-testid="hire-availability-message">{message}</p>}
    </section>
  );
};

export default HireAvailabilityPanel;
