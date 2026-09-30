import React, { useCallback, useEffect, useState } from 'react';
import DeliveryShell, { type DeliverySection } from './DeliveryShell';
import { Panel } from './DeliveryPrimitives';

/**
 * ClientPortal — the signed-in client review surface.
 *
 * ## Why DeliveryShell and not one of the other three shells
 *
 * The product has three shells and a client reviewer is **none of their audiences**:
 * `PublicLayoutV2` is the marketing site, `PortalShell`'s navigation *is* a student's
 * curriculum, and `AdminLayout` is staff tooling. An external executive at a paying
 * client has no enrollment, no curriculum and no admin user, so reusing any of them means
 * either dead navigation or a gutted shell — and it blurs the Gate 10 line that a client
 * session is not a platform session.
 *
 * `DeliveryShell` is the fourth, designed and approved for exactly this. It supplies the
 * chrome and holds **no delivery data**: a shell that fetched a project would be one
 * component away from the client half fetching a builder-shaped payload, and Gate 10's
 * property is that the client is served a *different object* by the server rather than a
 * filtered one.
 *
 * ## All eight sections are present, and five of them say they are empty
 *
 * Design, Preview, Releases, Results and Documents have tables but **no writer yet**.
 * They render as real destinations with an explicit "nothing here yet" state rather than
 * being hidden, because hiding them tells a client their engagement has three parts when
 * it has eight — and a populated-looking frame would be worse still. The empty state
 * names what will appear and what has to happen first.
 *
 * `pending` is a property of the section list rather than a check scattered through the
 * render, so switching one on later is a one-word change and the honest empty state
 * cannot be forgotten in the meantime.
 *
 * ## Everything not marked pending is real
 *
 * Overview, Decisions and Changes come from `GET /api/refactored/client/projects` and
 * `.../projects/:id`, gated by `requireDeliveryClient` and scoped by the ids stamped into
 * the token at sign-in. There is no filter parameter and no project picker that talks to
 * the server: the session decides what exists.
 *
 * ## Expiry is handled as a fact, not an error
 *
 * A client session lasts 8 hours. On a 401 the token is cleared and the reviewer returns
 * to the door rather than seeing a failure — an expired session is normal.
 */

const TOKEN_KEY = 'delivery_client_token';


// These mirror CLIENT_FIELD_ALLOWLIST. The allowlist previously named fields that did not
// exist on the models (`summary`, `title`, `started_at`...), and because toClientShape
// skips undefined values they vanished silently rather than erroring.
// clientAllowlistContract.test.ts now pins the server side; these types mirror it.
interface ClientProject {
  id: string;
  name?: string;
  status?: string;
  business_problem?: string;
  product_idea?: string;
}

interface ClientDecision {
  id: string;
  decision_type?: string;
  status?: string;
  question?: string;
  recommendation?: string;
  final_decision?: string | null;
  rationale?: string;
  decided_at?: string;
}

interface ClientChangeRequest {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  requested_at?: string;
  impact_summary?: string;
}

/**
 * One line of evidence behind a release.
 *
 * `outcome` has THREE meaningful values, not two. A check can be waived rather than run,
 * and the waiver carries the reason it was acceptable. Rendering a waiver as a pass would
 * let someone accept a release that looks complete and never had the check.
 */
interface ClientEvidenceLine {
  dimension: string;
  outcome: 'pass' | 'fail' | 'not_run' | 'waived';
  checked_at?: string | null;
  /** Present only on a waiver. */
  reason?: string;
}

interface ClientRelease {
  id: string;
  name?: string;
  status?: string;
  released_at?: string | null;
  evidence_summary?: ClientEvidenceLine[];
}

interface ClientEngagement {
  id: string;
  name?: string;
  status?: string;
  start_at?: string;
  target_end_at?: string;
}

interface ClientBrand {
  id: string;
  name?: string;
  /**
   * Names a theme; never carries colours. The client resolves it against the registry in
   * theme/deliveryBrandThemes.ts, so the palette can change without a schema change and
   * an unknown key simply renders the neutral surface.
   */
  default_theme_key?: string | null;
}

