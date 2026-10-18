import { useEffect, useState } from 'react';
import { fetchStaffDesks, StaffDesk } from './campusPeopleApi';

export interface StaffDesksState { staffDesks: StaffDesk[]; staffDesksError: boolean }

/**
 * The AI staff desks (Colaberry Campus C5), read ONCE per campus session and only while the campus is active: nothing
 * is requested with the campus off. A failure hides the desks (staffDesksError) and never blocks the map.
 */
export function useStaffDesks(active: boolean): StaffDesksState {
  const [state, setState] = useState<StaffDesksState>({ staffDesks: [], staffDesksError: false });
  useEffect(() => {
    if (!active) { setState({ staffDesks: [], staffDesksError: false }); return undefined; }
    let alive = true;
    fetchStaffDesks()
      .then((staffDesks) => { if (alive) setState({ staffDesks, staffDesksError: false }); })
      // Hidden, not shown as an error: the server logs the failure with error_class (campus_staff_desks_failed).
      .catch(() => { if (alive) setState({ staffDesks: [], staffDesksError: true }); });
    return () => { alive = false; };
  }, [active]);
  return state;
}
