import React from 'react';
import type { StaffDesk } from '../campusPeopleApi';
import { openStaffCard, staffRole } from '../staffCard';
import { initialsOf } from '../WhoIsHere';

/**
 * C119: an AI agent at a staff floor's front desk, in the floor's lobby by the elevator (Dara on the Program floor). Pressing it
 * opens the same staff card Reese's Classroom mentor desk opens (openStaffCard): her role, "Message Dara" and her desk prompts.
 * The caller passes only the agents floorAgents() allows, so this component holds no access rule of its own.
 *  - `variant="scene"`: the desk drawn in the floor scene, bottom right (the elevator and Lobby buttons sit bottom left).
 *  - `variant="row"`: the arrival panel's "At the front desk" row on that floor.
 */
export function FloorLobbyDesk({ desk, variant }: { desk: StaffDesk; variant: 'scene' | 'row' }): React.ReactElement {
  const role = staffRole(desk, false);
  const open = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openStaffCard(desk.id, { x: r.left + r.width / 2, y: r.top });
  };
  return (
    <button type="button" className={variant === 'scene' ? 'cm-hq-fdesk' : 'cm-hq-fdesk-row'} onClick={open}
      aria-label={`${desk.name}, ${role}, at the front desk: open ${desk.name}'s card to message ${desk.name}`} data-testid={`cm-hq-fdesk-${variant}-${desk.id}`}>
      <span className={`av staff-${desk.id}`} aria-hidden="true">{initialsOf(desk.name)}</span>
      <span className="tx"><b>{desk.name} <small>AI</small></b><small>{role}</small></span>
      <span className="go">Message {desk.name} &rarr;</span>
    </button>
  );
}

/** Every agent at this floor's front desk, or nothing. */
export function FloorLobbyDesks({ desks, variant }: { desks: StaffDesk[]; variant: 'scene' | 'row' }): React.ReactElement | null {
  if (!desks.length) return null;
  return (
    <div className={variant === 'scene' ? 'cm-hq-fdesks' : 'cm-hq-fdesks-rows'} data-testid={`cm-hq-fdesks-${variant}`}>
      {variant === 'scene' && <span className="sign" aria-hidden="true">FRONT DESK</span>}
      {desks.map((d) => <FloorLobbyDesk key={d.id} desk={d} variant={variant} />)}
    </div>
  );
}
