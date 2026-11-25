import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PageHeader } from '../shell';

/**
 * Voice Studio shell (VS3.3): the header and the tabs as real routes (a refresh keeps the tab).
 * Overview and Agents are live; the other tabs arrive in VS3.4 and VS3.5 and are listed, disabled,
 * so the layout does not jump when they land. Nothing on this page places a call.
 */
export interface StudioTab { to: string; label: string; end: boolean; ready: boolean }

export const VOICE_STUDIO_TABS: ReadonlyArray<StudioTab> = [
  { to: '/admin/voice-studio', label: 'Overview', end: true, ready: true },
  { to: '/admin/voice-studio/agents', label: 'Agents', end: false, ready: true },
  { to: '/admin/voice-studio/lab', label: 'Voice Lab', end: false, ready: false },
  { to: '/admin/voice-studio/numbers', label: 'Numbers & Routing', end: false, ready: false },
  { to: '/admin/voice-studio/calls', label: 'Call Explorer', end: false, ready: false },
  { to: '/admin/voice-studio/trust', label: 'Trust Center', end: false, ready: false },
  { to: '/admin/voice-studio/quality', label: 'Quality & Release', end: false, ready: false },
  { to: '/admin/voice-studio/costs', label: 'Costs & Operations', end: false, ready: false },
];

export default function VoiceStudioLayout(): React.ReactElement {
  return (
    <div className="voice-studio">
      <PageHeader
        title="Voice Studio"
        subtitle="Our own phone agents: what they say, what they may do, and how calls are going. Nothing here places a call."
        icon="phone-line"
      />
      <nav aria-label="Voice Studio sections" className="mb-3">
        <ul className="nav nav-tabs flex-nowrap overflow-auto">
          {VOICE_STUDIO_TABS.map((t) => (
            <li className="nav-item" key={t.to}>
              {t.ready ? (
                <NavLink to={t.to} end={t.end} className={({ isActive }) => `nav-link text-nowrap${isActive ? ' active' : ''}`}>
                  {t.label}
                </NavLink>
              ) : (
                <span className="nav-link disabled text-nowrap" aria-disabled="true" title="Coming in the next release of Voice Studio">
                  {t.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
