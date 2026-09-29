import React from 'react';
import { AgentDetail } from '../../../services/agentDetailApi';
import { ManagerInboxItem } from '../../../services/managerInboxApi';
import { Tone } from '../shell/StatusBadge';
import { adv2PillClass } from './adv2PillTone';
import { deriveOperationalState, OperationalState } from '../../../utils/agentOperationalState';
import { deriveAttentionItems, AttentionSeverity } from '../../../utils/agentAttentionRequired';

// Agent Detail polish round 2 (2026-09-29) — Ali: "Remove tabs 'At a
// Glance' and 'Live Status'." A fresh research pass found 2 real pieces of
// content from Live Status with no other home anywhere on the page:
// Operational state (+ its real reason) and the evidenced Attention
// Required list. Folded here, verbatim (same markup, same derivation
// functions, same props Overview already receives — zero new fetch, zero
// duplicated logic). Deliberately NOT ported: Current Work (an honest
// static "not yet instrumented" placeholder, no real data to lose) and
// Recent Outcome + the 3-metric stat row (already duplicated elsewhere on
// Overview/Talk — see this run's own request.md for the full audit).

interface Props {
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  inboxLoading: boolean;
  inboxError: string | null;
}

const OPERATIONAL_STATE_TONE: Record<OperationalState, Tone> = {
  working: 'info',
  waiting: 'neutral',
  needs_approval: 'warning',
  blocked: 'danger',
  idle: 'neutral',
  paused: 'neutral',
  offline: 'danger',
  unknown: 'neutral',
};

const SEVERITY_TONE: Record<AttentionSeverity, Tone> = {
  high: 'danger',
  medium: 'warning',
  info: 'info',
  none: 'success',
};

const SEVERITY_LABEL: Record<AttentionSeverity, string> = {
  high: 'High',
  medium: 'Medium',
  info: 'Info',
  none: 'OK',
};

export default function AgentOverviewV2OperationalState({ detail, inboxItems, inboxLoading, inboxError }: Props) {
  const operationalState = deriveOperationalState(detail, inboxItems.length);
  const attentionItems = inboxLoading || inboxError ? [] : deriveAttentionItems(detail, inboxItems);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginBottom: 20 }}>
      <div className="adv2-card">
        <h2>
          Operational state <span className={adv2PillClass(OPERATIONAL_STATE_TONE[operationalState.state])}>{operationalState.label}</span>
        </h2>
        <p className="adv2-body adv2-muted" style={{ margin: 0 }}>{operationalState.reason}</p>
      </div>

      <div className="adv2-card">
        <h2>
          Attention Required
          <span className="adv2-hint">Every item cites the real evidence it's derived from.</span>
        </h2>
        {inboxLoading && <p className="adv2-body adv2-muted">Checking pending approvals…</p>}
        {inboxError && (
          <p className="adv2-body" style={{ color: 'var(--adv2-warn)' }}>
            Could not load pending approvals: {inboxError}. Everything below reflects what could be checked.
          </p>
        )}
        {!inboxLoading && !inboxError && attentionItems.map((item, i) => (
          <div key={i} className="adv2-task">
            <div>
              <span className={adv2PillClass(SEVERITY_TONE[item.severity])}>{SEVERITY_LABEL[item.severity]}</span>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{item.title}</div>
              <p className="adv2-muted" style={{ margin: '4px 0 0' }}>{item.body}</p>
              <p className="adv2-mono adv2-muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{item.evidence}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
