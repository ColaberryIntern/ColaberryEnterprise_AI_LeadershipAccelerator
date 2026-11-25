import React from 'react';
import { SectionCard, StatusBadge } from '../../components/admin/shell';
import type { Tone } from '../../components/admin/shell/StatusBadge';

/**
 * EnterpriseClientDemoCard - the client's Command Center and demo, for us to show on the call
 * (L13.7). Never sent to the client from here. The links are signed and last 12 hours; the page
 * gets new ones on every load, so the card says when these stop working.
 */
export interface ClientDemo {
  state: 'no_interview' | 'waiting' | 'refused' | 'planning' | 'building' | 'ready' | 'failed' | 'unknown';
  message: string;
  commandCenterUrl: string | null;
  demoUrl: string | null;
  linkExpiresAt: string | null;
}

const BADGE: Record<ClientDemo['state'], { label: string; tone: Tone }> = {
  no_interview: { label: 'Waiting for the interview', tone: 'neutral' },
  waiting: { label: 'Not started yet', tone: 'neutral' },
  refused: { label: 'Not started', tone: 'warning' },
  planning: { label: 'Planning', tone: 'info' },
  building: { label: 'Building', tone: 'info' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'warning' },
};

export function EnterpriseClientDemoCard({ demo }: { demo?: ClientDemo | null }): React.ReactElement | null {
  if (!demo) return null;
  const badge = BADGE[demo.state] || BADGE.unknown;
  return (
    <SectionCard title="Command Center and demo" icon="window-line">
      <div data-testid="demo-card" className="small">
        <div className="mb-2">
          <StatusBadge label={badge.label} tone={badge.tone} />
        </div>
        <p className="mb-2">{demo.message}</p>
        {demo.commandCenterUrl || demo.demoUrl ? (
          <>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {demo.commandCenterUrl ? (
                <a className="btn btn-primary btn-sm" href={demo.commandCenterUrl} target="_blank" rel="noopener noreferrer">
                  Open Command Center
                </a>
              ) : null}
              {demo.demoUrl ? (
                <a className="btn btn-outline-primary btn-sm" href={demo.demoUrl} target="_blank" rel="noopener noreferrer">
                  Open demo
                </a>
              ) : null}
            </div>
            {demo.linkExpiresAt ? (
              <p className="text-muted mb-0">
                These links work until {new Date(demo.linkExpiresAt).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} CT. Reload this page for new ones.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}

export default EnterpriseClientDemoCard;
