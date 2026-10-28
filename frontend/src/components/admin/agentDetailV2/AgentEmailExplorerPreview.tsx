import React, { useEffect, useState } from 'react';
import {
  getSummary, getShadow,
  type ExplorerSummary, type ExplorerDecisionRow,
} from '../../../services/explorerGrowthApi';

/**
 * Explorer Growth's shadow decisions, previewed on an agent's Email tab (Ali, 2026-10-27:
 * "Explorer growth is in shadow mode - these should be pulled into Maya's email").
 *
 * ── THESE ARE NOT HER DECISIONS, AND THE PANEL HAS TO SAY SO ────────────────
 *
 * `explorer_journey_decisions` rows carry NO agent attribution. Explorer Growth is Marketing's
 * capability; the rows were produced by it, not by any agent, and in production they were produced
 * by four manual runs rather than a nightly job. Rendering them under an agent's name without
 * saying this would manufacture an ownership the data does not support - the same class of mistake
 * as inventing behaviours for an agent that runs none. So the header states whose decisions these
 * are, and the staleness line states when they were made.
 *
 * ── IT CANNOT SEND, STRUCTURALLY RATHER THAN BY PROMISE ─────────────────────
 *
 * This component adds NO backend code. It calls two endpoints that already exist on the Explorer
 * Growth admin router, which registers fourteen GETs and zero mutating verbs - a property pinned
 * by `explorerGrowthRoutes.access.test.ts`, not by this file's good intentions. `getSummary` and
 * `getShadow` are SELECT-only in `explorerOverviewService.ts` and `explorerDecisionsService.ts`.
 * There is no new write path here to audit because there is no new path at all.
 *
 * ── THE 403 IS A REAL CASE, NOT A THEORETICAL ONE ───────────────────────────
 *
 * The Email tab's own route is `requireAgentManagerOrAdmin()`; the Explorer Growth router is
 * `requireAdmin`. So an agent MANAGER who is not an admin reaches this tab and is refused these
 * two calls. That is a different fact from "the panel is broken" and it renders differently -
 * otherwise a manager sees a red error on a page that is working exactly as designed.
 */

/** `getShadow` already excludes WAIT and executed rows, so this is the actionable, unsent set. */
const PREVIEW_ROWS = 10;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'failed' }
  | { kind: 'ready'; summary: ExplorerSummary; rows: ExplorerDecisionRow[]; total: number };

function daysSince(isoDay: string | null): number | null {
  if (!isoDay) return null;
  const then = Date.parse(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/** Central, like every other date this product shows a human. */
function fmtDay(isoDay: string | null): string {
  if (!isoDay) return 'never';
  const t = Date.parse(`${isoDay}T12:00:00Z`);
  if (Number.isNaN(t)) return isoDay;
  return new Date(t).toLocaleDateString('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function AgentEmailExplorerPreview({ agentName }: { agentName: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [summary, page] = await Promise.all([
          getSummary(),
          getShadow({ limit: PREVIEW_ROWS }),
        ]);
        if (!live) return;
        setState({ kind: 'ready', summary, rows: page.rows, total: page.total });
      } catch (err) {
        if (!live) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        setState({ kind: status === 403 ? 'forbidden' : 'failed' });
      }
    })();
    return () => { live = false; };
  }, []);

  if (state.kind === 'loading') {
    return <PanelShell><p className="text-muted small m-3">Loading Explorer Growth&hellip;</p></PanelShell>;
  }

  if (state.kind === 'forbidden') {
    return (
      <PanelShell>
        <p className="text-muted small m-3 mb-0">
          Explorer Growth is admin-only, and this account manages the agent without being an admin.
          Nothing is wrong with this agent or this page &mdash; the journey feed simply sits behind a
          wider permission than the Email tab does.
        </p>
      </PanelShell>
    );
  }

  if (state.kind === 'failed') {
    return (
      <PanelShell>
        <p className="text-danger small m-3 mb-0">
          Could not load the Explorer Growth feed. The rest of this tab is unaffected.
        </p>
      </PanelShell>
    );
  }

  const { summary, rows, total } = state;
  const age = daysSince(summary.decision_date);

  return (
    <PanelShell>
      <div className="px-3 pt-3">
        <p className="text-muted small mb-2">
          These are <strong>Explorer Growth&rsquo;s</strong> decisions, not {agentName}&rsquo;s work.
          The rows carry no agent attribution; they are shown here because this journey is the one
          {' '}{agentName} would act on. <strong>Nothing here has been sent</strong>, and nothing on
          this screen can send it.
        </p>

        <p className="small mb-3">
          <span className="badge bg-light text-muted border me-2">Run of {fmtDay(summary.decision_date)}</span>
          {age !== null && age > 7 && (
            <span className="badge bg-warning text-dark">
              {age} days old &mdash; this is the most recent run, not today&rsquo;s
            </span>
          )}
        </p>

        <div className="row g-2 mb-3">
          <Stat label="Decisions" value={summary.total} />
          <Stat label="Actionable" value={summary.actionable} />
          <Stat label="Waited" value={summary.waited} />
          <Stat label="With content" value={summary.with_content} />
          <Stat label="Content gaps" value={summary.gaps} />
          <Stat label="Executed" value={summary.executed} muted={summary.executed === 0} />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted small m-3 mb-0">
          No actionable, unsent decisions in this run.
        </p>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover table-sm mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Learner</th>
                <th>State</th>
                <th>Action</th>
                <th>Channel</th>
                <th>Marketing asset</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.email_normalized ?? <span className="text-muted">no address</span>}</td>
                  <td>{r.primary_state ?? '—'}</td>
                  <td><span className="badge bg-light text-dark border">{r.selected_action ?? '—'}</span></td>
                  <td>{r.channel ?? '—'}</td>
                  <td>
                    {r.asset_count > 0 ? (
                      <span>{r.asset_count} selected</span>
                    ) : (
                      <span className="badge bg-warning text-dark">No asset &mdash; gap</span>
                    )}
                  </td>
                  <td className="text-muted small">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-3 py-2 border-top small text-muted">
        Showing {rows.length} of {total}.{' '}
        <a href="/admin/explorer-growth?tab=shadow">Open Explorer Growth</a> for the full run, the
        per-decision reasoning, and the content library.
      </div>
    </PanelShell>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">
        Explorer Growth &mdash; what the journey decided
      </div>
      <div className="card-body p-0">{children}</div>
    </div>
  );
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="col-6 col-md-2">
      <div className="border rounded p-2 text-center h-100">
        <div className={`fs-5 fw-bold ${muted ? 'text-muted' : 'text-primary'}`}>{value}</div>
        <div className="text-muted" style={{ fontSize: 11 }}>{label}</div>
      </div>
    </div>
  );
}
