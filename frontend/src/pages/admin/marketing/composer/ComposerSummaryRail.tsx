import React from 'react';
import type { ConfirmationSummary, ItemMedia } from '../../../../services/contentComposerApi';
import { formatCentral } from '../centralTime';

/**
 * ComposerSummaryRail - "This post", beside every step.
 *
 * The question it answers is the one that used to require scrolling back to step 1 from step 4:
 * which brand is this, which campaign, which account does it go out from, is there a tracked
 * link, has it been validated, has anyone approved it. Four of those are decided in one step and
 * matter in another, which is exactly the kind of fact a form should not make you go and find.
 *
 * It states, and never acts. The buttons stay in Confirm, where the server's readiness verdict
 * decides what is enabled - two places offering to publish would eventually disagree about
 * whether you can.
 */

export interface ComposerSummaryRailProps {
  summary: ConfirmationSummary | null;
  media: ItemMedia[];
  /** The draft has not been saved yet; almost nothing is known. */
  empty: boolean;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="d-flex justify-content-between gap-2 small py-1 border-bottom">
      <span className="text-muted text-nowrap">{label}</span>
      <span className="text-end" style={{ minWidth: 0, wordBreak: 'break-word' }}>{children}</span>
    </div>
  );
}

const MISSING = <span className="text-muted fst-italic">not set</span>;

export default function ComposerSummaryRail({ summary, media, empty }: ComposerSummaryRailProps) {
  if (empty || !summary) {
    return (
      <div className="border rounded p-3 bg-white" data-testid="composer-summary">
        <div className="fw-semibold small mb-2">This post</div>
        <p className="small text-muted mb-0">
          Nothing is saved yet. Fill in Setup and save, and this panel will track what the post is,
          where it goes, and whether it is ready.
        </p>
      </div>
    );
  }

  const directAccounts = summary.accounts.filter((a) => a.mode === 'direct');
  const missingAccount = directAccounts.filter((a) => !a.account);
  const validation = summary.validation;

  return (
    <div className="border rounded p-3 bg-white" data-testid="composer-summary">
      <div className="fw-semibold small mb-2">This post</div>

      <Row label="Brand">{summary.brand ? summary.brand.name : <span className="text-danger">none</span>}</Row>
      <Row label="Campaign">{summary.campaign ? summary.campaign.name : MISSING}</Row>
      <Row label="Type">{summary.item.contentType}</Row>
      <Row label="Networks">
        {summary.accounts.length === 0 ? MISSING : summary.accounts.map((a) => a.displayName).join(', ')}
      </Row>
      <Row label="Posting as">
        {directAccounts.length === 0
          ? <span className="text-muted">by hand (handoff)</span>
          : missingAccount.length > 0
            // The failure Ali hit on his first real post: the right brand, no account on it.
            ? <span className="text-danger" data-testid="summary-account-missing">no account connected</span>
            : directAccounts.map((a) => a.account?.displayName).filter(Boolean).join(', ')}
      </Row>
      <Row label="Media">{media.length === 0 ? <span className="text-muted">none</span> : `${media.length} attached`}</Row>
      <Row label="Tracked link">
        {summary.links.length > 0
          ? <code className="small">{summary.links[0].shortUrl.replace(/^https?:\/\//, '')}</code>
          : MISSING}
      </Row>
      <Row label="Goes out">
        {summary.schedule ? formatCentral(summary.schedule.utc) : <span className="text-muted">not scheduled</span>}
      </Row>
      <Row label="Validated">
        {!validation.ran
          ? <span className="text-muted">not run</span>
          : validation.ok
            ? <span className="text-success">passed</span>
            : <span className="text-danger">{validation.blockerCount} blocker{validation.blockerCount === 1 ? '' : 's'}</span>}
      </Row>
      <div className="d-flex justify-content-between gap-2 small py-1">
        <span className="text-muted">Approval</span>
        <span className="text-end">{summary.approval.label}</span>
      </div>
    </div>
  );
}
