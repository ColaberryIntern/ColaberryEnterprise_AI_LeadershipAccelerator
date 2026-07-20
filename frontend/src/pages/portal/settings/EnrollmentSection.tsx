import React, { useEffect, useState } from 'react';
import {
  fetchEnrollment, selectEnrollmentCohort, formatClassDate,
  PortalEnrollmentView, EnrollmentCohortOption,
} from '../../../services/portalEnrollmentApi';

/**
 * EnrollmentSection — the Settings "Enrollment" tab (shown before Subscription).
 *
 * Enrolling ≠ paying. Picking a class date here reserves the student's place,
 * free, in one click. Payment (Subscription tab) locks the seat — and billing
 * is anchored server-side to the class start date, so paying early never
 * shortens the first month. Three states:
 *  - not enrolled: date dropdown (defaults to the soonest class, e.g. July 23)
 *    + "Reserve my spot".
 *  - enrolled, unpaid: confirmation + change-date + "Lock in my seat" CTA that
 *    jumps to the Subscription tab.
 *  - paid: seat locked; date changes go through the program team.
 */

const optionLabel = (c: EnrollmentCohortOption): string => {
  let label = formatClassDate(c.start_date);
  if (c.core_day && c.core_time) label += ` · ${c.core_day} ${c.core_time}`;
  if (c.seats_left != null && c.seats_left <= 10) label += ` · ${c.seats_left} seats left`;
  return label;
};

const EnrollmentSection: React.FC<{
  onToast?: (m: string) => void;
  onGoToSubscription?: () => void;
}> = ({ onToast, onGoToSubscription }) => {
  const [view, setView] = useState<PortalEnrollmentView | null>(null);
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const flash = (m: string) => { if (onToast) onToast(m); };

  useEffect(() => {
    let alive = true;
    fetchEnrollment()
      .then((v) => { if (alive) { setView(v); setChoice(v.default_cohort_id || ''); } })
      .catch(() => { /* section stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!view) return null;

  const enrolled = view.enrolled_cohort;
  const selected = view.cohorts.find((c) => c.id === choice) || null;
  const selectedDate = selected ? formatClassDate(selected.start_date) : null;

  const onEnroll = async () => {
    if (busy || !choice) return;
    setBusy(true);
    try {
      const r = await selectEnrollmentCohort(choice);
      setView(r.view);
      setChoice(r.view.default_cohort_id || choice);
      setChanging(false);
      flash(r.changed ? 'You’re enrolled — your spot is reserved' : 'You’re already enrolled in this class');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      flash(code === 'locked_after_payment'
        ? 'Your seat is locked in — contact the program team to change your class date.'
        : code === 'cohort_started' || code === 'cohort_closed'
          ? 'That class is no longer open — please pick another date.'
          : 'Could not save your enrollment right now. Please try again.');
    } finally { setBusy(false); }
  };

  // The "pay early without penalty" promise, anchored to the chosen date.
  const payEarlyNote = (dateLabel: string | null) => (
    <div className="set-enroll-callout">
      <div className="ttl">Enroll now — pay when you’re ready</div>
      <p>
        Enrolling is free and reserves your spot. Paying locks your seat — and your
        subscription month starts on your <b>class start date{dateLabel ? ` (${dateLabel})` : ''}</b>,
        not the day you pay. Pay before class starts and your first month still runs
        from {dateLabel || 'class day'} — paying early never costs you time.
      </p>
    </div>
  );

  const datePicker = (
    <div className="set-field" style={{ maxWidth: 420 }}>
      <label className="set-label" htmlFor="enroll-date">Class start date</label>
      <select id="enroll-date" className="set-input" value={choice} onChange={(e) => setChoice(e.target.value)}>
        {view.cohorts.map((c) => (
          <option key={c.id} value={c.id}>{optionLabel(c)}</option>
        ))}
      </select>
      {selected?.core_day && (
        <span className="set-sub" style={{ margin: '2px 0 0' }}>
          Live classes meet {selected.core_day}s, {selected.core_time || ''}.
        </span>
      )}
    </div>
  );

  return (
    <section className="te-card set-section">
      <h3>Enrollment</h3>

      {/* ── Not enrolled: pick a date + reserve ── */}
      {!enrolled && (
        <>
          <p className="set-sub">
            Pick your class start date and enroll — it’s free and reserves your place in the cohort.
          </p>
          {view.cohorts.length === 0 ? (
            <div className="set-empty">No upcoming class dates are open right now — check back soon.</div>
          ) : (
            <>
              {datePicker}
              <div className="set-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="te-btn cherry" disabled={busy || !choice} onClick={onEnroll}>
                  {busy ? 'Enrolling…' : `Enroll — reserve my spot${selectedDate ? ` for ${selectedDate}` : ''}`}
                </button>
              </div>
              {payEarlyNote(selectedDate)}
            </>
          )}
        </>
      )}

      {/* ── Enrolled, not paid: confirmation + lock-in CTA ── */}
      {enrolled && !view.paid && (
        <>
          <span className="set-sub-badge active">● Enrolled</span>
          <div className="set-enroll-facts">
            <div className="fact"><span className="k">Class starts</span><span className="v">{formatClassDate(enrolled.start_date)}</span></div>
            <div className="fact"><span className="k">Cohort</span><span className="v">{enrolled.name}</span></div>
            {enrolled.core_day && (
              <div className="fact"><span className="k">Live classes</span><span className="v">{enrolled.core_day}s{enrolled.core_time ? ` · ${enrolled.core_time}` : ''}</span></div>
            )}
          </div>
          <p className="set-sub">
            Your spot is reserved. To <b>lock in your seat</b>, choose a plan on the Subscription tab.
          </p>
          <div className="set-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
            {onGoToSubscription && (
              <button className="te-btn cherry" onClick={onGoToSubscription}>Lock in my seat — choose a plan</button>
            )}
            <button className="te-btn ghost sm" onClick={() => setChanging((v) => !v)}>
              {changing ? 'Keep this date' : 'Change my start date'}
            </button>
          </div>
          {changing && (
            <>
              {datePicker}
              <div className="set-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="te-btn berry sm" disabled={busy || !choice || choice === enrolled.id} onClick={onEnroll}>
                  {busy ? 'Saving…' : 'Save new date'}
                </button>
              </div>
            </>
          )}
          {payEarlyNote(formatClassDate(enrolled.start_date))}
        </>
      )}

      {/* ── Paid: seat locked ── */}
      {enrolled && view.paid && (
        <>
          <span className="set-sub-badge active">● Seat locked</span>
          <div className="set-enroll-facts">
            <div className="fact"><span className="k">Class starts</span><span className="v">{formatClassDate(enrolled.start_date)}</span></div>
            <div className="fact"><span className="k">Cohort</span><span className="v">{enrolled.name}</span></div>
            {enrolled.core_day && (
              <div className="fact"><span className="k">Live classes</span><span className="v">{enrolled.core_day}s{enrolled.core_time ? ` · ${enrolled.core_time}` : ''}</span></div>
            )}
          </div>
          <p className="set-sub">
            You’re enrolled and your seat is locked in — see you in class. Need a different
            start date? Contact the program team and we’ll move you, no penalty.
          </p>
        </>
      )}
    </section>
  );
};

export default EnrollmentSection;
