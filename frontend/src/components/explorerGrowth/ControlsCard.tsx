import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SectionCard from '../admin/shell/SectionCard';
import StatusBadge from '../admin/shell/StatusBadge';
import { getControls, type ExplorerControls } from '../../services/explorerGrowthApi';

/**
 * OH1k: one front door (Ali, 2026-11-18: "where will the controls be? Both places or merged? or
 * connected?"). Read only. Shows the one kill switch, the Open House countdown as an event rule
 * that links to its own campaign page, and every switch this build added, each OFF until Ali
 * turns it on. A value that could not be read says so; it is never shown as "off".
 */
function onOff(v: boolean | null): { label: string; tone: 'neutral' | 'danger' | 'warning' } {
  if (v === null) return { label: 'unreadable', tone: 'warning' };
  return v ? { label: 'ON', tone: 'danger' } : { label: 'off', tone: 'neutral' };
}

export function ControlsBody({ c }: { c: ExplorerControls }) {
  const kill = c.killSwitch.readable ? onOff(c.killSwitch.active) : onOff(null);
  const rows: Array<[string, { label: string; tone: 'neutral' | 'danger' | 'warning' }, string]> = [
    ['Maya answers email replies on her own', onOff(c.switches.mayaEmailAutoReply), 'Off: replies wait in the outbound approvals queue for a person.'],
    ['GHL mirror (notes for emails, replies, calls)', onOff(c.switches.ghlMirror), 'Off: nothing is written to GHL contacts.'],
    ['Countdown calls', onOff(c.switches.voiceCalls), c.switches.openHouseAgentConfigured ? 'Open House agent is configured.' : 'Open House agent id is not set, so calls would refuse.'],
  ];
  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-2">
        <strong className="small">Kill switch (stops every send, both systems)</strong>
        <StatusBadge label={kill.label} tone={kill.tone} />
      </div>
      <div className="small mb-3">
        <strong>Event rule: Open House countdown</strong>{' '}
        {c.countdown.adminUrl ? (
          <>
            <StatusBadge label={c.countdown.status || 'unknown'} tone="neutral" />{' '}
            <Link to={c.countdown.adminUrl}>open its campaign</Link>
            <div className="text-muted">
              Takes precedence: Explorer Growth holds anyone in a live countdown, and other campaigns wait 24 hours around each countdown email.
            </div>
          </>
        ) : (
          <span className="text-muted">{c.countdown.readable ? 'no countdown campaign exists' : 'could not be read'}</span>
        )}
      </div>
      <table className="table table-sm small mb-2">
        <tbody>
          {rows.map(([name, v, note]) => (
            <tr key={name}>
              <td>{name}</td>
              <td><StatusBadge label={v.label} tone={v.tone} /></td>
              <td className="text-muted">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small text-muted">
        Brain shelves:{' '}
        {c.shelves
          ? Object.entries(c.shelves).map(([k, v]) => `${k.replace('_', ' ')} ${v.servable} live, ${v.draft} awaiting approval`).join(' · ')
          : 'could not be read'}
      </div>
    </>
  );
}

export default function ControlsCard() {
  const [state, setState] = useState<{ c: ExplorerControls | null; error: boolean }>({ c: null, error: false });
  useEffect(() => {
    let live = true;
    getControls()
      .then((c) => { if (live) setState({ c, error: false }); })
      .catch(() => { if (live) setState({ c: null, error: true }); });
    return () => { live = false; };
  }, []);
  return (
    <SectionCard title="Controls (one front door)" icon="shield-keyhole-line">
      {state.error ? (
        <div className="alert alert-warning py-2 px-3 small mb-0">The controls could not be read. This is not the same as everything being off.</div>
      ) : state.c ? (
        <ControlsBody c={state.c} />
      ) : (
        <div className="text-muted small">Loading…</div>
      )}
    </SectionCard>
  );
}
