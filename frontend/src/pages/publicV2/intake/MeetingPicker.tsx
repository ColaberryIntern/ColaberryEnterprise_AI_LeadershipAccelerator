import React, { useEffect, useState } from 'react';
import { Meeting, OfferedSlots, bookMeeting, errorText, getMeetingSlots } from '../../../services/enterpriseIntakeApi';
import { dayLabel, timeLabel, whenLabel } from './intakeModel';

/**
 * MeetingPicker - book the meeting with Ali in the same visit (v2, 2026-11-21).
 *
 * The times come from Ali's own calendar and start the business day after the AI interview
 * (or after the time they scheduled it for), so the research is done before they meet.
 */
export interface MeetingPickerProps {
  token: string;
  /** Changes when the interview time changes, so the times are fetched again. */
  anchorKey: string;
  onBooked: (meeting: Meeting) => void;
}

export function MeetingPicker({ token, anchorKey, onBooked }: MeetingPickerProps): React.ReactElement {
  const [offered, setOffered] = useState<OfferedSlots | null>(null);
  const [day, setDay] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    getMeetingSlots(token)
      .then((o) => {
        if (!live) return;
        setOffered(o);
        setDay(0);
        setChosen(null);
      })
      .catch((err) => {
        if (!live) return;
        setFailed(true);
        setNote(errorText(err, 'We could not load the calendar. Please try again in a minute.'));
      });
    return () => {
      live = false;
    };
  }, [token, anchorKey, reload]);

  const book = async (): Promise<void> => {
    if (!chosen) return;
    setBusy(true);
    setNote('');
    try {
      const r = await bookMeeting(token, chosen);
      onBooked(r.meeting);
    } catch (err) {
      setNote(errorText(err, 'That did not book. Please pick a time again.'));
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const days = offered?.dates.slice(0, 10) || [];
  const today = days[day];

  return (
    <section className="cbv2-dpi__card" aria-labelledby="dpi-meet-title" data-testid="meeting-picker">
      <h2 id="dpi-meet-title" className="cbv2-dpi__h">Book your 30 minutes with Ali</h2>
      <p className="cbv2-dpi__lead">
        On Google Meet. Times start {offered ? dayLabel(offered.earliest) : 'the business day after your AI interview'}, so
        your research and options are ready. Shown in your time zone.
      </p>

      {!offered && !failed ? <p className="cbv2-dpi__wait">Loading Ali&apos;s calendar…</p> : null}
      {offered && days.length === 0 ? <p className="cbv2-dpi__wait">No open times in the next three weeks. Email info@colaberry.com and we will find one.</p> : null}

      {days.length > 0 ? (
        <>
          <div className="cbv2-dpi__days" role="tablist" aria-label="Day">
            {days.map((d, n) => (
              <button key={d.date} type="button" role="tab" aria-selected={n === day} onClick={() => { setDay(n); setChosen(null); }}>
                {dayLabel(d.slots[0].start)}
              </button>
            ))}
          </div>
          <div className="cbv2-dpi__times" role="radiogroup" aria-label="Time">
            {today?.slots.map((s) => (
              <button key={s.start} type="button" role="radio" aria-checked={chosen === s.start} onClick={() => setChosen(s.start)}>
                {timeLabel(s.start)}
              </button>
            ))}
          </div>
          <button type="button" className="cbv2-btn cbv2-btn--primary" onClick={() => void book()} disabled={!chosen || busy}>
            {busy ? 'Booking…' : chosen ? `Book ${whenLabel(chosen)}` : 'Pick a time'}
          </button>
        </>
      ) : null}

      {note ? <p className="cbv2-field5__err" role="alert">{note}</p> : null}
      {failed ? (
        <button type="button" className="cbv2-btn cbv2-btn--line" onClick={() => { setNote(''); setReload((n) => n + 1); }}>
          Try again
        </button>
      ) : null}
    </section>
  );
}

export default MeetingPicker;
