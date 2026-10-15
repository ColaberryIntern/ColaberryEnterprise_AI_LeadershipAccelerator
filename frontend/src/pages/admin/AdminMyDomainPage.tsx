import React, { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import {
  fetchMyDomains, errorMessage,
  type MyDomainsResponse, type AgentDomainRow,
} from '../../services/agentDomainApi';

/**
 * "My Domain" — the landing an intern or a domain manager sees after bridging into the admin
 * portal, showing the domain THEY own.
 *
 * ## What this page must not do
 *
 * It must not imply progress. The ten domain projects are provisioned PLANS: 503 stories exist,
 * none is started, no capability is confirmed and no build is authorized. A page that renders
 * "503 stories" in a large number next to a progress bar would read as work underway, which is
 * the single most misleading thing this surface could say. So the verified count and the
 * authorization count sit beside the story count, always, and the backend's own `disclosure`
 * sentence is rendered verbatim rather than paraphrased into something softer.
 *
 * ## Every figure comes from the API
 *
 * There is no hardcoded domain name, story count or release count anywhere in this file, and a
 * test asserts that by reading the source. The numbers moved twice during this build (448 to 503
 * stories; six-of-ten to seven-of-ten reachable managers), and both times the stale copy was in
 * prose that nobody re-derived.
 *
 * ## Empty is a real answer
 *
 * A caller who owns no domain gets an empty list and the API's stated reason. That is rendered as
 * the reason, not as an error and not as a spinner that never resolves -- the three states (loading,
 * failed, owns-nothing) are kept distinct because collapsing them is how "it is broken" and "it is
 * not yours" become indistinguishable.
 */
export default function AdminMyDomainPage() {
  const [data, setData] = useState<MyDomainsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchMyDomains()
      .then((r) => { if (live) { setData(r); setLoading(false); } })
      .catch((e) => {
        if (!live) return;
        setError(errorMessage(e, 'Could not load your domain.'));
        setLoading(false);
      });
    return () => { live = false; };
  }, []);

  return (
    <>
      <PageHeader title="My Domain" />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading your domain…
          </div>
        </SectionCard>
      )}

      {/* A failure says so. It is never rendered as an empty state. */}
      {!loading && error && (
        <SectionCard>
          <div className="alert alert-danger mb-0" role="alert">
            <div className="fw-semibold">Could not load your domain</div>
            <div className="small">{error}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && data && (
        <>
          {data.domains.length === 0 && (
            <SectionCard title="No domain is assigned to you">
              {/* The API's own explanation, so "empty" is never mistaken for "broken". */}
              <p className="text-muted small mb-0">{data.note}</p>
              <p className="text-muted small mb-0 mt-2">
                Signed in as <code>{data.caller_email}</code>.
              </p>
            </SectionCard>
          )}

          {data.domains.length > 0 && (
            <>
              <SectionCard title="What this is">
                {/* Rendered verbatim from the API. Do not paraphrase this into something softer. */}
                <p className="mb-0" style={{ color: 'var(--color-text)' }}>{data.summary.disclosure}</p>
              </SectionCard>

              {data.domains.map((d) => <DomainCard key={d.domain_key} d={d} />)}
            </>
          )}
        </>
      )}
    </>
  );
}

function DomainCard({ d }: { d: AgentDomainRow }) {
  return (
    <SectionCard title={d.domain_key}>
      <div className="row g-3">
        <Stat label="Releases" value={d.releases} />
        <Stat label="Stories" value={d.stories} />
        {/* Beside the story count, always. 503 stories with 0 verified is the honest pair. */}
        <Stat label="Stories verified" value={d.stories_verified} muted={d.stories_verified === 0} />
        <Stat
          label="Build authorizations"
          value={d.build_authorizations}
          muted={d.build_authorizations === 0}
        />
      </div>

      <hr className="my-3" />

      <dl className="row mb-0 small">
        <dt className="col-sm-4 text-muted fw-normal">Lifecycle stage</dt>
        <dd className="col-sm-8">
          {d.stage ?? <span className="text-danger">no lifecycle row</span>}
        </dd>

        <dt className="col-sm-4 text-muted fw-normal">Accountable manager</dt>
        <dd className="col-sm-8">
          {d.manager_email ?? '—'}
          {d.manager_can_reach === false && (
            <span className="badge ms-2" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
              cannot reach the admin surface
            </span>
          )}
        </dd>

        {d.manager_blocker && (
          <>
            <dt className="col-sm-4 text-muted fw-normal">Blocker</dt>
            <dd className="col-sm-8 text-muted">{d.manager_blocker}</dd>
          </>
        )}

        <dt className="col-sm-4 text-muted fw-normal">Agent</dt>
        <dd className="col-sm-8">
          {d.agent_id
            ? <code>{d.agent_id}</code>
            : <span className="text-muted">none built yet</span>}
        </dd>
      </dl>
    </SectionCard>
  );
}

/** A figure with its label. `muted` is for a deliberate zero, so it does not read as a win. */
function Stat({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="col-6 col-md-3">
      <div
        className="fs-4 fw-bold"
        style={{ color: muted ? 'var(--color-muted)' : 'var(--color-primary)' }}
      >
        {value}
      </div>
      <div className="text-muted small">{label}</div>
    </div>
  );
}
