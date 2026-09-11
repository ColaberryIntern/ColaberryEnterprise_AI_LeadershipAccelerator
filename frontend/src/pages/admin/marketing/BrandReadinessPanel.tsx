import React from 'react';
import type {
  Brand,
  BrandSendReadiness,
  DnsCheckStatus,
  ScopeMode,
} from '../../../services/adminBrandApi';

/**
 * BrandReadinessPanel — the presentational half of the brand admin page.
 *
 * Split from the page's data fetching on purpose. Every state this thing can be in is then a
 * prop combination rather than a mocked network condition, which is what makes the four
 * distinct empty states testable at all.
 *
 * THE DISTINCTION THIS PANEL EXISTS TO PRESERVE. `DnsCheckStatus` is
 * `'unknown' | 'pass' | 'fail'` — three states, and **`unknown` is not `fail`**. A panel that
 * renders an unrun SPF check as a red cross tells an operator their DNS is broken when the
 * truth is that nobody has looked yet. Those two facts lead to completely different next
 * actions: one is "fix your DNS", the other is "run the check". Collapsing them is the same
 * failure as rendering an uncomputable revenue as $0, one subsystem over.
 *
 * FOUR EMPTY STATES, DELIBERATELY DISTINCT:
 *
 *   loading         — a request is in flight; nothing is known yet
 *   load-failed     — the request failed; what is on screen may be stale or absent
 *   empty           — the request succeeded and this operator can see no brands
 *   none-configured — brands exist, but this one has no domains or sender profiles yet
 *
 * A single "No data" panel would cover all four and answer none of them. The third and fourth
 * are especially worth separating: "you have no brands" is a permissions question, while
 * "this brand has nothing set up" is a setup task.
 */

export interface BrandReadinessPanelProps {
  loading: boolean;
  /** Non-null when the last request failed. The message is shown, not swallowed. */
  error: string | null;
  brands: Brand[];
  /** Which scope the server applied — turns "no brands" into an explicable answer. */
  scopeMode: ScopeMode | null;
  selectedBrandId: string | null;
  readiness: BrandSendReadiness | null;
  readinessLoading: boolean;
  onSelectBrand: (brandId: string) => void;
  onRetry: () => void;
}

/** Presentation for a three-state DNS check. `unknown` is its own thing, never a failure. */
function dnsPresentation(status: DnsCheckStatus): { label: string; className: string; title: string } {
  switch (status) {
    case 'pass':
      return { label: 'Pass', className: 'text-success fw-semibold', title: 'Record found and valid' };
    case 'fail':
      return { label: 'Fail', className: 'text-danger fw-semibold', title: 'Record missing or invalid' };
    default:
      return {
        label: 'Not checked',
        className: 'text-muted fst-italic',
        title: 'This check has not run yet. That is not a failure - nothing has looked.',
      };
  }
}

function EmptyState({ icon, title, body, action }: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-5 px-3" data-testid="empty-state">
      <i className={`ri-${icon} d-block mb-2`} style={{ fontSize: '1.75rem' }} aria-hidden="true" />
      <div className="fw-semibold mb-1">{title}</div>
      <div className="small text-muted mb-3" style={{ maxWidth: 460, margin: '0 auto' }}>{body}</div>
      {action}
    </div>
  );
}

