import React, { useCallback, useEffect, useRef, useState } from 'react';
import { searchStudioStaff, type StudioStaff } from '../../../services/studioSetupApi';

/**
 * Pick a presenter or a producer by typing their name.
 *
 * ## What it replaces, and why that was wrong
 *
 * Both fields were a bare text box whose placeholder read "Enrollment id of whoever is
 * teaching". Nobody knows their colleagues' enrollment ids; the only way to fill it was to go
 * and look one up in a database, which meant the screen asked for something it already knew.
 * Ali's instruction on 2026-11-11: "I should be able to start typing and their names pop up".
 *
 * ## It holds the id and shows the name
 *
 * The value this control owns is still the enrollment id - that is what the API stores and what
 * the producer check reads. The name is only ever a label. Keeping those apart is what lets a
 * saved config render as "Ali Muwwakkil" on reload instead of a uuid, without the stored value
 * ever becoming a name that could go stale when somebody changes theirs.
 *
 * ## The two states that are easy to merge and must not be
 *
 * An empty result for a typed query ("nobody called that") is a different fact from a failed
 * request ("the lookup is not answering"), and they lead to different actions: check the
 * spelling, versus try again or tell somebody. A single "no results" line would quietly turn an
 * outage into a reassuring sentence about this person not existing.
 */

export interface StaffPickerProps {
  id: string;
  label: string;
  /** The enrollment id currently chosen, or '' for nobody. */
  value: string;
  onChange: (enrollmentId: string) => void;
  /** Shown under the field. The caller owns the rule; this just renders the words. */
  problem?: string;
  /** Injected in tests. Production hits the admin staff route. */
  search?: (q: string) => Promise<StudioStaff[]>;
}

export default function StaffPicker(
  { id, label, value, onChange, problem, search }: StaffPickerProps,
): React.ReactElement {
  const run = search ?? searchStudioStaff;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StudioStaff[]>([]);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<StudioStaff | null>(null);

  /**
   * Debounced, because this fires on every keystroke and the route is a database search. 200ms
   * is below the point a person notices a delay and above the rate at which typing a name
   * would otherwise open a request per character.
   */
  const timer = useRef<number | null>(null);
  const seq = useRef(0);

  const lookup = useCallback((q: string) => {
    const mine = seq.current + 1;
    seq.current = mine;
    run(q)
      .then((list) => {
        // Drop a slow answer for an earlier query: without this, typing "al" then "ali" can
        // paint the "al" results last and show a list that does not match the box.
        if (seq.current !== mine) return;
        setRows(list);
        setFailed(false);
      })
      .catch(() => { if (seq.current === mine) { setRows([]); setFailed(true); } });
  }, [run]);

  useEffect(() => {
    if (!open) return undefined;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => lookup(query), 200);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query, open, lookup]);

  /**
   * Resolve a stored id back to a name on load.
   *
   * Without this a saved class reopens showing a uuid, which is the same unreadable thing the
   * old text box showed and would make the control look broken rather than filled in.
   */
  useEffect(() => {
    if (!value) { setChosen(null); return; }
    if (chosen && chosen.enrollment_id === value) return;
    run('')
      .then((list) => {
        const hit = list.find((s) => s.enrollment_id === value);
        if (hit) setChosen(hit);
      })
      .catch(() => undefined);
  }, [value, chosen, run]);

  const pick = (s: StudioStaff) => {
    setChosen(s);
    onChange(s.enrollment_id);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    setChosen(null);
    onChange('');
    setQuery('');
  };

  return (
    <div className="cls-field cls-picker" data-testid={`picker-${id}`}>
      <label className="cls-label" htmlFor={`cls-${id}`}>{label}</label>

      {value && chosen ? (
        <div className="cls-picked" data-testid={`picked-${id}`}>
          <span className="cls-picked-name">{chosen.name}</span>
          <span className="cls-picked-email">{chosen.email}</span>
          <button
            type="button"
            className="cls-picked-clear"
            onClick={clear}
            data-testid={`clear-${id}`}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            id={`cls-${id}`}
            className="cls-input"
            value={query}
            autoComplete="off"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Start typing a name"
            data-testid={`search-${id}`}
          />
          {open && (
            <ul className="cls-options" data-testid={`options-${id}`}>
              {rows.map((s) => (
                <li key={s.enrollment_id}>
                  <button
                    type="button"
                    className="cls-option"
                    onClick={() => pick(s)}
                    data-testid={`option-${s.enrollment_id}`}
                  >
                    <span className="cls-option-name">{s.name}</span>
                    <span className="cls-option-email">{s.email}</span>
                  </button>
                </li>
              ))}
              {/*
                * Three distinct empty states. "Nobody called that" is a fact about the search;
                * "the lookup is not answering" is a fact about the system, and showing the
                * first when the second is true turns an outage into a reassuring sentence.
                */}
              {rows.length === 0 && failed && (
                <li className="cls-option-empty" data-testid={`failed-${id}`}>
                  The staff list is not answering. Try again in a moment.
                </li>
              )}
              {rows.length === 0 && !failed && query.trim() !== '' && (
                <li className="cls-option-empty" data-testid={`none-${id}`}>
                  No staff match that. Only people with the staff role can run a class.
                </li>
              )}
            </ul>
          )}
        </>
      )}

      {problem && <p className="cls-note cls-note-error" role="alert">{problem}</p>}
    </div>
  );
}
