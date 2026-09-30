import React from 'react';
import { AccountPanel, BillingDetailPanel } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDate, fmtMoney } from './primitives';

const ACCOUNT_LABEL: Record<AccountPanel['accountType'], string> = {
  organisation_owner: 'Business account owner',
  organisation_member: 'Seated in a business account',
  sponsor_contact: 'Sponsor contact',
  individual: 'Individual',
};

const ACCOUNT_TONE: Record<AccountPanel['accountType'], string> = {
  organisation_owner: 'primary',
  organisation_member: 'info',
  sponsor_contact: 'success',
  individual: 'secondary',
};

/**
 * Who this person is commercially, and what they pay.
 *
 * ── THE FAILURE BANNER IS THE POINT OF THIS TAB ─────────────────────────────
 *
 * The audit that produced it found a live student carrying 13 failed
 * subscription rows against one active subscription, with nothing anywhere in
 * the admin surface showing it. In a subscription business that is the single
 * most actionable fact about a person, so it is rendered first, in red, above
 * everything else — not as a row in a table someone has to scan for.
 */
export default function AccountTab({ account, billing }: {
  account: AccountPanel | null | undefined;
  billing: BillingDetailPanel | null | undefined;
}) {
  if (!account && !billing) {
    return <EmptyPanel>No commercial record for this person.</EmptyPanel>;
  }

  const atRisk = billing && billing.failuresSinceLastSuccess >= 2;

  return (
    <>
      {atRisk && (
        <div className="alert alert-danger d-flex align-items-start gap-2 mb-4">
          <i className="ri-error-warning-line mt-1" />
          <div>
            <strong>
              {billing!.failuresSinceLastSuccess} consecutive failed payments since the last successful one.
            </strong>
            <div className="small mt-1">
              This person is at risk of lapsing for a billing reason rather than a learning one.
              {billing!.activeCount > 0
                ? ' They still hold an active subscription, so the failures are collection attempts, not a cancellation.'
                : ' They hold no active subscription.'}
            </div>
          </div>
        </div>
      )}

      {account && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Account</span>
            <span className={`badge bg-${ACCOUNT_TONE[account.accountType]}-subtle text-${ACCOUNT_TONE[account.accountType]}-emphasis`}>
              {ACCOUNT_LABEL[account.accountType]}
            </span>
          </div>
          <div className="card-body">
            {account.owns.length > 0 && (
              <div className="mb-3">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Organisations they own
                </div>
                {account.owns.map((o) => (
                  <div key={o.id} className="border rounded p-3 mb-2">
                    <div className="fw-medium">{o.name ?? 'Unnamed organisation'}</div>
                    <div className="text-muted small">
                      {o.organizationType ?? 'organisation'} · {o.status ?? 'no status'} ·{' '}
                      {o.memberCount} {o.memberCount === 1 ? 'member' : 'members'} ·
                      {' '}created {fmtDate(o.createdAt) ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {account.memberOf.length > 0 && (
              <div className="mb-3">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Organisations they belong to
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr><th>Organisation</th><th>Role</th><th>Team</th><th>Invite</th><th>Joined</th></tr>
                    </thead>
                    <tbody>
                      {account.memberOf.map((m) => (
                        <tr key={m.orgId}>
                          <td className="fw-medium">{m.orgName ?? 'Unnamed'}</td>
                          <td className="small">{m.role ?? '—'}</td>
                          <td className="small text-muted">{m.team ?? '—'}</td>
                          <td>
                            <span className={`badge bg-${m.inviteStatus === 'accepted' ? 'success' : 'warning'}-subtle text-${m.inviteStatus === 'accepted' ? 'success' : 'warning'}-emphasis`}>
                              {m.inviteStatus ?? 'unknown'}
                            </span>
                          </td>
                          <td className="small text-muted">{fmtDate(m.joinedAt) ?? 'not joined'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {account.sponsor && (
              <div className="mb-3">
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Sponsor
                </div>
                <div className="border rounded p-3">
                  <div className="fw-medium">{account.sponsor.companyName ?? 'Unnamed sponsor'}</div>
                  <div className="text-muted small">Billing: {account.sponsor.billingStatus ?? 'unknown'}</div>
                </div>
              </div>
            )}

            {account.tenantContext.length > 0 && (
              <div>
                <div className="text-muted text-uppercase mb-2" style={{ letterSpacing: '.05em', fontSize: '.68rem' }}>
                  Acquired under
                </div>
                {account.tenantContext.map((t, i) => (
                  <div key={`${t.tenantName}-${i}`} className="small text-muted">
                    <strong className="text-body">{t.tenantName ?? 'Unknown brand'}</strong>
                    {t.relationshipType && ` · ${t.relationshipType}`}
                    {t.firstTouchAt && ` · first touch ${fmtDate(t.firstTouchAt)}`}
                    {t.lastTouchAt && ` · last touch ${fmtDate(t.lastTouchAt)}`}
                  </div>
                ))}
              </div>
            )}

            {account.accountType === 'individual'
              && account.tenantContext.length === 0 && (
              <EmptyPanel>
                An individual account. They neither own nor occupy a seat in a business account.
              </EmptyPanel>
            )}
          </div>
        </div>
      )}

      {billing && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Subscription history</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <Stat label="Active" value={billing.activeCount} tone={billing.activeCount > 0 ? 'success' : undefined} />
              <Stat label="Failed" value={billing.failedCount} tone={billing.failedCount > 0 ? 'danger' : undefined} />
              <Stat label="Cancelled" value={billing.canceledCount} />
              <Stat
                label="Renews"
                value={fmtDate(billing.currentPeriodEnd)}
                hint={billing.currentPeriodEnd ? undefined : 'no active period'}
              />
            </div>

            {(billing.creditsCents > 0 || billing.refundsCents > 0) && (
              <p className="text-muted small">
                {billing.creditsCents > 0 && <>Credits: <strong>{fmtMoney(billing.creditsCents)}</strong>. </>}
                {billing.refundsCents > 0 && <>Refunds: <strong>{fmtMoney(billing.refundsCents)}</strong>.</>}
              </p>
            )}

            {billing.lastReminder && (
              <p className="text-muted small">
                Last renewal reminder: {billing.lastReminder.kind ?? 'reminder'} ·{' '}
                {billing.lastReminder.status ?? 'unknown'}
                {billing.lastReminder.sentAt && ` · sent ${fmtDate(billing.lastReminder.sentAt)}`}
              </p>
            )}

            {billing.subscriptions.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Plan</th><th>Status</th><th className="text-end">Amount</th>
                      <th>Started</th><th>Period end</th><th>PaySimple</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.plan ?? <span className="text-muted">—</span>}</td>
                        <td>
                          <span className={`badge bg-${
                            s.status === 'active' ? 'success' : s.status === 'failed' ? 'danger' : 'secondary'
                          }-subtle text-${
                            s.status === 'active' ? 'success' : s.status === 'failed' ? 'danger' : 'secondary'
                          }-emphasis`}>
                            {s.status ?? 'unknown'}
                          </span>
                          {s.cancelReason && <div className="text-muted" style={{ fontSize: '.7rem' }}>{s.cancelReason}</div>}
                        </td>
                        <td className="text-end">{fmtMoney(s.amountCents) ?? '—'}</td>
                        <td className="small text-muted">{fmtDate(s.startedAt) ?? '—'}</td>
                        <td className="small text-muted">{fmtDate(s.currentPeriodEnd) ?? '—'}</td>
                        <td className="small text-muted">
                          {s.hasPaysimpleCustomer
                            ? <i className="ri-check-line text-success" title="linked to PaySimple" />
                            : <span title="no PaySimple customer on this row">not linked</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyPanel>No subscription has ever been recorded for this person.</EmptyPanel>
            )}

            <p className="text-muted small mb-0 mt-3">
              These rows are subscription STATE. The individual charges live in PaySimple and are
              not joined, so a failed row proves a collection attempt failed — it does not tell you
              how much has actually been collected.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
