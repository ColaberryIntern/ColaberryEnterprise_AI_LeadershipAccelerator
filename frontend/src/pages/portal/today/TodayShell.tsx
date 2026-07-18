// Today entry point — a thin selector over the server-authoritative flag.
// PORTAL_TODAY_REDESIGN_ENABLED=true (default) renders the redesigned command
// band + FB-style mobile shell; setting it to false instantly rolls back to the
// preserved classic Today (TodayShellClassic) with no image rebuild / redeploy.
import React from 'react';
import './TodayShell.css';
import { usePortalFlags } from '../../../hooks/usePortalFlags';
import TodayRedesign from './TodayRedesign';
import TodayShellClassic from './TodayShellClassic';

const TodayShell: React.FC = () => {
  const { flags, loading } = usePortalFlags();

  // Hold briefly while the flag resolves so a rollback never flashes the wrong
  // Today. The flags endpoint is local and fast.
  if (loading || !flags) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner-border spinner-border-sm" role="status" style={{ color: '#FB2832' }}>
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  return flags.today_redesign ? <TodayRedesign /> : <TodayShellClassic />;
};

export default TodayShell;
