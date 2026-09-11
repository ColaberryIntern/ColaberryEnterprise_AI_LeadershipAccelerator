import React from 'react';
import { StatusBadge } from '../../../../components/admin/shell';
import type { ComposerAction, ConfirmationSummary } from '../../../../services/contentComposerApi';

/**
 * The final confirmation (spec 8.1 step 10). Pure: renders exactly what the server built.
 *
 * Every field the spec names has its own labelled block - brand, accounts, time (local AND
 * UTC, as two separate cells), copy, assets, links, approval status - so the test can find
 * each by its label and assert its VALUE. A block is never omitted when empty; it says what
 * is missing ("No tracked links", "No assets attached"), because an operator skimming a
 * confirmation reads absence as "nothing to worry about" and that is the one thing a missing
 * link or asset is not.
 *
 * The action buttons are enabled by the server's readiness verdict, and the reasons for any
 * refusal are printed next to them. A disabled button with no reason is a support ticket.
 */

export interface ComposerConfirmationProps {
  summary: ConfirmationSummary;
  busy: boolean;
  onAction: (action: ComposerAction) => void;
}

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="mb-3" data-testid={testId}>
      <div className="text-uppercase small fw-semibold text-muted mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function approvalTone(label: ConfirmationSummary['approval']['label']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (label === 'Approved') return 'success';
  if (label === 'Awaiting review') return 'warning';
  if (label === 'Rejected' || label === 'Changes requested' || label === 'Approval invalidated by a later edit') return 'danger';
  return 'neutral';
}

export default function ComposerConfirmation({ summary, busy, onAction }: ComposerConfirmationProps) {
  const { brand, campaign, accounts, schedule, copy, assets, links, linkGaps, approval, validation, readiness } = summary;

  return (
    <div className="composer-confirmation">
      <Field label="Brand" testId="confirm-brand">
        {brand ? (
          <>
            <strong>{brand.name}</strong>
            <span className="text-muted ms-2 small">
              {brand.timezone}{brand.timezoneSource === 'default' ? ' (platform default - the brand has no timezone set)' : ''}
            </span>
          </>
        ) : <span className="text-danger">No brand. The item cannot be published without one.</span>}
        {campaign && <div className="small text-muted">Campaign: {campaign.name}{campaign.slug ? ` (${campaign.slug})` : ' - no UTM slug'}</div>}
      </Field>

      <Field label="Accounts" testId="confirm-accounts">
        {accounts.length === 0 ? <span className="text-danger">No channels selected.</span> : (
          <ul className="list-unstyled mb-0">
            {accounts.map((a) => (
              <li key={a.provider} className="d-flex align-items-center gap-2 mb-1" data-testid={`confirm-account-${a.provider}`}>
                <span>{a.displayName}</span>
                <StatusBadge label={a.mode === 'direct' ? 'Direct publish' : 'Handoff required'} tone={a.mode === 'direct' ? 'success' : 'warning'} />
                <span className="small text-muted">Account: not connected</span>
                {a.reasons.length > 0 && <span className="small text-muted">- {a.reasons[0]}</span>}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Time" testId="confirm-time">
        {schedule ? (
          <div className="d-flex flex-wrap gap-4">
            <div data-testid="confirm-time-local">
              <div className="small text-muted">Brand local ({schedule.timezone})</div>
              <strong>{schedule.local.dayLabel}, {schedule.local.time} {schedule.local.zone}</strong>
              <span className="small text-muted ms-1">({schedule.local.offset})</span>
            </div>
            <div data-testid="confirm-time-utc">
              <div className="small text-muted">UTC</div>
              <strong>{schedule.utcLabel}</strong>
            </div>
            {!schedule.differsFromUtc && <div className="small text-muted align-self-end">This brand publishes in UTC.</div>}
          </div>
        ) : <span>No time set - this will publish now or stay a draft, depending on the action.</span>}
      </Field>

      <Field label="Copy" testId="confirm-copy">
        {copy.length === 0 ? <span className="text-danger">No variants generated.</span> : copy.map((c) => (
          <div key={c.provider} className="border rounded p-2 mb-2" data-testid={`confirm-copy-${c.provider}`}>
            <div className="d-flex align-items-center gap-2 small text-muted mb-1">
              <span>{accounts.find((a) => a.provider === c.provider)?.displayName ?? c.provider}</span>
              <span>{c.chars} chars</span>
              <StatusBadge label={c.source === 'edited' ? 'Edited by hand' : 'Generated'} tone={c.source === 'edited' ? 'info' : 'neutral'} />
              {c.stale && <StatusBadge label="Stale - canonical changed since this edit" tone="warning" />}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{c.text}</div>
          </div>
        ))}
      </Field>

      <Field label="Assets" testId="confirm-assets">
        {assets.length === 0 ? <span>No assets attached.</span> : (
          <ul className="mb-0">
            {assets.map((a) => (
              <li key={a.id}>
                {a.filename ?? a.id} <span className="text-muted small">({a.mimeType})</span>
                {a.altText ? <span className="text-muted small"> - alt: {a.altText}</span> : <span className="text-warning small"> - no alt text</span>}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Links" testId="confirm-links">
        {links.length === 0 ? <span className="text-warning">No tracked links. Clicks on this post will not be attributed.</span> : (
          <ul className="mb-1">
            {links.map((l) => (
              <li key={l.provider} data-testid={`confirm-link-${l.provider}`}>
                <code>{l.shortUrl}</code> <span className="text-muted small">→ {l.finalUrl}</span>
              </li>
            ))}
          </ul>
        )}
        {linkGaps.length > 0 && links.length > 0 && (
          <div className="small text-warning">No link for: {linkGaps.join(', ')}</div>
        )}
      </Field>

      <Field label="Approval status" testId="confirm-approval">
        <StatusBadge label={approval.label} tone={approvalTone(approval.label)} />
        {approval.request?.decided_by && <span className="small text-muted ms-2">by {approval.request.decided_by}</span>}
        <span className="small text-muted ms-2">Item status: {approval.itemStatus.replace(/_/g, ' ')}</span>
      </Field>

      <Field label="Validation" testId="confirm-validation">
        {!validation.ran ? <span className="text-warning">Not run for this revision.</span>
          : validation.ok ? <span className="text-success">Passed on every platform.</span>
            : (
              <ul className="mb-0 text-danger">
                {validation.blockers.map((b, i) => <li key={`${b.provider}-${b.field}-${i}`}>{b.message}</li>)}
              </ul>
            )}
      </Field>

      <div className="d-flex flex-wrap gap-2 align-items-center mt-3" data-testid="confirm-actions">
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy || !readiness.canSaveDraft} onClick={() => onAction('save_draft')}>Save draft</button>
        <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !readiness.canSendForApproval} onClick={() => onAction('send_for_approval')}>Send for approval</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !readiness.canSchedule} onClick={() => onAction('schedule')}>Schedule</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={busy || !readiness.canPublishNow} onClick={() => onAction('publish_now')}>Publish now</button>
      </div>
      {readiness.reasons.length > 0 && (
        <ul className="small text-muted mt-2 mb-0" data-testid="confirm-reasons">
          {readiness.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
