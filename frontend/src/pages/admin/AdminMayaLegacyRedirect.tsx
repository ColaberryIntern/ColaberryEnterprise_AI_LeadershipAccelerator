import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getMayaGoLive, mayaErrorMessage } from '../../services/mayaConsoleApi';

/**
 * `/admin/maya` and `/admin/outbound-approvals` used to be two standalone pages. On 2026-11-15
 * they were folded into the agent workspace, where an enable control, a Tools & access tab and an
 * email queue already existed. This is what the two old URLs do now.
 *
 * ── WHY A REDIRECT RATHER THAN A DELETION ───────────────────────────────────
 *
 * The house pattern for relocating a surface says to retire the old key and retarget every
 * inbound link rather than leave an alias. That rule is about TAB KEYS, which only this app
 * produces. A URL is different: it has been pasted into chat, opened in a browser and bookmarked
 * in the hours these pages existed, and a dead admin link teaches the reader that the feature was
 * removed rather than moved. The alias is therefore deliberate, and it is a redirect rather than
 * a second copy of the screen - there is still exactly one place the content lives.
 *
 * ── WHY IT HAS TO FETCH ─────────────────────────────────────────────────────
 *
 * The destination is `/admin/agents/:id`, and `ai_agents.id` is database-generated, so it differs
 * between local, dev and production. It cannot be a constant in this file. The go-live read
 * already returns her row, so one call resolves it; every other Maya lookup in the codebase
 * resolves by `agent_name` for the same reason.
 *
 * If the lookup fails, this falls back to the agent list rather than to a blank page: the reader
 * asked for an agent's workspace, and the list is the nearest honest answer.
 */
export default function AdminMayaLegacyRedirect({ tab }: { tab?: 'outbound' }): React.ReactElement {
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMayaGoLive()
      .then((r) => {
        if (cancelled) return;
        setTo(r.agent ? `/admin/agents/${r.agent.id}${tab ? `?tab=${tab}` : ''}` : '/admin/agents');
      })
      .catch((e) => {
        if (!cancelled) setError(mayaErrorMessage(e, 'Could not find her workspace.'));
      });
    return () => { cancelled = true; };
  }, [tab]);

  if (to) return <Navigate to={to} replace />;

  return (
    <div className="container py-4">
      <p className="text-muted">
        {error
          ? `${error} Her console now lives on her agent workspace.`
          : 'This page moved onto her agent workspace. Taking you there…'}
      </p>
      {error && <a className="btn btn-outline-primary btn-sm" href="/admin/agents">Open the agent list</a>}
    </div>
  );
}
