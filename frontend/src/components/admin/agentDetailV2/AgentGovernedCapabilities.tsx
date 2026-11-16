import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MayaCapabilityTable from '../maya/MayaCapabilityTable';
import MayaToolTable from '../maya/MayaToolTable';
import {
  getMayaGoLive, mayaErrorMessage, setMayaCapabilityState, setMayaEnabled,
  type MayaGoLiveReport, type MayaPromotionState,
} from '../../../services/mayaConsoleApi';

/**
 * The governed-capability section of "Tools & access", for the agents in
 * GOVERNED_OUTBOUND_AGENTS.
 *
 * ── RELOCATED, NOT REWRITTEN (2026-11-15) ───────────────────────────────────
 *
 * This shipped on 2026-11-15 as the standalone page `/admin/maya`, which duplicated this very
 * tab and the workspace's own enable control. Ali, the same day: "I'm curious as to why you
 * didn't integrate into the current agent system". The page's three real sections - the agent
 * row switch, the capability dial, her tool belt - are moved here verbatim, and the page's own
 * link to the outbound queue is gone because that queue is now a tab on this same workspace.
 * `AdminMayaGoLivePage.tsx` no longer exists.
 *
 * ── WHY THIS IS A SECTION AND NOT AN EIGHTH TAB ─────────────────────────────
 *
 * Tools & access already answers "what may this agent do, and who said so". A capability dial is
 * the same question with a different noun. Splitting them would mean a reader has to know which
 * of two tabs holds the switch that is actually stopping a message.
 *
 * ── TWO VOCABULARIES SIT SIDE BY SIDE HERE, AND THEY ARE NOT THE SAME THING ──
 *
 * The section above this one lists TOOLS against `agent_domain` capability ids
 * (`admissions.maya_applicant_chat_response` and friends), which come from a database table and
 * say who approved a grant. The dial below lists CAPABILITIES from a frozen compile-time map
 * (`mayaToolGovernance.ts`) and says what mode each one resolves to. A tool can be granted while
 * its capability is `off`, and then it does nothing. Conflating them would read as one list with
 * two kinds of row.
 *
 * ── THE SCOPE MISMATCH, STATED RATHER THAN HIDDEN ───────────────────────────
 *
 * This is a PER-AGENT page and the dial's backing store is not per-agent: the promotion record
 * is a single `system_settings` row under one key with no agent dimension, and the kill switch
 * and the M29 flags are process-wide. Today that is invisible because exactly one agent has a
 * capability map. It would stop being invisible the moment a second one did, so the surface says
 * so instead of letting the page's own layout imply otherwise.
 */

const KILL_SWITCH_TEXT: Record<MayaGoLiveReport['kill_switch'], { tone: 'danger' | 'success'; text: string } | null> = {
  active: { tone: 'danger', text: 'The kill switch is ON. Every capability is refused regardless of the dials below.' },
  unreadable: { tone: 'danger', text: 'The kill switch could NOT be read. She fails closed, which means she refuses everything - the dials below are not what she is doing.' },
  clear: null,
};