export default function BrandReadinessPanel(props: BrandReadinessPanelProps) {
  const {
    loading, error, brands, scopeMode, selectedBrandId, readiness, readinessLoading,
    onSelectBrand, onRetry,
  } = props;

  // 1. LOADING — nothing is known yet. Distinct from "nothing exists".
  if (loading) {
    return (
      <EmptyState
        icon="loader-4-line"
        title="Loading brands"
        body="Fetching the brands you can administer."
      />
    );
  }

  // 2. LOAD FAILED — say so, and say what it means for what is on screen. A failed fetch that
  //    renders as "no brands" teaches an operator that their brands were deleted.
  if (error) {
    return (
      <EmptyState
        icon="error-warning-line"
        title="Could not load brands"
        body={`${error} Nothing below is current. This is a failure to reach the server, not a statement that you have no brands.`}
        action={
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={onRetry}>
            Try again
          </button>
        }
      />
    );
  }

  // 3. EMPTY — the request SUCCEEDED and there is genuinely nothing in scope. The scope mode
  //    is what turns this from a shrug into an answer.
  if (brands.length === 0) {
    return (
      <EmptyState
        icon="price-tag-3-line"
        title="No brands in your scope"
        body={
          scopeMode === 'denied'
            ? 'Your account has no tenant membership, so no brands are visible. This is a permissions result, not an empty system.'
            : 'The request succeeded and returned no brands. Either none exist yet, or none belong to the tenants you administer.'
        }
      />
    );
  }

  const selected = brands.find((b) => b.id === selectedBrandId) ?? null;

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-4">
        <ul className="list-group">
          {brands.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${b.id === selectedBrandId ? 'active' : ''}`}
                onClick={() => onSelectBrand(b.id)}
              >
                <span>
                  <span className="fw-medium">{b.name}</span>
                  <span className="small d-block text-muted">{b.slug}</span>
                </span>
                {b.status !== 'active' && <span className="badge bg-secondary">{b.status}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="col-12 col-lg-8">
        {readinessLoading && (
          <EmptyState icon="loader-4-line" title="Loading readiness" body={`Checking send readiness for ${selected?.name ?? 'this brand'}.`} />
        )}

        {/* 4. NONE CONFIGURED — a brand exists but has nothing set up. A setup task, not an
            error and not an absence of brands. */}
        {!readinessLoading && readiness && readiness.domains.length === 0 && readiness.profiles.length === 0 && (
          <EmptyState
            icon="settings-3-line"
            title="Nothing configured for this brand yet"
            body={`${selected?.name ?? 'This brand'} has no sending domains and no sender profiles. Until at least one domain is verified, this brand cannot send.`}
          />
        )}

        {!readinessLoading && readiness && (readiness.domains.length > 0 || readiness.profiles.length > 0) && (
          <>
            <div className="table-responsive mb-4">
              <table className="table table-sm mb-0" style={{ fontSize: '0.85rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Domain</th><th>Purpose</th><th>Verification</th>
                    <th>SPF</th><th>DKIM</th><th>DMARC</th><th>Last checked</th>
                  </tr>
                </thead>
                <tbody>
                  {readiness.domains.map((d) => {
                    const spf = dnsPresentation(d.spf_status);
                    const dkim = dnsPresentation(d.dkim_status);
                    const dmarc = dnsPresentation(d.dmarc_status);
                    return (
                      <tr key={d.id}>
                        <td className="fw-medium">{d.hostname}{d.is_primary && <span className="badge bg-light text-dark ms-1">primary</span>}</td>
                        <td className="text-muted">{d.purpose}</td>
                        <td className={d.verification_status === 'verified' ? 'text-success' : d.verification_status === 'failed' ? 'text-danger' : 'text-muted fst-italic'}>
                          {d.verification_status}
                        </td>
                        <td className={spf.className} title={spf.title}>{spf.label}</td>
                        <td className={dkim.className} title={dkim.title}>{dkim.label}</td>
                        <td className={dmarc.className} title={dmarc.title}>{dmarc.label}</td>
                        {/* Never "never" as a stand-in for a missing timestamp - if it has not
                            been checked, say that rather than implying a check returned nothing. */}
                        <td className="text-muted">{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : 'Not checked'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {readiness.profiles.map(({ profile, preflight }) => (
              <div key={profile.id} className="border rounded p-3 mb-2">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <span className="fw-medium">{profile.from_name || profile.name}</span>
                    <span className="small text-muted d-block">{profile.from_email}</span>
                  </div>
                  <span className={`badge ${preflight.ok ? 'bg-success' : 'bg-warning text-dark'}`}>
                    {preflight.ok ? 'Ready to send' : 'Not ready'}
                  </span>
                </div>
                {/* EVERY failed check is listed, not just the first. Fixing one at a time and
                    re-running is how a deliverability problem takes a week. */}
                {preflight.failures.length > 0 && (
                  <ul className="small text-muted mb-0 ps-3">
                    {preflight.failures.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
