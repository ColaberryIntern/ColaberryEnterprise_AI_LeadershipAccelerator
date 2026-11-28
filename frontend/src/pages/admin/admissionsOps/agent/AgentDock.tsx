import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { newRequestId, postIntent } from '../../../../services/admissionsOpsApi';
import { AGENT_NAME } from '../agentConfig';
import { screenHref, type ScreenId } from '../screens';
import { actionById, manifestFor, useAgentRegistry } from './agentSurface';

/**
 * The agent dock (AO2.3, kit AGENT_CONTROL_SURFACE.md section 2.1), on every screen except Ask AURA. Release 1 runs in
 * Answer mode: the agent changes nothing on the screen, and no agent is connected yet, so the instruction box says so
 * rather than pretending. The three suggestions come from the current screen's manifest; choosing one records a
 * navigate intent (one audit row) and then moves the screen. Navigation never waits on the log: if recording fails,
 * the person still gets where they asked to go.
 */
export default function AgentDock({ screenId }: { screenId: ScreenId }): React.ReactElement | null {
  const navigate = useNavigate();
  // The live manifest once the screen has registered; until then (first paint, static render) its static one.
  const manifest = useAgentRegistry().find((m) => m.id === screenId) ?? manifestFor(screenId);
  if (screenId === 'agent') return null;
  const suggestions = manifest?.suggestions ?? [];

  const go = (actionId: string) => {
    const target = actionById(actionId);
    if (!target) return;
    postIntent({ request_id: newRequestId(), type: 'navigate', screen: screenId, action: actionId }).catch(() => undefined);
    navigate(screenHref(target.screen));
  };

  return (
    <section className="ops-dock" aria-label={`${AGENT_NAME}, the built-in agent`} data-testid="ops-dock">
      <div className="ops-dock-status">
        <span className="ops-dot ops-dot-ok" aria-hidden="true" />
        <strong>{AGENT_NAME}</strong>
        <span className="ops-dock-mode" data-testid="ops-dock-mode">Answer mode</span>
        <span className="ops-dock-sees">sees this screen</span>
      </div>
      <label className="ops-dock-ask">
        <span className="visually-hidden">Tell {AGENT_NAME} what to do or where to take you</span>
        <input type="text" className="form-control" disabled placeholder={`${AGENT_NAME} is not connected yet. It will answer here once it is plugged in.`}
          data-testid="ops-dock-input" />
      </label>
      <div className="ops-dock-suggestions">
        {suggestions.map((s) => (
          <button key={s.action} type="button" className="ops-dock-suggestion" onClick={() => go(s.action)} data-testid={`ops-dock-suggest-${s.action}`}>
            {s.label}
          </button>
        ))}
        <Link to={screenHref('agent')} className="ops-dock-open">Open {AGENT_NAME}</Link>
      </div>
    </section>
  );
}
