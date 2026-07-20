# Community — Basecamp Confirmation Needed

Basecamp project `47502609` is source-of-truth #1, but **no Basecamp integration
is reachable in this non-interactive session** (only Gmail/Calendar/Drive
connectors are wired, and those need re-auth; per repo memory, Basecamp writes/reads
require an interactive session). The items below were built to the safest
additive default and must be confirmed against Basecamp before the dependent work
proceeds. None of them block PR 1 (PR 1 changes nothing that depends on them).

## Confirm before PR 2 (People Discovery + Direct Messaging)

1. **Cross-cohort discovery rules** — who is discoverable across cohorts, whether
   discovery is opt-in, whether full names are visible, which profile fields are
   public, whether staff/alumni appear. Built behind
   `COMMUNITY_PEOPLE_DISCOVERY_ENABLED=false` until confirmed.
2. **Cross-cohort messaging** — whether students may DM across cohorts at all.
   Default assumption: **no** (same-cohort only), gated by
   `COMMUNITY_DIRECT_MESSAGES_ENABLED=false`.
3. **DM data model sign-off** — the proposed `CommunityConversation` /
   `ConversationMember` / `Message` / `MessageRead` schema (see BUILD_PLAN) adds
   4 tables; schema changes are a governed decision.
4. **Block/report semantics for members and messages** — retention + moderation
   expectations.

## Confirm before extending existing behavior

5. **Category display labels** — reconcile stored values (General / Wins / Support /
   Introductions) with Design-E labels (General Discussion / Support Needed). Needs
   a decision on whether to relabel display-only or migrate stored values (existing
   posts must not break).
6. **System-generated source posts** (Build Logs / Showcase / Video Critiques /
   weekly topic) — confirm the taxonomy and that they should be visually marked and
   never masquerade as hand-typed posts. Requires a `source` column on
   `community_posts` (migration → PR 2).
7. **Staff/moderator pinning** — whether staff may pin content on another member's
   post (currently author-only; no staff role on `CommunityMember`).
8. **Polls** — only build if confirmed in Basecamp (currently out of scope).

## Merge/target confirmation

9. **Epic-4 → main landing plan** — confirm the coordinated merge sequence for the
   Community epic (currently 363 commits behind main, with `sync/main-to-staging-*`
   and `decision/community-native-reconfirm` branches in play). PR 1 targets the
   integration branch to avoid pre-empting this human-managed decision.
