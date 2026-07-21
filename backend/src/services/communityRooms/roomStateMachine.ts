import { RoomBookingState } from '../../models/RoomBooking';

// Booking lifecycle state machine (spec §11):
//   draft → pending_approval → scheduled → lobby_open → live → cooldown → completed → archived
// Side exits: rejected, cancelled, locked, removed.
// Pure + deterministic so it is trivially unit-testable and shared by every
// service that mutates booking.state.

const TRANSITIONS: Record<RoomBookingState, RoomBookingState[]> = {
  draft: ['pending_approval', 'scheduled', 'cancelled', 'removed'],
  pending_approval: ['scheduled', 'rejected', 'cancelled', 'removed'],
  scheduled: ['lobby_open', 'live', 'cancelled', 'locked', 'removed'],
  lobby_open: ['live', 'scheduled', 'cancelled', 'locked', 'removed'],
  live: ['cooldown', 'completed', 'cancelled'],
  cooldown: ['completed', 'archived'],
  completed: ['archived'],
  // Terminal / side states.
  archived: [],
  rejected: [],
  cancelled: [],
  locked: ['scheduled', 'cancelled', 'removed'],
  removed: [],
};

export const BOOKING_TERMINAL_STATES: RoomBookingState[] = ['archived', 'rejected', 'cancelled', 'removed'];

export function isTerminalBookingState(state: RoomBookingState): boolean {
  return BOOKING_TERMINAL_STATES.includes(state);
}

export function canTransition(from: RoomBookingState, to: RoomBookingState): boolean {
  if (from === to) return true; // idempotent re-assert of the same state is a no-op
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from: RoomBookingState, to: RoomBookingState): void {
  if (!canTransition(from, to)) {
    throw Object.assign(new Error(`Illegal booking transition ${from} → ${to}`), {
      error_class: 'InvalidStateTransition',
      status: 409,
    });
  }
}

export function nextStates(from: RoomBookingState): RoomBookingState[] {
  return [...(TRANSITIONS[from] || [])];
}
