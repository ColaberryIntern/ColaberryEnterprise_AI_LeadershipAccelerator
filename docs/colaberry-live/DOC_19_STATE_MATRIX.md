# DOC 19 - Colaberry Live state matrix

**8 editorial states x 4 surfaces** - every cell decided, and every row naming the test that proves it.

Generated from `scripts/artifacts/tickets/l19StateMatrixData.js`. **Do not hand-edit** - the build reads the state list out of the state machine and refuses if a state has no treatment, and opens each named test file and refuses if the named test is not there.

## Why each row names a test

A state matrix is the easiest document in this repository to write as fiction. Every cell is a sentence about behavior, nothing forces the behavior to match, and it stays plausible for months after the code moves. P1-07 asked for this document and never got one; DOC 18 recorded the sharper version of the gap, that **no test asserted what a viewer actually sees**.

So a row that cannot name a passing test is a row describing an intention, and the build treats it as a failure rather than printing it.

## The four surfaces

| Surface | Who | Where |
|---|---|---|
| Presenter | whoever is teaching | Class Kit, projected |
| Phone | the room | `/portal/live/:id/companion` |
| Producer | staff, not the presenter | `/portal/live/:id` |
| Viewer | remote, often not signed in | `/portal/live/:id`, public |

## The matrix

`moment` is what the server resolves the state to, and it is the whole of what the viewer surface receives. **Two states sharing a moment are indistinguishable downstream** - which is the mechanism behind the backstage rule rather than a convention anyone has to remember.

| State | Moment | Presenter | Phone | Producer | Viewer |
|---|---|---|---|---|---|
| `scheduled` | `not_started` | Off air. The deck can be presented; nothing is transmitted. | Not started yet, with the reassurance that the page updates itself and the link stays the same. | The strip offers Go backstage. Go live is blocked until the feed is ready and content is marked. | Not started yet. Same words as backstage, by construction. |
| `backstage` **(security)** | `not_started` | Backstage. Staff can see the program picture. | Identical to scheduled. The room is never told staff are rehearsing. | Full picture inside a staff-only frame. Mark content started becomes available. | Identical to scheduled. This is a security property, not a copy choice. |
| `live` | `live` | On air. | The class is on this page: the player, the current question, and the status buttons. | End and Cancel available. Audience and feed health read live. | Watching, with everything for the class on the one page. |
| `reconnecting` | `live` | On air. The slides never block on a feed problem. | Unchanged. A thirty-second blip must not tell the room the class ended. | Health degrades and the auto-end window starts counting. Ending stays a producer decision. | Still live. Discovery and the resolver agree on this, deliberately. |
| `ended` | `ended` | Off air. | The class has ended. | Terminal for the producer. The end reason says whether a human or the safety net did it. | Ended, with a replay promised only conditionally. |
| `processing` | `ended` | Off air. | The class has ended. | Not driven by the producer: begin_processing and publish_replay are not client-sendable. | Ended. The replay is conditional because processing can fail BACK to ended. |
| `replay_ready` | `ended` | Off air. | The class has ended; the replay is in the portal. | Terminal. Nothing further to command. | Ended, and the replay now exists. |
| `cancelled` | `cancelled` | Off air. An in-room class can still be taught; nothing is broadcast. | This class was canceled. Neither a start nor a replay is promised. | Terminal and unreachable. No second occurrence can be minted for the session. | Canceled, stated plainly. |

### Rows with something to say beyond the cells

- **`processing`** - The state the prototype matrix was missing. `processing: [replay_ready, ended]` means processing can fail BACK to ended, so "aired, no replay" is a real outcome and no surface may promise a replay unconditionally.
- **`cancelled`** - THE BUG THIS MATRIX FOUND. It resolved to `not_started`, so the page told everyone who scanned the code to leave it open and wait for a class that was called off.

### The one row that is a security property

`backstage` is the staff rehearsal state: the producer can see the program picture. A viewer who could tell it from `scheduled` would know when staff were in the room, which is exactly what the state was designed to avoid.

It holds in two places, and both are tested. The resolver maps both states to the same moment, so the surface never receives anything that could distinguish them; and the waiting copy is asserted to carry no staff vocabulary, because the only way this screen can leak is by saying something it should not.

> The first version of that second test rendered `not_started` twice and asserted the two were byte-identical. That compares the state to itself and proves nothing - adding "(staff are in the room)" to the copy passed it. A mutation found it. A matrix row backed by a vacuous test is worse than one backed by none, because it reads as covered.

## Conditions that are not states

Kept separate deliberately. Conflating the two is how a twelve-row table came to describe a machine with eight states: half its rows were scenarios.

### Measurement unavailable

**A count that cannot be read says so and gives its last reading. It never shows 0.**

The producer strip already does this: `N watching`, `N watching, not updating`, `not measuring`, `no answer`, or nothing at all. Note the distinction a new surface must keep: a genuine zero DOES render as `0 watching`. The rule is about unmeasurable, not about zero.

### Command blocked

**The producer is told what to do next, never the server reason code.**

Seven reason shapes, two of them dynamic. An untranslated reason says the system gave no explainable reason and points at the log, rather than printing the identifier.

### Cannot reach the broadcast

**The last answer that arrived stays on screen, labeled as such.**

A producer mid-show needs the stale number more than they need an empty panel.

### Unknown / resolver failed

**Blame the check, not the link.**

A viewer who meets an error page concludes the link is broken and does not come back. The copy says the check cannot answer right now and that it is usually temporary.

## Where each row is proved

| State | Test |
|---|---|
| `scheduled` | `frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx` - "SCHEDULED: says it has not started and that the page updates itself" |
| `backstage` | `frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx` - "leaks no staff vocabulary while a viewer is waiting" |
| `live` | `frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx` - "%s: resolves to live, and the class is on this page" |
| `reconnecting` | `backend/src/services/broadcast/__tests__/broadcastSessionLinks.test.ts` - "treats reconnecting as live, matching what discovery treats as on air" |
| `ended` | `frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx` - "%s: says the class ended and does not promise a replay that may not exist" |
| `processing` | `backend/src/services/broadcast/__tests__/broadcastSessionLinks.test.ts` - "says ended once it is over, and offers nothing to watch" |
| `replay_ready` | `backend/src/services/broadcast/__tests__/broadcastSessionLinks.test.ts` - "says ended once it is over, and offers nothing to watch" |
| `cancelled` | `frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx` - "CANCELED: says so, and promises neither a start nor a replay" |
