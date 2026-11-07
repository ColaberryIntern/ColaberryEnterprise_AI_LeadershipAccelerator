import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchEnrollment, selectEnrollmentCohort,
  cohortHeadline, cohortOrientation, isBatchCohort,
  PortalEnrollmentView, EnrollmentCohortOption,
} from '../../../services/portalEnrollmentApi';
import { usePortalFlags } from '../../../hooks/usePortalFlags';
import { startInternshipApplication } from '../../../services/internshipApi';

/**
 * The AI Internship's sentinel value in the class-date dropdown.
 *
 * Deliberately NOT a cohort id. Choosing the internship must never reach
 * `selectEnrollmentCohort`, because that sets `enrollments.cohort_id` — and the
 * internship is a SECONDARY membership that leaves the training cohort untouched
 * (see internshipActivationService). `portalEnrollmentService.isRealClassCohort`
 * would reject the internship cohort anyway, so passing its real id would simply
 * fail with `cohort_not_selectable`; a sentinel makes the different code path
 * explicit rather than relying on that rejection.
 */
const INTERNSHIP_CHOICE = '__ai_internship__';

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

/**
 * One row in the class-date dropdown.
 *
 * `cohortHeadline` is what keeps a BATCH from advertising its orientation as a
 * start date: a batch's `start_date` falls in the month after the batch, so the
 * month is the honest headline and the orientation goes in the note below the
 * select rather than into the option text. A legacy fixed-start cohort reads
 * exactly as it always has.
 */
