import React, { useCallback, useEffect, useState } from 'react';
import portalApi from '../../../utils/portalApi';
import JourneyNudgeCard, { type JourneyNudge } from '../../../components/portal/JourneyNudgeCard';

/**
 * The learner's journey nudges on the portal home (Growth Journey OS, Phase 5
 * T521 fix cycle 1). T514 mounted JourneyNudgeCard in PortalDashboardPage.tsx,
 * a page nothing routes to (`/portal/dashboard` redirects to `/portal/today`),
 * so the bundler dropped the page and no learner could ever have seen a nudge -
 * found on the live bundle by the production check, not by any test. This is
 * the card's one consumer now, at the top of the Today sidebar;
 * routes/__tests__/portalRoutes.journeyNudges.test.ts pins the chain from the
 * route to the card so the mount cannot drift back into a dead page.
 *
 * It reads `GET /api/portal/journey-nudges` on its own, outside the shell's
 * loadAll(): a failing read never blocks or breaks the page - the sidebar has
 * one fewer card, which is the right degraded state for an optional surface.
 * Dismiss drops the row locally first and then posts; a failed post is left
 * alone because the next load re-reads the truth. `load` and `dismiss` are
 * injectable so the test drives the component without mocking the shared
 * portal client (see TodayShell.planGate.test.tsx for why that is avoided).
 */

export const JOURNEY_NUDGES_PATH = '/api/portal/journey-nudges';

interface Props {
  load?: () => Promise<JourneyNudge[]>;
  dismiss?: (id: string) => Promise<unknown>;
}

/** The array the controller returns, or nothing at all for any other shape. */
export async function loadJourneyNudges(): Promise<JourneyNudge[]> {
  const res = await portalApi.get(JOURNEY_NUDGES_PATH);
  return Array.isArray(res.data) ? (res.data as JourneyNudge[]) : [];
}

export function dismissJourneyNudge(id: string): Promise<unknown> {
  return portalApi.post(`${JOURNEY_NUDGES_PATH}/${encodeURIComponent(id)}/dismiss`);
}

export default function TodayJourneyNudges({ load = loadJourneyNudges, dismiss = dismissJourneyNudge }: Props) {
  const [nudges, setNudges] = useState<JourneyNudge[]>([]);
  useEffect(() => {
    let alive = true;
    load()
      .then((rows) => { if (alive) setNudges(rows); })
      .catch(() => { if (alive) setNudges([]); });
    return () => { alive = false; };
  }, [load]);
  const onDismiss = useCallback((id: string) => {
    setNudges((prev) => prev.filter((n) => n.id !== id));
    dismiss(id).catch(() => {});
  }, [dismiss]);
  return <JourneyNudgeCard nudges={nudges} onDismiss={onDismiss} />;
}
