import React, { useEffect, useState } from 'react';
import { PageHeader, SectionCard } from '../../components/admin/shell';
// The same chip the project delivery rows use, so a link on this screen looks and behaves like a
// link on the Accelerator screen: new tab, nothing rendered when there is no destination.
import LinkChip from './components/projectDelivery/LinkChip';
import {
  fetchProvisionedDomains, errorMessage,
  type AgentDomainRow, type AgentDomainSummary,
} from '../../services/agentDomainApi';

/**
 * "All Domains" — every provisioned agent-domain project on one screen, for the people
 * accountable for the programme rather than for one domain.
 *
 * ## Why this page exists
 *
 * `GET /api/admin/agent-domains-provisioned` has returned all ten, read from the database, since
 * AF2.4. It had a typed client function, `fetchProvisionedDomains`, and ZERO consumers: the only
 * references anywhere were its own definition and a jest mock. The data, the route, the section
 * gate and the client were all built and nothing rendered them, so the only way to see the ten
 * together was to call the API by hand.
 *
 * ## The sibling page is not this page, and must not become it
 *
 * `/admin/my-domain` answers "what do I own" and is scoped by identity, so a full admin opening it
 * sees two domains, not ten. That scoping is a feature and the AF2.1 ticket names breaking it as a
 * failure mode, because showing every domain on the intern's own landing page would leak every
 * other intern's scope. This page is the other question, asked by someone who holds `program`.
 * Section access decides whether you may ask; ownership decides what `-mine` gives back.
 *
 * ## A table, deliberately, where My Domain uses cards
 *
 * One domain is a card because there is nothing to compare it against. Ten domains are a table
 * because the entire reason to look at them together is to see which one is behind, which manager
 * cannot reach the surface, and which has no lifecycle row. A column of ten cards would make that
 * comparison require scrolling and memory.
 *
 * ## It must not imply progress
 *
 * The same rule that governs My Domain governs this page, and it matters more here because a
 * programme-wide total is exactly the number somebody would quote. 503 stories exist, none is
 * started, no capability is confirmed and no build is authorized. So the verified count and the
 * authorization count sit beside the story count in every row AND in the totals, a zero is muted
 * rather than styled as a figure, and the backend's own `disclosure` sentence is rendered verbatim
 * rather than paraphrased into something softer.
 *
 * ## Every figure comes from the API
 *
 * No domain name, story count or release count is written into this file, and a test asserts that
 * by reading this source. The counts have moved twice already during this initiative, and both
 * times the stale copy was in prose nobody re-derived.
 */
