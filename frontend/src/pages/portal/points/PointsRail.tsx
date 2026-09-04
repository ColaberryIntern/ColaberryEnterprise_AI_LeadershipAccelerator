import React, { useEffect, useState } from 'react';
import { fetchPoints, levelFor, bandHudNext, isFiveBandUiEnabled } from '../../../services/onboardingApi';
import type { Band } from '../../../services/onboardingApi';

/**
 * PointsRail — the sticky "where you are" column for /portal/points.
 *
 * The drill-down below explains where every point came from, which is a long
 * read. This stays in view while you read it, so the total and the distance to
 * the next level never scroll away — the same job the rail does on Projects and
 * Cert Prep.
 *
 * It reads the same `/api/portal/points` the header HUD reads and applies the
 * same level logic, so the number here can never disagree with the number in
 * the chrome above it. Nothing is computed locally that the server did not send.
 */
const PointsRail: React.FC = () => {
  const [total, setTotal] = useState<number | null>(null);
  const [band, setBand] = useState<Band | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPoints()
      .then((p) => { if (live) { setTotal(p.total); setBand(p.band ?? null); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) {
    return (
      <div className="te-card pts-rail">
        <h3 className="pts-rail-h">Where you are</h3>
        <p className="pts-rail-note">Your total could not be loaded. The breakdown below is still accurate.</p>
      </div>
    );
  }

  if (total === null) {
    return (
      <div className="te-card pts-rail">
        <h3 className="pts-rail-h">Where you are</h3>
        <p className="pts-rail-note">Loading…</p>
      </div>
    );
  }

  const useBand = isFiveBandUiEnabled() && !!band;
  const lvl = levelFor(total);
  const name = useBand ? band!.rungName : lvl.name;
  const next = useBand
    ? bandHudNext(band!, total)
    : (lvl.next ? `${(lvl.next.min - total).toLocaleString()} pts to ${lvl.next.name}` : 'Top level reached');

  return (
    <div className="te-card pts-rail">
      <h3 className="pts-rail-h">Where you are</h3>
      <div className="pts-rail-total">{total.toLocaleString()}<span> pts</span></div>
      <div className="pts-rail-level">{name}</div>
      <div className="pts-rail-bar" aria-hidden="true"><span style={{ width: `${lvl.pct}%` }} /></div>
      <p className="pts-rail-next">{next}</p>
    </div>
  );
};

export default PointsRail;
