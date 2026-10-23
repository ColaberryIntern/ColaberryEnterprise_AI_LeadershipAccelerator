import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, EmptyState } from '../shell';
import {
  getOrganizationArtifacts,
  linkArtifactToOrganization,
  unlinkArtifactFromOrganization,
  describeApiError,
  AccountArtifactLink,
  ArtifactKind,
} from '../../../services/adminOrgApi';

/**
 * C8.5 — every artifact for this account, one click away.
 *
 * LINKS ONLY. Each row is a pointer to the one canonical copy, which lives in the
 * Basecamp vault under C0.3. Nothing is uploaded, stored or proxied here: the ticket
 * names "copying artifacts into the app and creating a second canonical location" as the
 * thing that would make this untrustworthy, so there is no file input on this card and
 * every link opens the canonical location directly.
 *
 * Its own component rather than another 200 lines inside a 535-line page, per the
 * module-size rule: the page gains one line and this stays readable in one sitting.
 */

const KINDS: Array<{ value: ArtifactKind; label: string }> = [
  { value: 'deck', label: 'Deck' },
  { value: 'research', label: 'Research' },
  { value: 'account_brief', label: 'Account brief' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'contract', label: 'Contract' },
  { value: 'pilot_outcome', label: 'Pilot outcome' },
  { value: 'case_study', label: 'Case study' },
];

const KIND_LABEL = (k: ArtifactKind) => KINDS.find((x) => x.value === k)?.label ?? k;

const EMPTY = { artifact_kind: 'proposal' as ArtifactKind, title: '', canonical_url: '' };

export default function AccountArtifactsCard({ organizationId }: { organizationId: string }) {
  const [links, setLinks] = useState<AccountArtifactLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      setLinks(await getOrganizationArtifacts(organizationId));
      setError(null);
    } catch (e) {
      // Degrade rather than break the page: the account is still worth reading without
      // its artifact list. Same posture as the cohort-options fetch on the parent page.
      setError(describeApiError(e, 'the linked artifacts'));
    } finally {
      setLoaded(true);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await linkArtifactToOrganization(organizationId, form);
      setForm(EMPTY);
      setError(null);
      await load();
    } catch (err) {
      // A 422 here is usually the C0.3 naming rule refusing a dated or versioned
      // filename, and its message says what to do. Surface it verbatim.
      setError(describeApiError(err, 'that artifact link'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (link: AccountArtifactLink) => {
    setBusy(true);
    try {
      await unlinkArtifactFromOrganization(organizationId, link.id);
      await load();
    } catch (err) {
      setError(describeApiError(err, 'that artifact link'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={`Artifacts (${links.length})`}
      icon="link"
      className="mt-4"
      padded={false}
    >
      <div className="px-3 pt-3">
        <p className="small text-muted mb-0" data-testid="artifacts-links-only-note">
          Links to the canonical copy. Nothing is stored here, so opening one always shows
          the current version.
        </p>
      </div>

      {error && (
        <div className="alert alert-warning mx-3 mt-3 mb-0 small" role="alert"
          data-testid="artifacts-error">
          {error}
        </div>
      )}

      {loaded && links.length === 0 && !error && (
        <div className="p-3">
          <EmptyState
            icon="link"
            title="No artifacts linked yet"
            description="Link the deck, brief, proposal or contract this account has already been sent."
          />
        </div>
      )}

      {links.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm align-middle mb-0" data-testid="artifacts-table">
            <thead>
              <tr>
                <th scope="col">Artifact</th>
                <th scope="col">Kind</th>
                <th scope="col">Linked</th>
                <th scope="col" className="text-end">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id} data-testid={`artifact-row-${l.id}`}>
                  <td>
                    <a href={l.canonicalUrl} target="_blank" rel="noreferrer"
                      className="fw-semibold">
                      {l.title}
                    </a>
                    {!l.naming.ok && (
                      // Shown, not hidden: the rule governs what we create, and an
                      // existing non-compliant name is evidence to act on.
                      <div className="small text-warning-emphasis mt-1"
                        data-testid={`artifact-naming-warning-${l.id}`}>
                        <i className="ri-error-warning-line" aria-hidden="true" />{' '}
                        {l.naming.reason}
                      </div>
                    )}
                  </td>
                  <td><span className="badge bg-light text-dark">{KIND_LABEL(l.artifactKind)}</span></td>
                  <td className="small text-muted">{l.linkedBy ?? 'unknown'}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary"
                      onClick={() => remove(l)} disabled={busy}>
                      Unlink
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="border-top p-3" onSubmit={submit}>
        <div className="row g-2 align-items-end">
          <div className="col-md-3">
            <label className="form-label small mb-1" htmlFor="artifact-kind">Kind</label>
            <select id="artifact-kind" className="form-select form-select-sm"
              value={form.artifact_kind}
              onChange={(e) => setForm({ ...form, artifact_kind: e.target.value as ArtifactKind })}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-1" htmlFor="artifact-title">Title</label>
            <input id="artifact-title" className="form-control form-control-sm"
              value={form.title} placeholder="Acme pilot proposal"
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="artifact-url">
              Canonical URL
            </label>
            <input id="artifact-url" className="form-control form-control-sm"
              value={form.canonical_url} placeholder="https://app.basecamp.com/..."
              onChange={(e) => setForm({ ...form, canonical_url: e.target.value })} />
          </div>
          <div className="col-md-2">
            <button type="submit" className="btn btn-sm btn-primary w-100"
              disabled={busy || !form.title.trim() || !form.canonical_url.trim()}>
              Link
            </button>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}
