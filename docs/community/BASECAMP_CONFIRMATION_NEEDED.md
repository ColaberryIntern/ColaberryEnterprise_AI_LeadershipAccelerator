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

## Confirm before PR 2 — Community ↔ Group Chat conflict (see ledger D11)

10. **Taxonomy de-confliction — DECIDED (Ali, 2026-07-20): both.** wins / support /
    introductions exist as **both** Community categories **and** Group Chat channels,
    differentiated by mode: Community = durable, gamified async posts (a win you
    showcase; a support request that gets threaded answers + points); Group Chat
    `#channel` = live, ephemeral sync discussion on the same topic (Slack `#wins`
    vs a LinkedIn "post a win"). PR 2 seeds the channel set to match the category
    set 1:1 and cross-links them in the UI so the two modes reinforce rather than
    compete. (Confirm labels/wording against Basecamp when convenient — the
    both-surfaces decision itself is settled.)
11. **Unify the messaging backend.** Recommendation: Group Chat channels, group
    conversations, and 1:1 DMs all share one `CommunityConversation` /
    `CommunityMessage` model with `conversation_type: direct | group | channel`
    (not two separate messaging systems). Confirm this is acceptable.
12. **Group Chat scope for PR 2.** Channels-only first, or channels **plus**
    voice/video rooms (Build Day Room / Study Hall / Office Hours)? Rooms imply a
    real-time A/V provider (Zoom/LiveKit/Daily) — an external dependency and a
    governed decision. Default assumption: **text channels first, rooms deferred**.

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
