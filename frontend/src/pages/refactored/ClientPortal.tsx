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

interface ProjectDetail {
  project: ClientProject;
  decisions: ClientDecision[];
  changeRequests: ClientChangeRequest[];
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
    pending: true,
    awaiting: 'the first release ships',
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
  const { project, decisions, changeRequests } = detail;

  return (
    <div className="min-vh-100 bg-light py-3 px-2 px-lg-3">
      <DeliveryShell
        audienceLabel="Client review"
        audienceTone="client"
        projectName={project.name ?? 'Untitled project'}
        engagementName="Your engagement"
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