export default function AdminAllDomainsPage() {
  const [data, setData] = useState<{ summary: AgentDomainSummary; domains: AgentDomainRow[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchProvisionedDomains()
      .then((r) => { if (live) { setData(r); setLoading(false); } })
      .catch((e) => {
        if (!live) return;
        setError(errorMessage(e, 'Could not load the domain projects.'));
        setLoading(false);
      });
    return () => { live = false; };
  }, []);

  return (
    <>
      <PageHeader title="All Domains" />

      {loading && (
        <SectionCard>
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Loading the domain projects…
          </div>
        </SectionCard>
      )}

      {/* A failure says so. It is never rendered as an empty table, which would read as
          "there are no domains" -- the one thing that is certainly false. */}
      {!loading && error && (
        <SectionCard>
          <div className="alert alert-danger mb-0" role="alert">
            <div className="fw-semibold">Could not load the domain projects</div>
            <div className="small">{error}</div>
          </div>
        </SectionCard>
      )}

      {!loading && !error && data && (
        <>
          <SectionCard title="What this is">
            {/* Verbatim from the API. Do not paraphrase this into something softer. */}
            <p className="mb-0" style={{ color: 'var(--color-text)' }}>{data.summary.disclosure}</p>
          </SectionCard>

          <SectionCard title="Across every domain">
            <div className="row g-3">
              <Stat label="Domains" value={data.summary.domains} />
              <Stat label="Releases" value={data.summary.releases} />
              <Stat label="Stories" value={data.summary.stories} />
              {/* Beside the story count, always. A large story count with zero verified is the
                  honest pair, and splitting them across two cards is how it stops being one. */}
              <Stat
                label="Stories verified"
                value={data.summary.stories_verified}
                muted={data.summary.stories_verified === 0}
              />
              <Stat
                label="Build authorizations"
                value={data.summary.build_authorizations}
                muted={data.summary.build_authorizations === 0}
              />
              <Stat
                label="Managers blocked"
                value={data.summary.managers_blocked}
                warn={data.summary.managers_blocked > 0}
              />
              <Stat
                label="Missing lifecycle row"
                value={data.summary.missing_lifecycle_row}
                warn={data.summary.missing_lifecycle_row > 0}
              />
            </div>
          </SectionCard>

          <SectionCard title="Every domain project">
            {data.domains.length === 0 ? (
              // Distinct from the error state above. An empty list here means the table was
              // queried and held nothing, which is a finding about provisioning, not a failure.
              <p className="text-muted small mb-0">
                The query ran and returned no domain projects. Nothing has been provisioned.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th scope="col">Domain</th>
                      <th scope="col">Stage</th>
                      <th scope="col">Accountable manager</th>
                      <th scope="col">Intern building it</th>
                      <th scope="col" className="text-end">Releases</th>
                      <th scope="col" className="text-end">Stories</th>
                      <th scope="col" className="text-end">Verified</th>
                      <th scope="col" className="text-end">Authorized</th>
                      <th scope="col">Agent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.domains.map((d) => <DomainRow key={d.domain_key} d={d} />)}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </>
  );
}

/**
 * AF12.16 — the three places a domain row leads, each in its own tab.
 *
 * Ali, 21 Nov 2026: *"I need to see each domain mapped to the project it is associated with, so I
 * can drill down just like in projects and intern project section. Also I need a link to see it
 * from the interns perspective. I also need a link to their Agents admin screen. Open up in
 * another tab."*
 *
 * Two of the three were already in the payload and simply never rendered: `student_project_id`
 * and `agent_id`. The third is the one that could not be a link, and the reason is written into
 * the registry: the builder is a NAME, held deliberately without a foreign key to an enrollment.
 * So the intern chip goes to the roster pre-searched for that name and a human picks the row,
 * rather than this screen guessing which person a name means. A wrong guess there would open
 * somebody else's portal, which is the failure AF2.6 was an entire ticket about.
 */
function RowLinks({ d }: { d: AgentDomainRow }) {
  return (
    <span className="ms-1 text-nowrap">
      <LinkChip
        href={`/admin/accelerator?project=${encodeURIComponent(d.student_project_id)}`}
        icon="ri-folder-open-line"
        label="the build project"
        accent
      />
      <LinkChip
        href={d.agent_id ? `/admin/agents/${encodeURIComponent(d.agent_id)}` : null}
        icon="ri-robot-2-line"
        label="the agent's admin screen"
      />
      <LinkChip
        href={d.intended_builder
          ? `/admin/students?search=${encodeURIComponent(d.intended_builder)}`
          : null}
        icon="ri-user-search-line"
        label={`the roster, searched for ${d.intended_builder ?? 'the builder'}`}
      />
    </span>
  );
}

/** The planning state of the build, which is not the same question as who the builder is. */
function BuilderState({ state }: { state: string | null }) {
  if (state === 'verified_active') return null;
  const label = state === 'onboarding_pending' ? 'onboarding' : (state ?? 'unknown');
  return (
    <span
      className="badge ms-2"
      style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
    >
      {label}
    </span>
  );
}

/**
 * AF12.16 — the builder's management layer, read from their own grant.
 *
 * Ali signed in as Quincy and several other interns on 21 Nov and reported that none of them had
 * a door to the management screen. All seven have one. What hid it was the read-only view-as
 * rule, which withholds employee tools on purpose, so impersonating a builder is the single
 * method guaranteed not to show their admin access.
 *
 * So the access is reported HERE instead, where it can be read without becoming anybody: the
 * management role they hold and the exact sections their admin session is scoped to, which are
 * the same values `mgmtBridgeService` mints the token from.
 */
function BuilderMgmt({ d }: { d: AgentDomainRow }) {
  if (!d.intended_builder) return null;
  if (d.intended_builder_name_is_ambiguous) {
    return (
      <div className="text-muted small mt-1">
        More than one member carries this name, so their access was not resolved rather than
        guessed.
      </div>
    );
  }
  if (!d.intended_builder_mgmt_role) {
    return (
      <div className="small mt-1" style={{ color: 'var(--color-secondary)' }}>
        No management role, so no admin door.
      </div>
    );
  }
  const sections = d.intended_builder_sections ?? [];
  return (
    <div className="small mt-1">
      <span className="text-muted">Opens the admin portal as </span>
      <span className="fw-semibold">{d.intended_builder_mgmt_label}</span>
      {sections.length > 0 && (
        <div className="mt-1">
          {sections.map((s) => (
            <span
              key={s}
              className="badge me-1 mb-1"
              style={{ background: 'var(--cherry-bg)', color: 'var(--cherry-deep)', fontWeight: 600 }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainRow({ d }: { d: AgentDomainRow }) {
  return (
    <tr>
      <th scope="row" className="fw-semibold">
        {d.domain_key}
        <RowLinks d={d} />
        {d.manager_blocker && (
          <div className="fw-normal text-muted small">{d.manager_blocker}</div>
        )}
      </th>
      <td>
        {d.stage ?? <span className="text-danger small">no lifecycle row</span>}
      </td>
      <td className="small">
        {d.manager_email ?? <span className="text-muted">unassigned</span>}
        {d.manager_can_reach === false && (
          <span
            className="badge ms-2"
            style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
          >
            cannot reach the admin surface
          </span>
        )}
      </td>
      {/* The manager above is staff and accountable for the domain. This is the person actually
          building it, which this screen could not tell you until now. */}
      <td className="small">
        {d.intended_builder
          ? (
            <a
              href={`/admin/students?search=${encodeURIComponent(d.intended_builder)}`}
              target="_blank"
              rel="noreferrer"
              title={`Find ${d.intended_builder} on the roster, where you can view the portal as them`}
            >
              {d.intended_builder}
            </a>
          )
          : <span className="text-danger">nobody assigned</span>}
        <BuilderState state={d.intended_builder_state} />
        <BuilderMgmt d={d} />
      </td>
      <td className="text-end">{d.releases}</td>
      <td className="text-end">{d.stories}</td>
      {/* A zero here is the accurate state of the programme, not a rendering gap, so it is
          muted rather than hidden or dashed out. */}
      <Count value={d.stories_verified} />
      <Count value={d.build_authorizations} />
      <td className="small">
        {d.agent_id
          ? (
            <a
              href={`/admin/agents/${encodeURIComponent(d.agent_id)}`}
              target="_blank"
              rel="noreferrer"
              title={`Open ${d.agent_display_name || 'this agent'} in the agent admin screen`}
            >
              {d.agent_display_name || <code>{d.agent_id}</code>}
            </a>
          )
          : <span className="text-muted">none built yet</span>}
      </td>
    </tr>
  );
}

/** A table figure. A deliberate zero is muted so it does not read as a result. */
function Count({ value }: { value: number }) {
  return (
    <td className="text-end" style={value === 0 ? { color: 'var(--color-muted)' } : undefined}>
      {value}
    </td>
  );
}

/** A figure with its label. `muted` is for a deliberate zero; `warn` is for a non-zero problem. */
function Stat({
  label, value, muted = false, warn = false,
}: { label: string; value: number; muted?: boolean; warn?: boolean }) {
  let color = 'var(--color-primary)';
  if (warn) color = 'var(--color-warning)';
  else if (muted) color = 'var(--color-muted)';
  return (
    <div className="col-6 col-md-3">
      <div className="fs-4 fw-bold" style={{ color }}>{value}</div>
      <div className="text-muted small">{label}</div>
    </div>
  );
}