export default function AgentGovernedCapabilities({ agentName }: { agentName: string }): React.ReactElement | null {
  const [report, setReport] = useState<MayaGoLiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [enableNote, setEnableNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getMayaGoLive());
      setError(null);
    } catch (e) {
      setError(mayaErrorMessage(e, `Could not read ${agentName}'s governed state.`));
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => { void load(); }, [load]);

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await setMayaEnabled(enabled, enableNote.trim());
      setNotice({
        ok: true,
        text: res.changed
          ? `${agentName} is now ${res.enabled ? 'enabled' : 'disabled'}.`
          : `${agentName} was already ${res.enabled ? 'enabled' : 'disabled'}. Nothing changed.`,
      });
      setEnableNote('');
      await load();
    } catch (e) {
      setNotice({ ok: false, text: mayaErrorMessage(e, 'That change was refused.') });
    } finally {
      setBusy(false);
    }
  }, [enableNote, load, agentName]);

  const setState = useCallback(async (capability: string, state: MayaPromotionState, note: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await setMayaCapabilityState(capability, state, note);
      setNotice({
        ok: true,
        text: res.changed ? `${capability} is now ${res.state}.` : `${capability} was already ${res.state}.`,
      });
      await load();
    } catch (e) {
      setNotice({ ok: false, text: mayaErrorMessage(e, 'That change was refused.') });
    } finally {
      setBusy(false);
    }
  }, [load]);

  if (loading && !report) {
    return (
      <section className="adv2-card">
        <h2>What she may do</h2>
        <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="adv2-card">
        <h2>What she may do</h2>
        <p className="adv2-gap" style={{ padding: '0 18px 16px' }}>{error}</p>
      </section>
    );
  }

  if (!report) return null;

  const killSwitch = KILL_SWITCH_TEXT[report.kill_switch];

  return (
    <section className="adv2-card">
      <h2>What she may do</h2>
      <div style={{ padding: '0 18px 18px' }}>
        <p className="adv2-muted" style={{ marginTop: 0 }}>
          <strong>Doing now</strong> is what she will actually do. The dial is only one of the
          things that decides it: the kill switch, a refusal by name, and the shipped default all
          come first. These settings are <strong>global, not per-agent</strong> - the promotion
          record is one row with no agent column - and they are shown here because she is the only
          agent that has a capability map today.
        </p>

        {killSwitch && (
          <div className={`alert alert-${killSwitch.tone}`} role="alert">
            <strong>Stop.</strong> {killSwitch.text}
          </div>
        )}
        {notice && (
          <div className={`alert ${notice.ok ? 'alert-success' : 'alert-warning'}`} role="status">{notice.text}</div>
        )}

        {/* The count, and deliberately NOT the messages. This section can say how many are
            waiting; it cannot show one, because a message is approved by reading it and that
            happens on the Outbound approvals tab. Named rather than linked: it is a sibling tab
            on this same page, and a link would navigate away from a page the reader is on. */}
        <p className="small mb-3">
          <strong>{report.outbound.pending}</strong>
          {report.outbound.pending === 1 ? ' message is' : ' messages are'} waiting for a decision
          on the <strong>Outbound approvals</strong> tab.
        </p>

        <h3 className="h6 mt-3">Her agent row</h3>
        {!report.agent ? (
          <p className="text-danger mb-0">
            There is no <span className="font-monospace">ai_agents</span> row named {agentName}.
            Nothing here can be switched until the registry seed creates one.
          </p>
        ) : (
          <>
            <p className="small text-muted mb-2">
              Turning her on is Ali&rsquo;s or a super_admin&rsquo;s; turning her off is any
              admin&rsquo;s, because silencing her must never wait on one person. This switch
              writes <span className="font-monospace">enabled</span> and nothing else - it never
              changes her autonomy level, which is a separate decision with its own control in the
              banner at the top of this page.
            </p>
            <div className="d-flex gap-2 align-items-start flex-wrap">
              <input
                type="text"
                className="form-control form-control-sm"
                style={{ maxWidth: '26rem' }}
                placeholder="Why (required)"
                aria-label={`Reason for changing ${agentName}'s agent row`}
                maxLength={500}
                value={enableNote}
                onChange={(e) => setEnableNote(e.target.value)}
              />
              {report.agent.enabled ? (
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  disabled={busy || enableNote.trim().length < 3}
                  onClick={() => void toggleEnabled(false)}
                >
                  Turn {agentName} off
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || enableNote.trim().length < 3}
                  onClick={() => void toggleEnabled(true)}
                >
                  Turn {agentName} on
                </button>
              )}
            </div>
          </>
        )}

        <h3 className="h6 mt-4">Capabilities</h3>
        <MayaCapabilityTable rows={report.capabilities} busy={busy} onSetState={(c, s, n) => void setState(c, s, n)} />

        <h3 className="h6 mt-4">Her tool belt</h3>
        <p className="small text-muted mb-2">
          Both belts. A tool with no handler cannot be granted, and a granted tool still obeys its
          capability&rsquo;s mode.
        </p>
        <MayaToolTable rows={report.tools} />

        {report.grant_requests.length > 0 && (
          <>
            <h3 className="h6 mt-4">Open tool requests ({report.grant_requests.length})</h3>
            <ul className="list-unstyled mb-2 small">
              {report.grant_requests.map((r) => (
                <li key={r.id} className="mb-2">
                  <span className="font-monospace">{r.tool_name}</span>
                  <span className="text-muted ms-2">for {r.capability_id}</span>
                  <span className="text-muted ms-2">needed by {r.needed_by}</span>
                </li>
              ))}
            </ul>
            <Link className="btn btn-outline-secondary btn-sm" to="/admin/tool-requests">Review them</Link>
          </>
        )}
      </div>
    </section>
  );
}
