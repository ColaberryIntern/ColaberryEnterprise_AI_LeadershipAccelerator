import { useState } from 'react';
import { fetchPoints, submitReferrals, PointsSummary } from '../../../services/onboardingApi';
import { emitPointsEarned } from '../../../services/pointsFx';

interface UseReferralFormOpts {
  busy: boolean;
  setBusy: (v: boolean) => void;
  points: PointsSummary | null;
  setPoints: (p: PointsSummary) => void;
  loadAll: () => Promise<void>;
  flash: (msg: string) => void;
}

/**
 * "Recommend a friend" onboarding step — one or more friends, one submission,
 * same capture-prevTotal/diff/celebrate pattern as the resume/LinkedIn upload
 * (per Ali's choice: reuse the existing points-HUD burst, no new celebration
 * modal). Extracted out of TodayShell.tsx (which had grown past the CLAUDE.md
 * 500-line file ceiling) since this state + its handlers are self-contained.
 */
export function useReferralForm({ busy, setBusy, points, setPoints, loadAll, flash }: UseReferralFormOpts) {
  const [showReferral, setShowReferral] = useState(false);
  const [referralFriends, setReferralFriends] = useState([{ name: '', email: '' }]);
  const [referralSubmitted, setReferralSubmitted] = useState(false);

  const addReferralRow = () => setReferralFriends((rows) => [...rows, { name: '', email: '' }]);
  const updateReferralRow = (i: number, field: 'name' | 'email', value: string) =>
    setReferralFriends((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const removeReferralRow = (i: number) => setReferralFriends((rows) => (rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows));

  const submitReferralFriends = async () => {
    const valid = referralFriends
      .map((r) => ({ name: r.name.trim(), email: r.email.trim() }))
      .filter((r) => r.name && /\S+@\S+\.\S+/.test(r.email));
    if (valid.length === 0 || busy) { flash('Add at least one friend\'s name and email'); return; }
    setBusy(true);
    const prevTotal = points?.total ?? 0;
    try {
      await submitReferrals(valid);
      await loadAll();
      try {
        const fresh = await fetchPoints();
        setPoints(fresh);
        const gained = (fresh?.total ?? 0) - prevTotal;
        if (gained > 0) emitPointsEarned(gained);
      } catch { /* keep prior total */ }
      setReferralSubmitted(true);
    } catch { flash('Could not submit right now — please try again'); } finally { setBusy(false); }
  };

  const resetReferralForm = () => { setShowReferral(false); setReferralSubmitted(false); setReferralFriends([{ name: '', email: '' }]); };

  return {
    showReferral, setShowReferral, referralFriends, referralSubmitted,
    addReferralRow, updateReferralRow, removeReferralRow, submitReferralFriends, resetReferralForm,
  };
}
