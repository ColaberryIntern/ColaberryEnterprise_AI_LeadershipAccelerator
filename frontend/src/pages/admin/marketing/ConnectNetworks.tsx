import React from 'react';
import type { ConnectorKey, ConnectorStatus } from '../../../services/channelAccountApi';

/**
 * ConnectNetworks - one row per network: connect it, or see exactly what it still needs.
 *
 * Replaces a single "Connect an account" button that only ever meant LinkedIn. Every network the
 * product can connect is listed, including the ones this server is not set up for yet, because
 * a network missing from the list reads as "not supported", while a network marked "not set up
 * yet - here is what it needs" reads as the to-do it actually is.
 *
 * The setup detail is a native <details>: keyboard- and screen-reader-accessible with no state,
 * and closed by default so a fully configured server shows six quiet rows, not six paragraphs.
 * It names env var NAMES and the redirect URL to register - never a value - and the platform's
 * own requirements (review, audits, cost), so nobody learns a platform rule by being refused.
 */

export interface ConnectNetworksProps {
  connectors: ConnectorStatus[] | null;
  error: string | null;
  /** Why no network can be connected right now (no brand chosen, vault down), or null. */
  blockedReason: string | null;
  busy: boolean;
  onConnect: (key: ConnectorKey) => void;
}

export default function ConnectNetworks({ connectors, error, blockedReason, busy, onConnect }: ConnectNetworksProps) {
  if (error) return <div className="small text-danger" data-testid="connectors-error">{error}</div>;
  if (connectors === null) return <div className="small text-muted">Loading networks…</div>;

  return (
    <div data-testid="connect-networks">
      <div className="small fw-semibold mb-2">Connect a network</div>
      {blockedReason && <div className="small text-muted mb-2" data-testid="connect-blocked">{blockedReason}</div>}
      <ul className="list-unstyled mb-0 border rounded">
        {connectors.map((c, i) => (
          <li
            key={c.key}
            className={`px-3 py-2${i > 0 ? ' border-top' : ''}`}
            data-testid={`connector-row-${c.key}`}
          >
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <span className="fw-medium" style={{ minWidth: '12rem' }}>{c.label}</span>
              {c.configured
                ? <span className="small text-success">Ready to connect</span>
                : <span className="small text-muted">Not set up yet</span>}
              <span className="ms-auto">
                {c.configured && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    disabled={busy || blockedReason !== null}
                    onClick={() => onConnect(c.key)}
                    data-testid={`connect-${c.key}`}
                  >
                    Connect
                  </button>
                )}
              </span>
            </div>
            <details className="mt-1" data-testid={`connector-setup-${c.key}`}>
              <summary className="small text-muted">{c.configured ? 'Platform rules' : 'What it needs'}</summary>
              <div className="small mt-2 d-grid gap-2">
                <div>{c.requirements}</div>
                {c.missing_env.length > 0 && (
                  <div>
                    <span className="text-muted">Set on the server: </span>
                    {c.missing_env.map((v, j) => (
                      <React.Fragment key={v}>{j > 0 && ', '}<code>{v}</code></React.Fragment>
                    ))}
                  </div>
                )}
                {c.redirect_uri && (
                  <div>
                    <span className="text-muted">Redirect URL to register with the platform: </span>
                    <code className="user-select-all" style={{ wordBreak: 'break-all' }}>{c.redirect_uri}</code>
                  </div>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
