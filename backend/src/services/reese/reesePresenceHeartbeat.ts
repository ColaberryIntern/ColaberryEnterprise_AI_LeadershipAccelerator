import { REESE_EMAIL } from './reeseIdentitySeed';
import { runAgentPresenceHeartbeat } from '../agentBlueprint/agentPresenceHeartbeat';

// Reese Phase 1 — "always online" WITHOUT building any new real-time/websocket
// presence infrastructure. See agentBlueprint/agentPresenceHeartbeat.ts's own
// header for the full mechanism.
//
// AI Employee Consolidation Program (2026-09-15/16), Phase 3/4 — the real
// mechanic now lives in agentBlueprint/agentPresenceHeartbeat.ts as a generic
// module any future agent can call (REESE_STANDARD_AUDIT.md gap 10 — closed).
// This file is now a thin wrapper, mirroring reeseSystemPrompt.ts's own
// extraction pattern: same exported name/signature, byte-for-byte identical
// behavior (delegates to the exact same Enrollment/CommunityMember calls),
// only the implementation moved.
export async function runReesePresenceHeartbeat(): Promise<void> {
  return runAgentPresenceHeartbeat(REESE_EMAIL);
}
