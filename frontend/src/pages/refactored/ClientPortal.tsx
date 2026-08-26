import React, { useCallback, useEffect, useState } from 'react';

/**
 * ClientPortal — where a signed-in client reviewer actually lands.
 *
 * Before this existed, sign-in had nowhere to go: `/client` stored a token in
 * localStorage and stopped. The Client Review Room lives at `/admin/refactored/client`,
 * inside the admin tree, which a client token cannot enter — correctly, since Gate 10's
 * property is that a client session is not a builder session.
 *
 * ## Everything on this page is real
 *
 * The projects, decisions and change requests below come from
 * `GET /api/refactored/client/projects` and `.../projects/:id`, gated by
 * `requireDeliveryClient` and scoped by the ids stamped into the token at sign-in. There
 * is no filter parameter and no project picker that talks to the server: the session
 * decides what exists.
 *
 * ## What is deliberately NOT here
 *
 * The Client Review Room mockup shows eight sections — design, preview, releases,
 * results, documents. Those tables exist but **nothing writes them yet**, so rendering
 * them would mean showing a client an empty frame styled to look like a report, or worse,
 * placeholder content indistinguishable from their real engagement. This page shows the
 * three things that are genuinely backed by data and says plainly that the rest is not
 * wired. A client surface that overstates what it knows is worse than a small one.
 *
 * ## Expiry is handled as a fact, not an error
 *
 * A client session lasts 8 hours. On a 401 the token is cleared and the reviewer is sent
 * back to the door rather than shown a failure — an expired session is normal, and
 * "please sign in again" is the honest description of it.
 */

const TOKEN_KEY = 'delivery_client_token';

interface ClientProject {
  id: string;
  name?: string;
  summary?: string;
  status?: string;
  started_at?: string;
  target_date?: string;
}

interface ClientDecision {
  id: string;
  title?: string;
  decision_type?: string;
  status?: string;
  rationale?: string;
  decided_at?: string;
  requires_client_approval?: boolean;
}

interface ClientChangeRequest {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  requested_at?: string;
  impact_summary?: string;
}

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing. Treated as signed out, which is the truth.
    return null;
  }
}

function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

function StatusBadge({ status }: { status?: string }): React.ReactElement | null {
  if (!status) return null;
  const cls =
    status === 'approved' || status === 'accepted' || status === 'released'
      ? 'bg-success'
      : status === 'needs_you' || status === 'pending' || status === 'proposed'
        ? 'bg-warning text-dark'
        : 'bg-secondary';
  return <span className={`badge ${cls}`}>{status.replace(/_/g, ' ')}</span>;
}

const ClientPortal: React.FC = () => {
  const [projects, setProjects] = useState<ClientProject[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    project: ClientProject;
    decisions: ClientDecision[];
    changeRequests: ClientChangeRequest[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

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
        // One project is the common case for a client. Opening it saves a pointless click.
        if (list.length === 1) setSelected(list[0].id);
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

  return (
    <div className="min-vh-100 bg-light">
      <header className="bg-white border-bottom">
        <div className="container py-3 d-flex align-items-center gap-3">
          <div
            className="rounded d-grid text-white fw-bold"
            style={{ width: 32, height: 32, placeItems: 'center', background: 'var(--color-primary)' }}
            aria-hidden="true"
          >
            C
          </div>
          <div className="flex-grow-1">
            <div className="fw-semibold">Client review</div>
            <div className="text-muted small">Your engagements with Colaberry</div>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              clearToken();
              setSignedOut(true);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="container py-4">
        {error && (
          <div className="alert alert-danger small" role="alert">
            {error}
          </div>
        )}

        {projects === null && !error && (
          <div className="text-muted small" role="status">
            Loading your projects…
          </div>
        )}

        {projects !== null && projects.length === 0 && (
          <div className="card border-0 shadow-sm">
            <div className="card-body p-4">
              <h2 className="h6 mb-2">No projects yet</h2>
              <p className="text-muted small mb-0">
                Your account is active, but no engagement has been shared with you yet. Your
                Colaberry contact adds you to a project when there is something to review.
              </p>
            </div>
          </div>
        )}

        {projects !== null && projects.length > 1 && (
          <div className="d-flex gap-2 flex-wrap mb-4">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn btn-sm ${selected === p.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSelected(p.id)}
              >
                {p.name ?? 'Untitled project'}
              </button>
            ))}
          </div>
        )}

        {detail && (
          <>
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <div className="d-flex align-items-start gap-3 flex-wrap">
                  <div className="flex-grow-1">
                    <h2 className="h5 mb-1">{detail.project.name ?? 'Untitled project'}</h2>
                    {detail.project.summary && (
                      <p className="text-muted small mb-0">{detail.project.summary}</p>
                    )}
                  </div>
                  <StatusBadge status={detail.project.status} />
                </div>
              </div>
            </div>

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                Decisions
                <span className="text-muted fw-normal small ms-2">
                  What was decided, and what still needs you
                </span>
              </div>
              <div className="card-body p-0">
                {detail.decisions.length === 0 ? (
                  <p className="text-muted small p-4 mb-0">
                    No decisions have been recorded on this project yet.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Decision</th>
                          <th>Why</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.decisions.map((d) => (
                          <tr key={d.id}>
                            <td>
                              <div className="fw-medium">{d.title ?? 'Untitled'}</div>
                              {d.requires_client_approval && (
                                <div className="small text-warning-emphasis">Needs your approval</div>
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
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                Change requests
                <span className="text-muted fw-normal small ms-2">What you asked to change</span>
              </div>
              <div className="card-body p-0">
                {detail.changeRequests.length === 0 ? (
                  <p className="text-muted small p-4 mb-0">
                    You have not raised any change requests on this project.
                  </p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Request</th>
                          <th>Impact</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.changeRequests.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div className="fw-medium">{c.title ?? 'Untitled'}</div>
                              {c.description && (
                                <div className="small text-muted">{c.description}</div>
                              )}
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
                )}
              </div>
            </div>

            {/*
                Stated rather than hidden. Design, preview, releases, results and documents
                are real sections of this surface whose tables have no writer yet. Rendering
                empty frames styled as reports would imply we are tracking something we are
                not.
            */}
            <div className="alert alert-secondary small mb-0" role="note">
              <strong>Not yet available:</strong> design, preview, releases, results and
              documents will appear here once a project reaches those stages.
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default ClientPortal;
