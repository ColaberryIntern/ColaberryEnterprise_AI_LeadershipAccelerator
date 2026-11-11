import React, { useEffect, useState } from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import {
  getAgentToolGovernance,
  type AgentToolGovernanceReport,
  type ToolGovernanceRow,
} from '../../../services/agentEffectiveAccessApi';
import { timeAgo } from '../shell/trust';
import { toolColors, toolLastUsed } from './agentDetailV2Correlation';

// Agent Tools section, Phase 1 (2026-11-11) — Ali: "I would like to add a tools section to the
// Agent dashboard which will facilitate the request, approval and access to the tools... when I
// look at Maya's account, I should see all the tools she has access to and it should be linked
// to the attributes in her profile."
//
// This is the READ half, and it is deliberately first. The request/approval spine already exists
// in the backend (agent_domain_change_requests kind='tool' through to agent_domain_tool_grants)
// and had never been surfaced; before wiring a request button into it, the dashboard has to be
// able to show the truth it would be writing into. Phase 2 adds filing from here.
//
// WHAT THIS WILL SHOW YOU TODAY, and why that is the point: on 2026-11-11
// `agent_domain_tool_grants` held 0 rows while 31 agents held 136 tools, so every agent reads as
// "held without a grant". That is not a rendering bug. It is the finding, and softening it here
// would make an ungoverned fleet look governed.
//
// Two sources, kept apart on screen as they are in the API: what the agent HOLDS (the runtime's
// tools_granted, which is what actually gets handed to the model) and what was GRANTED (the
// approval record, with the capability it serves). The existing "Tools & channels" panel under
// Performance & settings shows reads/produces; that stays, and this section answers the separate
// question of who authorized any of it.

interface Props {
  detail: AgentDetail;
}

function StateBadge({ row }: { row: ToolGovernanceRow }) {
  if (row.findings.length === 0) {
    return <span className="adv2-pill adv2-ok">governed</span>;
  }
  if (row.held && !row.granted) {
    return <span className="adv2-pill adv2-warn">no grant on record</span>;
  }
  if (row.granted && !row.held) {
    return <span className="adv2-pill adv2-warn">not in effect</span>;
  }
  return <span className="adv2-pill adv2-bad">needs attention</span>;
}

/** The capability a tool serves, which is the "attribute in her profile" half of the ask. */
function CapabilityLine({ row }: { row: ToolGovernanceRow }) {
  if (!row.capabilityId) {
    return (
      <span className="adv2-gap">
        No capability recorded, so this tool serves no stated purpose yet
      </span>
    );
  }
  if (!row.capabilityName) {
    return (
      <>
        Serves <code>{row.capabilityId}</code>{' '}
        <span className="adv2-gap">(no capability record matches that id)</span>
      </>
    );
  }
  return (
    <>
      Serves <strong>{row.capabilityName}</strong>
      {row.capabilityDomain && <> in {row.capabilityDomain}</>}{' '}
      <code style={{ fontSize: 11 }}>{row.capabilityId}</code>
      {row.capabilityRequiresThisTool === false && (
        <span className="adv2-pill adv2-bad" style={{ marginLeft: 8 }}>
          capability does not require this tool
        </span>
      )}
    </>
  );
}

export default function AgentToolsTab({ detail }: Props) {
  const agentId = detail.agent.id;
  const [report, setReport] = useState<AgentToolGovernanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAgentToolGovernance(agentId)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e) => {
        // Surfaced rather than swallowed: an empty section and a failed section look identical
        // otherwise, and this one is about trusting what is on screen.
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Could not load tool governance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const toolColor = toolColors(detail);
  const lastUsedAt = toolLastUsed(detail);

  if (loading) {
    return (
      <section className="adv2-card">
        <h2>Tools</h2>
        <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>Loading…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="adv2-card">
        <h2>Tools</h2>
        <p className="adv2-gap" style={{ padding: '0 18px 16px' }}>{error}</p>
      </section>
    );
  }

  if (!report) return null;

  const s = report.summary;

  return (
    <>
      <section className="adv2-card">
        <h2>
          Tools{' '}
          <span className="adv2-hint">
            {s.held} held, {s.granted} with a grant on record
          </span>
        </h2>
        <div className="adv2-body" style={{ paddingBottom: 14 }}>
          <p style={{ marginBottom: 12 }}>{report.posture}</p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.clean > 0 && <span className="adv2-pill adv2-ok">{s.clean} fully governed</span>}
            {s.heldWithoutGrant > 0 && (
              <span className="adv2-pill adv2-warn">{s.heldWithoutGrant} held without a grant</span>
            )}
            {s.grantedWithoutHolding > 0 && (
              <span className="adv2-pill adv2-warn">{s.grantedWithoutHolding} granted but not in effect</span>
            )}
            {s.capabilityMismatch > 0 && (
              <span className="adv2-pill adv2-bad">{s.capabilityMismatch} capability mismatch</span>
            )}
            {s.capabilityUnknown > 0 && (
              <span className="adv2-pill adv2-bad">{s.capabilityUnknown} unknown capability</span>
            )}
          </div>

          <p className="adv2-muted" style={{ marginTop: 12, fontSize: 12.5 }}>
            <strong>Held</strong> means the runtime will hand this tool to the model.{' '}
            <strong>Granted</strong> means someone approved it on the record and said which
            capability it serves. Those are different questions, so they are shown separately
            rather than merged.
          </p>
        </div>
      </section>

      <section className="adv2-card">
        <h2>Every tool, and who said it could</h2>
        {report.rows.length === 0 ? (
          <p className="adv2-muted" style={{ padding: '0 18px 16px' }}>
            This agent holds no tools, so there is nothing to govern yet.
          </p>
        ) : (
          report.rows.map((row) => (
            <div className="adv2-tool" key={row.toolName}>
              <div>
                <span className="adv2-dot" style={{ background: toolColor[row.toolName] }} />
                <code>{row.toolName}</code>
                <div style={{ marginTop: 6 }}>
                  <StateBadge row={row} />
                </div>
              </div>
              <div>
                <div className="adv2-what">
                  <CapabilityLine row={row} />
                </div>

                <div className="adv2-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {row.granted && row.approvedByIdentity ? (
                    <>
                      Approved by {row.approvedByIdentity}
                      {row.approvedAt && <> {timeAgo(row.approvedAt)}</>}
                    </>
                  ) : (
                    <>Nobody on record as having approved this</>
                  )}
                  {' · '}
                  Last used: {lastUsedAt[row.toolName] ? timeAgo(lastUsedAt[row.toolName] as string) : 'not recorded yet'}
                </div>

                {row.findings.map((f) => (
                  <div key={f} className="adv2-gap" style={{ fontSize: 12, marginTop: 4 }}>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </>
  );
}