interface ProjectDetail {
  // Null when the project has no brand_id. The surface then shows no brand at all rather
  // than defaulting to Colaberry: an AI Flotation engagement wearing Colaberry's name is
  // worse than one wearing no name.
  brand: ClientBrand | null;
  // Null when the project has no engagement row. The server deliberately sends null
  // rather than a placeholder, so the fallback wording lives here rather than becoming a
  // fiction every API consumer inherits.
  engagement: ClientEngagement | null;
  project: ClientProject;
  decisions: ClientDecision[];
  changeRequests: ClientChangeRequest[];
  // Only releases that actually reached the client. The server filters to approved and
  // released; a candidate still being argued about internally is not something they were
  // given.
  releases: ClientRelease[];
}

type ClientSection = DeliverySection & { pending?: boolean; awaiting?: string };

const SECTIONS: readonly ClientSection[] = [
  { key: 'overview', label: 'Overview', purpose: 'What this project is for and where it stands.' },
  {
    key: 'decisions',
    label: 'Decisions',
    purpose: 'What was decided, why, and what still needs your approval.',
  },
  {
    key: 'design',
    label: 'Design',
    purpose: 'What it will look like and how it will behave.',
    pending: true,
    awaiting: 'a design has been shared for your review',
  },
  {
    key: 'preview',
    label: 'Preview',
    purpose: 'The working thing, before it is released.',
    pending: true,
    awaiting: 'a working preview is available',
  },
  {
    key: 'changes',
    label: 'Changes',
    purpose: 'What you asked to change, and what that would affect.',
  },
  {
    key: 'releases',
    label: 'Releases',
    purpose: 'What shipped, when, and what evidence supported it.',
  },
  {
    key: 'results',
    label: 'Results',
    purpose: 'What it achieved against what was promised.',
    pending: true,
    awaiting: 'a release has been running long enough to measure',
  },
  {
    key: 'documents',
    label: 'Documents',
    purpose: 'The artifacts you were given.',
    pending: true,
    awaiting: 'a document is published to you',
  },
];

const AWAITING_CLIENT = new Set(['recommended', 'open', 'pending']);
const SETTLED = new Set(['approved', 'decided', 'accepted', 'released']);

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // Private browsing. Treated as signed out, which is the truth.
  }
}

function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Colour by the REAL status vocabularies. DecisionStatus is
 * open | recommended | decided | approved | superseded — an earlier version coloured on
 * 'proposed' and 'needs_you', which no model emits, so every decision rendered grey and
 * the one waiting on the client did not stand out at all.
 */