const optionLabel = (c: EnrollmentCohortOption): string => {
  let label = cohortHeadline(c);
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
  const navigate = useNavigate();
  const { flags } = usePortalFlags();
  // The internship option only exists when the funnel is switched on. A student
  // must never be offered an application the API would then 404.
  const internshipOn = !!flags?.internship;

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
  const selectedDate = selected ? cohortHeadline(selected) : null;
  const selectedOrientation = selected ? cohortOrientation(selected) : null;
  // The field is only a "start date" while every option in it IS one. Once a
  // batch is open the student is choosing a month, not a day, and calling that
  // field a start date is the same error as printing the orientation in it.
  const dateFieldLabel = view.cohorts.some(isBatchCohort) ? 'Your batch' : 'Class start date';

  /**
   * Start an internship application and go to it.
   *
   * Separate from `onEnroll` on purpose: this writes nothing to the enrollment.
   * It opens an application (idempotently — a second click returns the existing
   * one) and hands the student to the internship page, which is where the
   * requirements, the intake form and the interview live.
   */
  const applyForInternship = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await startInternshipApplication();
      navigate('/portal/internship');
    } catch {
      flash('Could not open the internship application right now. Please try again.');
    } finally { setBusy(false); }
  };

  const onEnroll = async () => {
    if (choice === INTERNSHIP_CHOICE) { void applyForInternship(); return; }
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

  /**
   * Enrolling versus paying.
   *
   * THIS BLOCK USED TO PROMISE THAT PAYING EARLY COST NOTHING, and it was true
   * when it was written: billing anchored on the class start date, so paying 7/20
   * for a class starting 7/23 still ran the first month 7/23 to 8/23. It stopped
   * being true on 2026-10-30. `billingAnchorMs` now returns the payment date and
   * ignores the cohort start entirely — a deliberate change, made so a rolling
   * intake gives everyone a predictable anniversary, and its own comment records
   * the cost: "a member who signs up before a class begins now spends part of
   * their first month waiting for it."
   *
   * The copy was not changed with the code, so this screen has been making a
   * money promise the billing engine does not keep, to exactly the students being
   * asked to pay. What it says now is what `billingPeriod` actually does.
   */
  const payEarlyNote = () => (
    <div className="set-enroll-callout">
      <div className="ttl">Enroll now — pay when you’re ready</div>
      <p>
        Enrolling needs no card and reserves your spot. Paying locks your seat in, and your
        membership runs from <b>the day you pay</b>, renewing on that date each month.
      </p>
    </div>
  );

  /**
   * The facts panel, shared by the unpaid and the paid states.
   *
   * Which facts there ARE depends on the kind of row. A legacy cohort has a class
   * start date and a cohort name. A batch has a month and an orientation, and its
   * name ("Cohort - December 2026") only repeats the month, so printing both reads
   * as two different things that happen to agree.
   */
  const enrollmentFacts = (c: EnrollmentCohortOption) => {
    const orientation = cohortOrientation(c);
    return (
      <div className="set-enroll-facts">
        <div className="fact">
          <span className="k">{orientation ? 'Your batch' : 'Class starts'}</span>
          <span className="v">{cohortHeadline(c)}</span>
        </div>
        {orientation
          ? <div className="fact"><span className="k">Orientation</span><span className="v">{orientation}</span></div>
          : <div className="fact"><span className="k">Cohort</span><span className="v">{c.name}</span></div>}
        {c.core_day && (
          <div className="fact"><span className="k">Live classes</span><span className="v">{c.core_day}s{c.core_time ? ` · ${c.core_time}` : ''}</span></div>
        )}
      </div>
    );
  };

  const datePicker = (
    <div className="set-field" style={{ maxWidth: 420 }}>
      <label className="set-label" htmlFor="enroll-date">{dateFieldLabel}</label>
      <select id="enroll-date" className="set-input" value={choice} onChange={(e) => setChoice(e.target.value)}>
        {/* Grouped so the internship never reads as a class DATE. Every other
            option in this list is a day in the calendar; an ungrouped
            "AI Internship" sitting among them is a category error a student has
            to squint at. */}
        <optgroup label={dateFieldLabel}>
          {view.cohorts.map((c) => (
            <option key={c.id} value={c.id}>{optionLabel(c)}</option>
          ))}
        </optgroup>
        {internshipOn && (
          <optgroup label="Other programs">
            <option value={INTERNSHIP_CHOICE}>
              AI Internship — work on real Colaberry projects
            </option>
          </optgroup>
        )}
      </select>
      {choice === INTERNSHIP_CHOICE ? (
        <span className="set-sub" style={{ margin: '2px 0 0' }}>
          Rolling weekly starts, no fixed end date. You keep your class enrollment —
          the internship is added on top, not instead.
        </span>
      ) : (selectedOrientation || selected?.core_day) ? (
        <span className="set-sub" style={{ margin: '2px 0 0' }}>
          {/* For a batch the orientation has to be said out loud HERE, because it
              is deliberately not in the option text. Leaving it out entirely
              would be the opposite error: a student who sees only "December 2026"
              has no idea when the group meets for the first time. */}
          {selectedOrientation && (
            <>You start as soon as you enroll and the work is self-paced. Orientation is {selectedOrientation}. </>
          )}
          {selected?.core_day && (
            <>Live classes meet {selected.core_day}s{selected.core_time ? `, ${selected.core_time}` : ''}.</>
          )}
        </span>
      ) : null}
    </div>
  );

  return (
    <section className="te-card set-section">
      <h3>Enrollment</h3>

      {/* ── Not enrolled: pick a date + reserve ── */}
      {!enrolled && (
        <>
          <p className="set-sub">
            Pick your class start date and enroll. No card needed, and it reserves your place in the cohort.
          </p>
          {view.cohorts.length === 0 && !internshipOn ? (
            <div className="set-empty">No upcoming class dates are open right now — check back soon.</div>
          ) : (
            <>
              {datePicker}
              <div className="set-actions" style={{ justifyContent: 'flex-start' }}>
                <button className="te-btn cherry" disabled={busy || !choice} onClick={onEnroll}>
                  {busy
                    ? (choice === INTERNSHIP_CHOICE ? 'Opening…' : 'Enrolling…')
                    : choice === INTERNSHIP_CHOICE
                      ? 'Apply for the AI Internship'
                      : `Enroll — reserve my spot${selectedDate ? ` for ${selectedDate}` : ''}`}
                </button>
              </div>
              {choice !== INTERNSHIP_CHOICE && payEarlyNote()}
            </>
          )}
        </>
      )}

      {/* ── Enrolled, not paid: confirmation + lock-in CTA ── */}
      {enrolled && !view.paid && (
        <>
          <span className="set-sub-badge active">● Enrolled</span>
          {enrollmentFacts(enrolled)}
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
                <button
                  className="te-btn berry sm"
                  disabled={busy || !choice || choice === enrolled.id || choice === INTERNSHIP_CHOICE}
                  onClick={onEnroll}
                >
                  {busy ? 'Saving…' : 'Save new date'}
                </button>
              </div>
            </>
          )}
          {payEarlyNote()}
        </>
      )}

      {/* ── Paid: seat locked ── */}
      {enrolled && view.paid && (
        <>
          <span className="set-sub-badge active">● Seat locked</span>
          {enrollmentFacts(enrolled)}
          <p className="set-sub">
            You’re enrolled and your seat is locked in — see you in class. Need a different
            start date? Contact the program team and we’ll move you, no penalty.
          </p>
        </>
      )}
      {internshipOn && enrolled && (
        <div className="set-enroll-callout" style={{ marginTop: 16 }}>
          <div className="ttl">Also open to you: the AI Internship</div>
          <p>
            Work on real Colaberry AI projects alongside your class — two projects at a
            time, your own manager, and KPIs you track yourself. You keep your class
            place; the internship is added on top, not instead of it.
          </p>
          <div className="set-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <button className="te-btn berry sm" disabled={busy} onClick={applyForInternship}>
              {busy ? 'Opening…' : 'Apply for the AI Internship'}
            </button>
          </div>
        </div>
      )}

    </section>
  );
};

export default EnrollmentSection;
