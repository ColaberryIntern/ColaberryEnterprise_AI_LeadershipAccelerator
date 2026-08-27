# Memory Map (Checkpoint A)

Full inventory of every memory-shaped and approval-shaped model in the repo, gathered to answer one question: does anything today implement "an agent learned something → evidence attached → a human approved it → it's used at runtime," with the approval gate actually enforced? **Answer: no.**

## Memory-shaped models (none meet the bar)

| Model | Table | Shape | Human-approval gate? |
|---|---|---|---|
| `WorkforceMemory` | `workforce_memory` | `employee_slug, kind, content, ref` | None. Also: keyed to the *synthetic* Workforce OS roster (`CURRENT_STATE.md` §E) — not `ai_agents.id`. |
| `IntelligenceMemory` | `intelligence_memory` | `category, content, embedding (pgvector), metadata` | None |
| `LearnerMemory` | `learner_memory` | `enrollment_id, summary, misconceptions[], goals, strengths[]` | None — nightly writer rewrites it |
| `AdmissionsMemory` | `admissions_memory` | `visitor_id, conversation_summaries[], interests[], ...` | None |
| `OpenclawLearning` | `openclaw_learning` | `learning_type, platform, metric_key/value, sample_size, confidence, insight, applied (bool)` | Has an `applied` column — **confirmed dead**. Grepped every `OpenclawLearning.findOrCreate` call site (`openclawLearningOptimizationAgent.ts`); nothing ever sets it true or reads it for gating. |
| `InboxLearningEvent` | `inbox_learning_events` | `email_id, draft_id, ai_draft_text, actual_reply_text, diff_summary` | None — raw diff capture |
| `LearningPolicySnapshot` | `learning_policy_snapshots` | `project_id, trigger, policy (JSONB), deltas (JSONB), confidence` | None — append-only auto-record |
| `ReportingInsight` | `reporting_insights` | `insight_type, source_agent, title, narrative, confidence, evidence, recommendations, status` | **Has a real human-facing `status` workflow** (`new→acknowledged→actioned→dismissed`) — closest thing to a gate, but it's a dashboard artifact never fed back into an agent's runtime behavior. |
| `ICPInsight` / `InsightReplacement` | `icp_insights` / `insight_replacements` | Metric rollups; successor-linking with `reason` | None (auto-computed) |

`AiAgent.config` (JSONB) — checked directly: every real value across `agentRegistrySeed.ts:303-459` is a static operational threshold. A targeted grep for `config.memory|config.learn|config.insight|config.observation|config.fact|config.knowledge` across `backend/src` returns **zero matches**. Confirmed: never used as accumulated-learning storage anywhere.

## Approval-shaped objects — full inventory (5 previously known + 11 more found)

Previously known: `ApprovalRequest` (shadow-mode-only — nothing ever moves `status` off `shadow_logged`), `OpsApprovalQueueItem`, `DecisionRecord`, `InboxReplyDraft`, `OpenclawResponse`.

Newly catalogued this checkpoint, all real models in `backend/src/models/`:

| Model | Table | Live end-to-end? |
|---|---|---|
| `ProposedAgentAction` | `proposed_agent_actions` | **Yes** — real controller (`agentGovernanceController.ts:27-53`), FK'd to `ai_agents.id`, used by content-optimization, conversation-optimization, and workforce-director actions |
| `AgentCreationProposal` | `agent_creation_proposals` | Yes |
| `PreparedRemediationPlan` | `prepared_remediation_plans` | Yes — most elaborate state machine of the group (draft→operator decision→optional auto-exec→applied→closed-loop verification) |
| `ExperimentProposal` | `experiment_proposals` | Yes |
| `HealingPlan` | `healing_plans` | Yes |
| `DeliveryDecision` | `delivery_decisions` | Yes — append-only/supersession-based |
| `MentorReviewItem` | `mentor_review_items` | Yes |
| `CapstoneReviewApproval` | `capstone_review_approvals` | Yes |
| `LeadRecommendation` | `lead_recommendations` | Yes |
| `Decision` | `decisions` | Yes (distinct, older "Decision Engine" model — not `DecisionRecord`) |
| `DeliveryChangeRequest`, `VisualChangeDecision`, `WalkCapEntry`, `ReferralCommission` | — | Same approval-shaped family, not read in full this checkpoint |

## Verdict

`ProposedAgentAction` is the strongest existing precedent — generic (used by 3+ unrelated agent types), FK'd correctly to `ai_agents.id`, real live 4-state lifecycle, real controller. It is the pattern `AgentMemoryProposal`/`AgentApprovedMemory` and `AgentManagerInboxItem` (per `DOMAIN_REUSE_MAP.md`) should structurally resemble. `ReportingInsight.status` is the closer analogue specifically for the human-review-workflow shape. Neither should be directly repurposed (wrong FK target / wrong semantics) — both are references for a new, `ai_agents.id`-keyed model, built new in a later checkpoint, not Checkpoint A.

The concrete anti-pattern to avoid, proven real in this codebase: `OpenclawLearning.applied`. A boolean approval flag nobody ever checks is worse than no flag — it looks governed and isn't. Any new memory-approval gate must be provably read by the runtime context-assembly path before it ships, not just written.