function StatusBadge({ status }: { status?: string }): React.ReactElement | null {
  if (!status) return null;
  const cls = SETTLED.has(status)
    ? 'bg-success'
    : AWAITING_CLIENT.has(status)
      ? 'bg-warning text-dark'
      : 'bg-secondary';
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

/** The honest empty state for a section whose data has no writer yet. */
/**
 * One evidence line, with WAIVED as a first-class outcome.
 *
 * A waiver is not a pass and must never render as one. It gets its own colour, its own
 * word, and the reason it was acceptable printed next to it — the reason is the only thing
 * that lets the person signing judge whether they agree.
 */
function EvidenceLine({ line }: { line: ClientEvidenceLine }): React.ReactElement {
  const TONE: Record<string, string> = {
    pass: 'text-bg-success',
    fail: 'text-bg-danger',
    not_run: 'text-bg-secondary',
    waived: 'text-bg-warning',
  };
  const WORD: Record<string, string> = {
    pass: 'Passed',
    fail: 'Failed',
    not_run: 'Not run',
    waived: 'Waived',
  };
  const readable = line.dimension.replace(/_/g, ' ');
  return (
    <li className="mb-1">
      <span className={`badge ${TONE[line.outcome] ?? 'text-bg-secondary'} me-2`}>
        {WORD[line.outcome] ?? line.outcome}
      </span>
      <span className="small text-capitalize">{readable}</span>
      {line.outcome === 'waived' && (
        <div className="small text-muted ms-1 mt-1">
          {line.reason ?? 'No reason was recorded for this waiver.'}
        </div>
      )}
    </li>
  );
}

function NotYet({ awaiting }: { awaiting?: string }): React.ReactElement {
  return (
    <Panel>
      <p className="text-muted small mb-0">
        Nothing here yet. This section fills in once {awaiting ?? 'the project reaches this stage'}.
      </p>
    </Panel>
  );
}

const ClientPortal: React.FC = () => {
  const [projects, setProjects] = useState<ClientProject[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [activeKey, setActiveKey] = useState('overview');
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [displayName, setDisplayName] = useState('You');

  /** A 401 means the 8-hour session ended. Not an error state — a sign-in state. */
  const handleUnauthorised = useCallback(() => {
    clearToken();
    setSignedOut(true);
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setSignedOut(true);
      return;
    }

    // The display name comes from the token the server issued. Decoding the payload here
    // is a presentation convenience and never a trust decision: every authorisation
    // question is answered server-side against the signature.
    try {
      const claims = JSON.parse(atob(token.split('.')[1] ?? ''));
      if (claims?.display_name) setDisplayName(String(claims.display_name));
    } catch {
      /* keep the default */
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/refactored/client/projects', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          if (!cancelled) handleUnauthorised();
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError('Unable to load your projects right now.');
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const list: ClientProject[] = body?.projects ?? [];
        setProjects(list);
        if (list.length >= 1) setSelected(list[0].id);
      } catch {
        if (!cancelled) setError('Unable to load your projects right now.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handleUnauthorised]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const token = readToken();
    if (!token) {
      setSignedOut(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/refactored/client/projects/${encodeURIComponent(selected)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          if (!cancelled) handleUnauthorised();
          return;
        }
        if (!res.ok) {
          // Includes the 404 a project outside this session returns. The wording matches
          // the server's intent: not "forbidden", which would confirm it exists.
          if (!cancelled) setError('That project is not available on your account.');
          return;
        }
        const body = await res.json();
        if (!cancelled) {
          setDetail(body);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Unable to load this project right now.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, handleUnauthorised]);

  if (signedOut) {
    return (
      <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center py-5">
        <div className="card border-0 shadow-sm" style={{ maxWidth: 420, width: '100%' }}>
          <div className="card-body p-4 text-center">
            <h1 className="h6 mb-3">Your review session has ended</h1>
            {/*
                Unconditional again. This was gated on a Google client id, because
                following it landed on a door that could not open. Magic link needs no
                provider configured, so the door always opens now and the gate is dead
                code - removed rather than left as a condition that is always true.
            */}
            <p className="text-muted small mb-3">
              Client sessions last 8 hours. Sign in again to pick up where you left off.
            </p>
            <a className="btn btn-primary btn-sm" href="/client">
              Sign in
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center py-5">
        {error ? (
          <div className="alert alert-danger small mb-0">{error}</div>
        ) : projects !== null && projects.length === 0 ? (
          <div className="card border-0 shadow-sm" style={{ maxWidth: 420 }}>
            <div className="card-body p-4">
              <h1 className="h6 mb-2">No projects yet</h1>
              <p className="text-muted small mb-0">
                Your account is active, but no engagement has been shared with you yet. Your
                Colaberry contact adds you to a project when there is something to review.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-muted small" role="status">
            Loading your project…
          </div>
        )}
      </div>
    );
  }

  const active: ClientSection = SECTIONS.find((s) => s.key === activeKey) ?? SECTIONS[0];
  const { brand, engagement, project, decisions, changeRequests } = detail;
  // Defaulted rather than assumed: a client on an older backend gets a payload without
  // this key, and the section should be empty rather than throw.
  const releases = detail.releases ?? [];

  return (
    <div className="min-vh-100 bg-light py-3 px-2 px-lg-3">
      <DeliveryShell
        brandName={brand?.name ?? null}
        themeKey={brand?.default_theme_key ?? null}
        audienceLabel="Client review"
        audienceTone="client"
        projectName={project.name ?? 'Untitled project'}
        engagementName={engagement?.name ?? 'Your engagement'}
        personName={displayName}
        personRole="Reviewer"
        sections={SECTIONS}
        activeKey={active.key}
        onSelect={setActiveKey}
        badge={
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm py-0"
            onClick={() => {
              clearToken();
              setSignedOut(true);
            }}
          >
            Sign out
          </button>
        }
      >
        {active.pending && <NotYet awaiting={active.awaiting} />}

        {active.key === 'overview' && (
          <Panel>
            <div className="d-flex align-items-start gap-3 flex-wrap mb-2">
              <h3 className="h6 mb-0 flex-grow-1">{project.name ?? 'Untitled project'}</h3>
              <StatusBadge status={project.status} />
            </div>
            {project.business_problem && (
              <p className="text-muted small mb-2">{project.business_problem}</p>
            )}
            {project.product_idea && <p className="small mb-0">{project.product_idea}</p>}
            {!project.business_problem && !project.product_idea && (
              <p className="text-muted small mb-0">
                No description has been recorded for this project yet.
              </p>
            )}
          </Panel>
        )}

        {active.key === 'decisions' &&
          (decisions.length === 0 ? (
            <Panel>
              <p className="text-muted small mb-0">
                No decisions have been recorded on this project yet.
              </p>
            </Panel>
          ) : (
            <Panel>
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Question</th>
                      <th>Outcome</th>
                      <th>Why</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div className="fw-medium">{d.question ?? 'Untitled decision'}</div>
                          {/* There is no requires_client_approval column. Awaiting the
                              client is expressed by the status vocabulary: a decision sits
                              at 'recommended' until they approve it. */}
                          {d.status === 'recommended' && (
                            <div className="small text-warning-emphasis">Waiting on you</div>
                          )}
                        </td>
                        <td className="small">
                          {d.final_decision ?? (
                            <span className="text-muted">
                              {d.recommendation ? `Recommended: ${d.recommendation}` : '—'}
                            </span>
                          )}
                        </td>
                        <td className="small text-muted">{d.rationale ?? '—'}</td>
                        <td>
                          <StatusBadge status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}

        {active.key === 'releases' &&
          (releases.length === 0 ? (
            <Panel>
              <p className="text-muted small mb-0">
                Nothing has been released to you yet. Releases appear here once they are
                approved, with the evidence behind them.
              </p>
            </Panel>
          ) : (
            <Panel>
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Release</th>
                      <th>Released</th>
                      <th>Evidence</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((r) => {
                      const lines = r.evidence_summary ?? [];
                      const waived = lines.filter((l) => l.outcome === 'waived').length;
                      return (
                        <tr key={r.id}>
                          <td className="fw-medium">{r.name ?? 'Unnamed release'}</td>
                          <td className="small text-muted">
                            {r.released_at ? new Date(r.released_at).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            {lines.length === 0 ? (
                              <span className="small text-muted">No evidence recorded.</span>
                            ) : (
                              <>
                                <ul className="list-unstyled mb-0">
                                  {lines.map((l) => (
                                    <EvidenceLine key={`${r.id}-${l.dimension}`} line={l} />
                                  ))}
                                </ul>
                                {waived > 0 && (
                                  // Said once, plainly, above the detail. Someone scanning the
                                  // table should not have to read every badge to notice that
                                  // this release shipped without a required check.
                                  <div className="small text-warning-emphasis mt-2">
                                    {waived === 1
                                      ? '1 required check was waived on this release.'
                                      : `${waived} required checks were waived on this release.`}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={r.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}

        {active.key === 'changes' &&
          (changeRequests.length === 0 ? (
            <Panel>
              <p className="text-muted small mb-0">
                You have not raised any change requests on this project.
              </p>
            </Panel>
          ) : (
            <Panel>
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Request</th>
                      <th>Impact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeRequests.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="fw-medium">{c.title ?? 'Untitled'}</div>
                          {c.description && <div className="small text-muted">{c.description}</div>}
                        </td>
                        <td className="small text-muted">{c.impact_summary ?? '—'}</td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}
      </DeliveryShell>
    </div>
  );
};

export default ClientPortal;
