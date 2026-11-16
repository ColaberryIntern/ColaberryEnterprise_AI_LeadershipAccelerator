import { useCallback } from 'react';
import { setReminderApi, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import { reminderSetText } from './logic/recapCopy';
import { cora } from './useRoomLog';

/**
 * Career Prep v27 (CP4.5): a picked reminder card. "Tonight" is tied to the plan, "Same time tomorrow" to the
 * session just done; asking twice is one reminder on the server. Cora confirms with the real send time
 * (Central), which the server may have moved out of quiet hours.
 */
export function useReminder(plan: StoredPlan | null, sessionId: () => string | null, push: (...i: ChatItem[]) => void, setError: (e: string) => void): (kind: 'tonight' | 'tomorrow') => Promise<void> {
  return useCallback(async (kind: 'tonight' | 'tomorrow') => {
    const sid = sessionId();
    const ref = kind === 'tomorrow' && sid ? { sessionId: sid } : plan ? { planId: plan.id } : null;
    if (!ref) { push(cora('Pick a plan first, then I can remind you.')); return; }
    try { push(cora(reminderSetText((await setReminderApi(kind, ref)).sendAt))); } catch (e) {
      const tooLate = (e as { response?: { status?: number } })?.response?.status === 409;
      if (tooLate) push(cora('It is already past 6:00 PM. Pick "Same time tomorrow" instead.')); else setError('Could not set the reminder. Try again.');
    }
  }, [plan, sessionId, push, setError]);
}
