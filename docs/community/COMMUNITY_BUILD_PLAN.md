# Community — Build Plan (Design-E Social Experience)

Independently reviewable vertical slices. PR 1 is delivered in this session;
PR 2+ are scoped but not built. Each slice is additive and preserves the
existing invariants in `COMMUNITY_DECISION_LEDGER.md`.

## PR 1 — Design-E fidelity + data-contract fixes  ✅ DELIVERED

Branch `workstream/community-social-experience-v1` → PR into
`feature/community-home-integration`.

- **Slice 1 — Phase-0 docs + reference.** This ledger, current-state, build plan,
  Basecamp-confirmation doc, read-only Design-E reference copy.
- **Slice 2 — Backend contract fixes.** `viewer_has_liked` on the post feed
  (server-authenticated, batched lookup); cursor pagination
  (`listPosts` → `{ posts, next_cursor }`, keyset over pinned/created_at/id);
  schema + route + all consumers updated; 3 new unit tests. **Verified: 33/33
  jest, tsc-clean source.**
- **Slice 3 — Post card + composer.** `Avatar` (avatar_url + initials fallback),
  `MediaGrid` (img/video, +N overlay), like state from `viewer_has_liked` with
  optimistic rollback, collapsed→expanded `Composer` with add-media + category.
- **Slice 4 — Surface + layout.** `EventStrip`, `MemberProfileDrawer`,
  contacts rail with presence + online count, 3-column responsive `cm-layout`,
  pinned-post treatment, load-more. CSS reuses Design-E tokens only.
- **Slice 5 — Tests.** Backend jest (done). Frontend `communityUtils` unit test
  (runs under CRA jest in CI).

**Explicitly NOT in PR 1:** DM schema, cross-cohort discovery, notification UI,
saved posts, source-tagged system posts, category relabeling, inline comment
previews. No change to points, level thresholds, self-like rules, moderation, or
cohort authz.

## PR 2 — People Discovery + Direct Messaging Foundations  (planned)

Gated: `COMMUNITY_PEOPLE_DISCOVERY_ENABLED=false`,
`COMMUNITY_DIRECT_MESSAGES_ENABLED=false`. **Blocked on Basecamp confirmation**
(see `BASECAMP_CONFIRMATION_NEEDED.md` items 1–4).

- **People directory** — server-side searchable/paginated directory (name, skill,
  level, online, open-to-collaborate); current-cohort by default, cross-cohort
  behind the flag once rules are confirmed.
- **DM data model** — `CommunityConversation`, `CommunityConversationMember`,
  `CommunityMessage`, `CommunityMessageRead` (+ indexes, direct-conversation
  uniqueness). Boot schema hook per repo convention (no global sequelize.sync).
- **DM API** — create-or-return direct conversation, list conversations, cursor
  message pagination, send/edit/remove, mark-read, unread counts, mute, report.
  Server-side membership checks on every read; rate-limited sends; cross-cohort
  disabled until authorized.
- **Chat dock + conversation UI** — lower-right dock, unread badges, presence,
  polling refresh (WebSockets remain a later, separately-flagged decision).

## PR 3 — Notifications, saved content, source-tagged posts  (planned)

- Reuse existing `CommunityNotification` infra for a bell/inbox UI (no second
  notification system); per-user read state; dedup; no storm from bulk/system posts.
- Saved/bookmarked posts (private, no points).
- `source` column on `community_posts` (migration) → visually-marked system posts
  (Build Logs / Showcase / Video Critiques / weekly topic) + Design-E category
  relabeling. Needs Basecamp confirmation (items 5–6).

## PR 4 — Community intelligence (additive)  (planned)

Surface unanswered Support posts, recommend collaborators, weekly cohort
summaries, staff-attention detection, curriculum-week-relevant discussions,
Community→Today recommendations. Every AI action observable and human-reviewed;
no auto-removal, no fabricated activity, no messaging as a human.
