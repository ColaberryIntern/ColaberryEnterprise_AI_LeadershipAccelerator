import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/admin/shell';
import MayaCapabilityTable from '../../components/admin/maya/MayaCapabilityTable';
import MayaToolTable from '../../components/admin/maya/MayaToolTable';
import {
  getMayaGoLive, mayaErrorMessage, setMayaCapabilityState, setMayaEnabled,
  type MayaGoLiveReport, type MayaPromotionState,
} from '../../services/mayaConsoleApi';

/**
 * T14 - "/admin/maya", the go-live console. One screen that says whether Maya is on, what she may
 * do, which of her tools are granted, and what is waiting for a decision.
 *
 * ## Why the absence of this screen was the actual blocker
 *
 * Measured in production on 13 Nov 2026: her `ai_agents` row had `enabled=false`,
 * `maya_capability_promotions` held zero rows, and `agent_domain_tool_grants` held zero rows
 * across all 31 agents. None of that was a decision anybody made. The six facts that answer "is
 * she on" lived in six places, so answering it took six queries by hand, and the switch to change
 * any of them existed only as an API. A switch nobody can find never gets thrown.
 *
 * ## The one thing this page does NOT do
 *
 * It does not approve outbound messages. That is `/admin/outbound-approvals`, one message at a
 * time, and the link below is a link rather than an embedded list on purpose: a console that
 * showed the pending queue beside a "turn her on" button would invite settling both in one
 * glance, and a message is approved by reading it.
 *
 * ## Why a 403 here is not a failure
 *
 * Reading this page is open to any admin. Turning her ON, and widening any capability, is Ali's
 * or a super_admin's; turning her off and narrowing a capability is any admin's, because
 * silencing her must never wait on one person. The server decides that, and its refusal sentence
 * is shown verbatim, so this page cannot drift out of agreement with the real authority the way a
 * client-side role check would.
 */

const KILL_SWITCH_TEXT: Record<MayaGoLiveReport['kill_switch'], { tone: 'danger' | 'success'; text: string } | null> = {
  active: { tone: 'danger', text: 'The kill switch is ON. Maya refuses every capability regardless of the dials below.' },
  unreadable: { tone: 'danger', text: 'The kill switch could NOT be read. She fails closed, which means she refuses everything - the dials below are not what she is doing.' },
  clear: null,
};

