/**
 * Career Prep v27, CP9.1: the candidate interview room's API for the browser checks (the server's shapes:
 * routes/placementRoomRoutes.ts RoomResponse), answered in-process like the rest of fakeApi.js. The room exists only
 * for the booked placement interview (`{ placement: true }`, pi-7); any other id is the server's 404. Before the
 * student decides, join.status is 'decide_first' with NO url (the server never sends one then); after a decision the
 * join link is the sentinel provider URL, so a check can prove the link appears only after consent. Every decision
 * the page sends is recorded (`state.roomDecisions`), to prove a double click sends one.
 */
const SENTINEL = 'https://zoom.example/j/SECRET';

function roomView(state) {
  const iv = state.placement[0];
  const start = Date.parse(iv.startsAt);
  const d = state.roomDecision;
  const consented = d === 'consent' ? 1 : 0;
  return { room: {
    interviewId: iv.id, you: 'candidate', company: iv.company, role: iv.role, startsAt: iv.startsAt, endsAt: new Date(start + 30 * 60_000).toISOString(),
    opensAt: new Date(start - 10 * 60_000).toISOString(), yourDecision: d,
    consent: { consented, of: 2, declined: d === 'decline', label: `RECORDING ${consented} OF 2 CONSENTED` },
    recording: d === 'decline' ? { status: 'declined', note: 'Recording off: someone chose not to be recorded. The interview goes ahead unrecorded, with no replay.' } : { status: 'off', note: null },
    join: d ? { status: 'ready', url: SENTINEL, reason: null } : { status: 'decide_first', url: null, reason: 'Choose whether this interview may be recorded first.' },
  } };
}

/** { status, body } for a room call, or null when the path is not the room (fakeApi answers it). */
function roomRoute(state, method, path, body) {
  const m = /^\/api\/portal\/career-prep\/room\/([^/]+)(\/consent)?$/.exec(path);
  if (!m) return null;
  if (!state.placement.length || m[1] !== state.placement[0].id) return { status: 404, body: { error: 'Not found' } };
  if (m[2] && method === 'POST') {
    state.roomDecisions.push(body.decision);
    if (!state.roomDecision) state.roomDecision = body.decision; // the first decision stands, as on the server
  }
  return { status: 200, body: roomView(state) };
}

module.exports = { roomRoute, SENTINEL };
