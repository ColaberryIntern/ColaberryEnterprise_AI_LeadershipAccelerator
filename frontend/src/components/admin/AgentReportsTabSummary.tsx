import React, { useEffect, useState } from 'react';
import { AgentDetail } from '../../services/agentDetailApi';
import { ManagerInboxItem } from '../../services/managerInboxApi';
import { getTicketSummary } from '../../services/ticketSummaryApi';
import type { TabKey } from './agentDetailV2/AgentDetailV2Header';

// Agent Detail polish round 5 (2026-09-30) — Ali, live: "Performance &
// Settings / Results & Reports section needs to be redesigned and
// rebuilt." New top-of-page summary, extracted as its own file rather than
// grown into AgentReportsTab.tsx (already 258 lines with its own real,
// extensive Subscriptions+Delivery-History functionality — kept fully
// untouched below this card, per Ali's own standing "don't drop real
// functionality" rule).
//
// Real "Verified resolution" stat: detail.verified_resolution_count /
// detail.owned_ticket_count_all_time, backed by
// countVerifiedResolutionsForAgent()'s honest evidence+success gate — a
// genuinely NEW real capability this round, not available when Track A2
// (2026-09-22) rejected the mockup's identical-looking stat for having no
// real backing at the time. "Human handoff acknowledged" and "Evidence
// confidence" are NOT built here — confirmed again this round, independently,
// that no real concept for either exists anywhere in this codebase.
//
// Real "manager briefing" card: exceptions from the real inboxItems (the
// same ManagerInboxItem[] already fetched for Overview's Needs Ali and the
// Decisions tab — zero new fetch), real owned-work count
// (detail.tickets.filter(status_bucket !== null), the same derivation
// AgentOverviewV2Metrics.tsx already uses), and a real "verified result"
// line only when a real most_recent_verified_ticket_id exists.
//
// "Discuss this report" drafts a real, report-specific message and hands
// it to the Talk composer via onDraftTalkText (a separate, simpler draft
// path from the Work tab's own onDraftTalk(ticket) — this card has no
// single ticket to reference, just aggregate real numbers) — never
// auto-sent, same as every other draft-to-Talk control on this page.

interface Props {
  detail: AgentDetail;
  inboxItems: ManagerInboxItem[];
  onDraftTalkText: (text: string) => void;
  onNavigate: (tab: TabKey) => void;
}

export default function AgentReportsTabSummary({ detail, inboxItems, onDraftTalkText, onNavigate }: Props) {
  const { verified_resolution_count: verified, owned_ticket_count_all_time: owned, most_recent_verified_ticket_id: mostRecentVerifiedTicketId } = detail;
  const pct = owned > 0 ? Math.round((verified / owned) * 100) : 0;
  const ownedWorkCount = detail.tickets.filter((t) => t.status_bucket !== null).length;
  const exceptionCount = inboxItems.length;

  const [verifiedResultLine, setVerifiedResultLine] = useState<string | null>(null);
  useEffect(() => {
    if (!mostRecentVerifiedTicketId) { setVerifiedResultLine(null); return; }
    let cancelled = false;
    getTicketSummary(mostRecentVerifiedTicketId)
      .then((summary) => { if (!cancelled) setVerifiedResultLine(summary.outcome); })
      .catch(() => { if (!cancelled) setVerifiedResultLine(null); });
    return () => { cancelled = true; };
  }, [mostRecentVerifiedTicketId]);

  const handleDiscuss = () => {
    const parts = [
      `Can you walk me through this period's report?`,
      exceptionCount > 0
        ? `${exceptionCount} item${exceptionCount === 1 ? '' : 's'} need my decision.`
        : `Nothing needs my decision right now.`,
      `You're currently carrying ${ownedWorkCount} owned case${ownedWorkCount === 1 ? '' : 's'}, with ${verified} of ${owned} owned cases verified.`,
    ];
    onDraftTalkText(parts.join(' '));
    onNavigate('talk');
  };

  return (
    <div className="adv2-grid">
      <section className="adv2-card">
        <h2>Outcomes, not just messages</h2>
        <div className="adv2-body">
          <div className="d-flex justify-content-between align-items-baseline mb-1">
            <span>Verified resolution</span>
            <strong>{verified} / {owned}</strong>
          </div>
          <div className="progress" style={{ height: 6 }}>
            <div className="progress-bar" role="progressbar" style={{ width: `${pct}%` }} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
          </div>
          <p className="adv2-muted" style={{ marginTop: 10, fontSize: 12.5 }}>
            {pct}% — owned cases with a real, evidence-backed successful outcome, not just a closed status.
          </p>
        </div>
      </section>

      <section className="adv2-card">
        <h2>{detail.identity?.display_name || detail.agent.agent_name}&apos;s manager briefing</h2>
        <div className="adv2-body">
          <dl className="adv2-rows adv2-rows-narrow">
            <dt>Today&apos;s exceptions</dt>
            <dd>{exceptionCount > 0 ? `${exceptionCount} item${exceptionCount === 1 ? '' : 's'} need${exceptionCount === 1 ? 's' : ''} your decision.` : 'Nothing needs your decision right now.'}</dd>
            <dt>Work still owned</dt>
            <dd>{ownedWorkCount} owned case{ownedWorkCount === 1 ? '' : 's'}.</dd>
            {verifiedResultLine && (
              <>
                <dt>Verified result</dt>
                <dd>{verifiedResultLine}</dd>
              </>
            )}
          </dl>
          <button type="button" className="adv2-btn" style={{ marginTop: 12 }} onClick={handleDiscuss}>Discuss this report</button>
        </div>
      </section>
    </div>
  );
}
