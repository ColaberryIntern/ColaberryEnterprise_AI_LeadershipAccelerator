# Community — Current State Audit

Branch `feature/community-home-integration` as of session `CC-20260719-c3v8`.
Legend: ✅ present · 🟡 partial · ❌ missing · ⬆️ delivered in PR 1.

| Capability | Frontend | Backend | Test | API | Design-E gap | Action |
|---|---|---|---|---|---|---|
| Cohort feed (list posts) | ✅ CommunityPage | ✅ listPosts | ✅ | ✅ GET /posts | Was unpaginated, loaded all | ⬆️ cursor pagination + Load more |
| Viewer like state on posts | 🟡 `useState(false)` bug | ❌ no field | ❌ | ✅ | Every post showed unliked on load | ⬆️ `viewer_has_liked` server-side + tests |
| Create post | 🟡 always-expanded textarea | ✅ createPost | ✅ | ✅ POST /posts | Not the collapsed→expanded composer | ⬆️ Composer collapsed/expanded + add-media |
| Media on posts | ❌ never rendered | ✅ stores media_urls | — | ✅ | media_urls stored but invisible | ⬆️ MediaGrid (img/video, +N overlay) |
| Avatars | ❌ initials only | ✅ avatar_url stored | — | ✅ | avatar_url never rendered | ⬆️ Avatar (img + initials fallback) everywhere |
| Category filter pills | ✅ | ✅ | ✅ | ✅ | Labels differ from Design-E | 🟡 relabel deferred (needs BC confirm) |
| Comments + one-level reply | ✅ | ✅ createComment | ✅ | ✅ | Thread only on expand (no inline preview) | 🟡 inline comment preview → PR 2 |
| Comment/post like toggle | ✅ | ✅ toggleLike | ✅ | ✅ | — | Preserved; post-like now optimistic w/ rollback |
| Pinned posts | ✅ badge+pin | ✅ author-only | ✅ | ✅ | Weak visual hierarchy | ⬆️ pinned card treatment (amber rail) |
| Locked (level-gated) posts | ✅ teaser | ✅ server-enforced | ✅ | ✅ | — | Preserved |
| Leaderboard (periods) | ✅ 7/30/all tabs | ✅ real ranked endpoint | ✅ | ✅ GET /leaderboard | Already real (not faked) | Preserved; avatars added |
| My-profile card (level/points/progress) | ✅ | ✅ getMyProfile | ✅ | ✅ | — | Preserved; avatar added |
| Member directory / contacts | 🟡 merged into sidebar | ✅ listMembers | ✅ | ✅ GET /members | No independent contacts rail | ⬆️ contacts rail w/ presence + online count |
| Member profile view | ❌ non-clickable | ✅ getMemberProfileById | ✅ | ✅ GET /members/:id | Endpoint existed, no UI | ⬆️ MemberProfileDrawer (click avatar/name) |
| Presence (~45s ping) | ✅ | ✅ derivePresence | ✅ | ✅ ping | — | Preserved |
| Upcoming events | ❌ | ✅ getUpcomingEvents | ✅ | ✅ GET /calendar | Endpoint existed, no UI | ⬆️ EventStrip (next event + countdown + join) |
| 3-column layout | ❌ 2-col | n/a | — | n/a | Not Design-E composition | ⬆️ cm-layout (feed / sidebar / contacts), responsive |
| Notifications | ❌ no UI | ✅ list/mark-read | ✅ | ✅ | No bell/inbox UI | 🟡 PR 2 |
| Direct / group messaging | ❌ | ❌ | — | ❌ | Whole surface missing | 🟡 PR 2 (gated) |
| People discovery (cross-cohort) | ❌ | ❌ | — | ❌ | — | 🟡 PR 2 (gated, needs BC confirm) |
| Saved / bookmarked posts | ❌ | ❌ | — | ❌ | — | 🟡 PR 2 |
| Source-tagged system posts | ❌ | ❌ (no `source` col) | — | ❌ | Build Logs/Showcase/etc. | 🟡 PR 2 (needs migration + BC confirm) |

## Existing invariants confirmed preserved by PR 1

Cohort scoping, 403-vs-404 cross-cohort behavior, profile anti-enumeration,
one-level replies, author-only pinning, server-enforced level gates, like→points
currency, ~45s presence, dark-mode compatibility, existing routes, and all 30
pre-existing `communityService` tests (now 33 with the 3 new Phase-4 tests).