export default function AdminMayaGoLivePage(): React.ReactElement {
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
      setError(mayaErrorMessage(e, 'Could not read Maya\'s state.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await setMayaEnabled(enabled, enableNote.trim());
      setNotice({
        ok: true,
        text: res.changed
          ? `Maya is now ${res.enabled ? 'enabled' : 'disabled'}.`
          : `Maya was already ${res.enabled ? 'enabled' : 'disabled'}. Nothing changed.`,
      });
      setEnableNote('');
      await load();
    } catch (e) {
      setNotice({ ok: false, text: mayaErrorMessage(e, 'That change was refused.') });
    } finally {
      setBusy(false);
    }
  }, [enableNote, load]);

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
      <div>
        <PageHeader title="Maya" icon="robot-line" subtitle="Loading her state..." />
      </div>
    );
  }

  const killSwitch = report ? KILL_SWITCH_TEXT[report.kill_switch] : null;
  const live = report?.capabilities.filter((c) => c.mode === 'live').length ?? 0;
  const held = report?.capabilities.filter((c) => c.mode === 'review').length ?? 0;
  const grantedTools = report?.tools.filter((t) => t.granted).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Maya"
        icon="robot-line"
        subtitle="One agent, two tool belts, one governance spine. Outbound is held for your approval."
        breadcrumb={[{ label: 'Admin', to: '/admin' }, { label: 'Maya' }]}
        actions={(
          <div className="d-flex gap-2">
            <Link className="btn btn-outline-primary btn-sm" to="/admin/outbound-approvals">
              Outbound approvals{report ? ` (${report.outbound.pending})` : ''}
            </Link>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void load()} disabled={loading}>
              <i className="ri-refresh-line" aria-hidden="true" /> Refresh
            </button>
          </div>
        )}
      />

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {killSwitch && (
        <div className={`alert alert-${killSwitch.tone}`} role="alert">
          <strong>Stop.</strong> {killSwitch.text}
        </div>
      )}
      {notice && (
        <div className={`alert ${notice.ok ? 'alert-success' : 'alert-warning'}`} role="status">{notice.text}</div>
      )}

      {report && (
        <>
          <div className="row g-3 mb-4">
            <div className="col-md-3">
              <StatCard label="Agent row" value={report.agent ? (report.agent.enabled ? 'enabled' : 'disabled') : 'missing'} />
            </div>
            <div className="col-md-3"><StatCard label="Capabilities live" value={String(live)} /></div>
            <div className="col-md-3"><StatCard label="Held for review" value={String(held)} /></div>
            <div className="col-md-3"><StatCard label="Tools granted" value={`${grantedTools} of ${report.tools.length}`} /></div>
          </div>

          <SectionCard
            title="Her agent row"
            icon="toggle-line"
            subtitle="The master switch. Turning her on is yours; turning her off is any admin's."
          >
            {!report.agent ? (
              <p className="text-danger mb-0">
                There is no <span className="font-monospace">ai_agents</span> row named Maya. Nothing
                on this page can be switched until the registry seed creates one.
              </p>
            ) : (
              <>
                <dl className="row small mb-3">
                  <dt className="col-sm-3">Enabled</dt>
                  <dd className="col-sm-9">
                    <StatusBadge label={report.agent.enabled ? 'enabled' : 'disabled'} tone={report.agent.enabled ? 'success' : 'neutral'} />
                  </dd>
                  <dt className="col-sm-3">Status</dt>
                  <dd className="col-sm-9">{report.agent.status}</dd>
                  <dt className="col-sm-3">Autonomy</dt>
                  <dd className="col-sm-9">
                    {report.agent.autonomy_level ?? 'not set'}
                    <span className="text-muted ms-2">
                      changed on its own screen, never as a side effect of this switch
                    </span>
                  </dd>
                </dl>
                <div className="d-flex gap-2 align-items-start flex-wrap">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    style={{ maxWidth: '26rem' }}
                    placeholder="Why (required)"
                    aria-label="Reason for changing Maya's agent row"
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
                      Turn Maya off
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || enableNote.trim().length < 3}
                      onClick={() => void toggleEnabled(true)}
                    >
                      Turn Maya on
                    </button>
                  )}
                </div>
              </>
            )}
          </SectionCard>

          <SectionCard
            title="What she may do"
            icon="shield-check-line"
            className="mt-4"
            subtitle="`Doing now` is what she will actually do. The dial is only one of the things that decides it."
          >
            <MayaCapabilityTable rows={report.capabilities} busy={busy} onSetState={(c, s, n) => void setState(c, s, n)} />
          </SectionCard>

          <SectionCard title="Her tools" icon="tools-line" className="mt-4" collapsible defaultOpen={false}
            subtitle="Both belts. A tool with no handler cannot be granted, and a granted tool still obeys its capability's mode."
          >
            <MayaToolTable rows={report.tools} />
          </SectionCard>

          <SectionCard
            title={`Open tool requests${report.grant_requests.length ? ` (${report.grant_requests.length})` : ''}`}
            icon="git-pull-request-line"
            className="mt-4"
            actions={<Link className="btn btn-outline-secondary btn-sm" to="/admin/tool-requests">Review them</Link>}
          >
            {report.grant_requests.length === 0 ? (
              <p className="text-muted mb-0">Nothing of hers is waiting for a grant decision.</p>
            ) : (
              <ul className="list-unstyled mb-0 small">
                {report.grant_requests.map((r) => (
                  <li key={r.id} className="mb-2">
                    <span className="font-monospace">{r.tool_name}</span>
                    <span className="text-muted ms-2">for {r.capability_id}</span>
                    <span className="text-muted ms-2">needed by {r.needed_by}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
