---
name: openclaw-outreach
description: Generate or audit social outreach content (Reddit, Quora, HN, LinkedIn, Dev.to, Skool, etc.) under the OpenClaw platform strategy. Invoke when writing comments/posts/replies, when reviewing flagged content, or when tuning the byline policy.
user-invocable: true
---

# OpenClaw Outreach — Platform Strategy + Byline Policy

## When to invoke
- Drafting or auditing outbound social content (comments, replies, posts) for any external platform Colaberry engages on.
- Reviewing a moderation flag (e.g., Skool, Reddit) to understand WHY content was flagged.
- Tuning the banned-phrase list or the byline-append/strip logic.
- Generating LinkedIn-native posts for Ali, Dhee, or other assistants.

## Platform strategy taxonomy

Three strategies, three different content rules:

| Strategy | Examples | Byline behavior |
|---|---|---|
| **PASSIVE_SIGNAL** (cross-platform comments) | Reddit, Quora, Hacker News, Facebook Groups, LinkedIn comments on others' posts | **Append byline.** Reader cannot natively tell the commenter is Ali. |
| **HYBRID_ENGAGEMENT** (engagement-first, light posting) | Dev.to, Hashnode, Twitter, Bluesky, ProductHunt, Discourse | **Append byline** (short form on char-limited platforms). |
| **AUTHORITY_BROADCAST** (Ali's own channel) | LinkedIn native posts, YouTube | **STRIP byline.** The platform identifies the author inherently; manual sign-off reads as redundant ("Hi I'm Ali, and also I'm Ali") and looks LLM-generated. |

## The byline
`- Ali Muwwakkil (ali-muwwakkil on LinkedIn)` — append for non-AUTHORITY strategies; strip for AUTHORITY_BROADCAST.

The deterministic enforcement lives in `enforceSignOff()` in `backend/src/services/agents/openclaw/openclawPlatformStrategy.ts`. It appends for PASSIVE/HYBRID and actively strips from AUTHORITY_BROADCAST output, regardless of what the LLM (or a human drafter) emitted.

When hand-drafting LinkedIn-native posts (e.g., for Dhee to publish on Ali's profile), follow the same rule: **no byline.**

## Skool-specific banned patterns

Skool moderators flag DM-bait and self-promotional CTAs aggressively. The quality gate at `backend/src/services/agents/skool/skoolQualityGateAgent.ts` enforces these patterns; the generation prompts at `backend/src/services/agents/skool/skoolPlatformStrategy.ts` proactively avoid them.

### Universally banned (across all Skool categories, hiring included)
- `DM me`, `message me`, `ping me`, `shoot me a (dm|message|note)`
- `happy to (chat|share|discuss|connect|help|assist|hop on|jump on)`
- `happy to share (more )?about`
- `(feel free to |please |you can )?reach out (to me|directly|if you)`
- `contact me directly`
- `dig into this`, `dive deeper`, `hop on a call`, `jump on a call`
- `if you'?re (looking to|interested in) (partner|collaborat|work with me|connect)`
- `if you'?re interested\s*[.,!]` (bare "if you're interested." at end of sentence)
- `let me know if you (want|need|are interested|'?d like)`
- `I recently (helped|worked with) (a|an|my)` (case-study pivot)
- `looking to (enhance|improve|upgrade) your (system|workflow|process|stack)`

### Banned in non-hiring categories (in addition to above)
- `my team`, `we (build|specialize|offer|deliver|provide)`, `team (specializes|builds|offers)`
- Case-study fingerprints with specific numbers: `$1.2M`, `200 vehicles`, `200 invoices in 4 minutes`, `97% accuracy`, `42,000 members`, `60% fewer (inbound )?calls`
- `multi[- ]agent voice system` (the canned case-study framing — recognized by moderators as a fingerprint)

### Hiring-specific spam patterns
- Service-catalog language: `production AI systems`, `multi-agent orchestration`, `AIOS installs`, `voice agents and custom backends`, `custom backends`
- "Delivery team" framing: `delivery side (for|of) (agency|agencies)`, `we'?(re)? the delivery (side|team)`
- Vendor closers: `collaborate effectively`, `Let's (discuss|explore) how (we|my team)`, `bring your (project|strategy|vision) to life`, `(various|multiple) industries`, `ideal for your (expanding|growing) needs`
- `you (close|handle) the deals?,? (and )?we (build|handle|deliver)`

## Closing rule (ALL categories, ALL platforms)
**Close with VALUE, not invitation.** The reader should walk away with the insight, not a question about whether to message you. If the post asks for collaboration, the reader will look at the profile. The sign-off (byline or none, per strategy) is the only handoff needed.

## Where this lives in code
- Quality gate: `backend/src/services/agents/skool/skoolQualityGateAgent.ts` (also `openclawQualityGateAgent.ts` for non-Skool platforms)
- Generation prompts: `backend/src/services/agents/skool/skoolPlatformStrategy.ts` (also `openclawPlatformStrategy.ts`)
- Validation: `validateContent()` in `skoolPlatformStrategy.ts` (LLM-output gate at generation time)
- Strategy enforcement: `enforceSignOff()` in `openclawPlatformStrategy.ts` (byline append/strip)

## When a new moderation flag lands
1. Capture the EXACT comment that was flagged (DB lookup via `skool_responses.body` or `openclaw_responses.content`).
2. Identify which pattern is missing from the regex list.
3. Add the pattern to BOTH the quality gate (catches drift at the gate) AND the generation prompt (prevents drift at the LLM).
4. Run a retroactive sweep: UPDATE any approved-not-yet-posted responses matching the new pattern to `failed`.
5. Update this skill's banned-patterns list.
6. Commit + deploy.

Past examples: 2026-05-08 (OpenClaw banned-phrase patch), 2026-05-12 (Skool hiring-branch bypass fix + 41-response retroactive sweep).
