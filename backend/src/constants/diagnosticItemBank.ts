import { ARCHITECTURE_SKILL_IDS, ArchitectureSkillId } from './architectureSkills';

/**
 * Static, plain-English item bank for CAPE's adaptive diagnostic / "test out"
 * confirmation (design doc §5 "Adaptive confirmation"). One recognition/
 * knowledge item + one scenario/tradeoff item per skill, auto-scored
 * server-side. No shaming/penalty language anywhere in the item text, per §5.
 *
 * Deliberately a small fixed constant, not LLM-generated or admin-editable —
 * see execution-contract.md Assumption 5. A "tiny proof task" third item for
 * advanced claims (§5, optional) is explicitly deferred to a future phase
 * (would need AI/human review infrastructure this phase does not build):
 * TODO_PHASE_3_PROOF_TASK.
 */
export interface DiagnosticOption { id: string; label: string; }
export interface DiagnosticItem {
  id: string;
  skill_id: ArchitectureSkillId;
  kind: 'recognition' | 'scenario';
  prompt: string;
  options: DiagnosticOption[];
  correct_option: string; // server-side only — never returned to the client
}

/** Client-safe view of an item — strips the answer key. */
export type PublicDiagnosticItem = Omit<DiagnosticItem, 'correct_option'>;

export function toPublicItem(item: DiagnosticItem): PublicDiagnosticItem {
  const { correct_option, ...rest } = item;
  return rest;
}

const bank: Record<ArchitectureSkillId, DiagnosticItem[]> = {
  llm_core: [
    {
      id: 'llm_core_recognition_1', skill_id: 'llm_core', kind: 'recognition',
      prompt: 'A model’s "context window" refers to:',
      options: [
        { id: 'a', label: 'How much text the model can consider at once' },
        { id: 'b', label: 'How fast the model responds' },
        { id: 'c', label: 'The model’s training budget' },
      ],
      correct_option: 'a',
    },
    {
      id: 'llm_core_scenario_1', skill_id: 'llm_core', kind: 'scenario',
      prompt: 'You need lower latency and lower cost, and can tolerate slightly less capability. Which lever do you reach for first?',
      options: [
        { id: 'a', label: 'A smaller/cheaper model for this task' },
        { id: 'b', label: 'A larger model with a higher temperature' },
        { id: 'c', label: 'More retries on failure' },
      ],
      correct_option: 'a',
    },
  ],
  prompting: [
    {
      id: 'prompting_recognition_1', skill_id: 'prompting', kind: 'recognition',
      prompt: 'A reusable prompt is easiest to test and version when it:',
      options: [
        { id: 'a', label: 'Is a single hardcoded string mixed into application code' },
        { id: 'b', label: 'Is decomposed into named, separately-versioned parts' },
        { id: 'c', label: 'Is rewritten from scratch for every new feature' },
      ],
      correct_option: 'b',
    },
    {
      id: 'prompting_scenario_1', skill_id: 'prompting', kind: 'scenario',
      prompt: 'Outputs are inconsistent across runs of the same prompt. What do you try first?',
      options: [
        { id: 'a', label: 'Add structured output constraints and test with fixed examples' },
        { id: 'b', label: 'Increase the temperature' },
        { id: 'c', label: 'Ignore it — inconsistency is expected' },
      ],
      correct_option: 'a',
    },
  ],
  rag: [
    {
      id: 'rag_recognition_1', skill_id: 'rag', kind: 'recognition',
      prompt: '"Grounding" in a RAG system means:',
      options: [
        { id: 'a', label: 'Tying generated answers to retrieved source content' },
        { id: 'b', label: 'Reducing the model’s temperature to 0' },
        { id: 'c', label: 'Caching every past answer' },
      ],
      correct_option: 'a',
    },
    {
      id: 'rag_scenario_1', skill_id: 'rag', kind: 'scenario',
      prompt: 'Answers cite the wrong section of a long document. What do you look at first?',
      options: [
        { id: 'a', label: 'Chunking strategy and retrieval relevance' },
        { id: 'b', label: 'The model’s max token limit' },
        { id: 'c', label: 'The UI’s font size' },
      ],
      correct_option: 'a',
    },
  ],
  vectors: [
    {
      id: 'vectors_recognition_1', skill_id: 'vectors', kind: 'recognition',
      prompt: 'A vector embedding represents text as:',
      options: [
        { id: 'a', label: 'A numeric point capturing semantic meaning' },
        { id: 'b', label: 'A compressed copy of the original text' },
        { id: 'c', label: 'A hash used only for deduplication' },
      ],
      correct_option: 'a',
    },
    {
      id: 'vectors_scenario_1', skill_id: 'vectors', kind: 'scenario',
      prompt: 'Semantic search alone misses exact product-code matches. What helps?',
      options: [
        { id: 'a', label: 'Hybrid search combining vector + keyword retrieval' },
        { id: 'b', label: 'A larger embedding model only' },
        { id: 'c', label: 'Disabling retrieval entirely' },
      ],
      correct_option: 'a',
    },
  ],
  agents_mcp: [
    {
      id: 'agents_mcp_recognition_1', skill_id: 'agents_mcp', kind: 'recognition',
      prompt: 'MCP (Model Context Protocol) primarily standardizes:',
      options: [
        { id: 'a', label: 'How a model connects to external tools/data sources' },
        { id: 'b', label: 'How a model is trained' },
        { id: 'c', label: 'How a UI renders chat bubbles' },
      ],
      correct_option: 'a',
    },
    {
      id: 'agents_mcp_scenario_1', skill_id: 'agents_mcp', kind: 'scenario',
      prompt: 'An agent needs to call a tool with side effects (e.g. sending an email) reliably. What matters most?',
      options: [
        { id: 'a', label: 'Clear tool boundaries and idempotent execution' },
        { id: 'b', label: 'A longer system prompt' },
        { id: 'c', label: 'Running the tool twice for safety' },
      ],
      correct_option: 'a',
    },
  ],
  eval_guardrails: [
    {
      id: 'eval_guardrails_recognition_1', skill_id: 'eval_guardrails', kind: 'recognition',
      prompt: 'An "eval" in an AI system is best described as:',
      options: [
        { id: 'a', label: 'A repeatable, scored check of system behavior against expectations' },
        { id: 'b', label: 'A one-time manual test before launch' },
        { id: 'c', label: 'A log file reviewed only after an incident' },
      ],
      correct_option: 'a',
    },
    {
      id: 'eval_guardrails_scenario_1', skill_id: 'eval_guardrails', kind: 'scenario',
      prompt: 'The system is uncertain about a high-stakes answer. What is the safest default behavior?',
      options: [
        { id: 'a', label: 'Abstain or escalate rather than guess' },
        { id: 'b', label: 'Always answer confidently' },
        { id: 'c', label: 'Pick the most common answer type' },
      ],
      correct_option: 'a',
    },
  ],
  system_design: [
    {
      id: 'system_design_recognition_1', skill_id: 'system_design', kind: 'recognition',
      prompt: 'A clear system boundary primarily helps with:',
      options: [
        { id: 'a', label: 'Reasoning about failure modes and ownership' },
        { id: 'b', label: 'Making the UI look more polished' },
        { id: 'c', label: 'Reducing the number of files in a repo' },
      ],
      correct_option: 'a',
    },
    {
      id: 'system_design_scenario_1', skill_id: 'system_design', kind: 'scenario',
      prompt: 'Two services need the same data and are drifting out of sync. What’s the architectural fix?',
      options: [
        { id: 'a', label: 'A single source of truth with clear ownership' },
        { id: 'b', label: 'Copy the data more often' },
        { id: 'c', label: 'Add a cache in front of both' },
      ],
      correct_option: 'a',
    },
  ],
  context_engineering: [
    {
      id: 'context_engineering_recognition_1', skill_id: 'context_engineering', kind: 'recognition',
      prompt: 'Context engineering is mainly about:',
      options: [
        { id: 'a', label: 'Selecting and structuring what the model sees, not just what it’s told' },
        { id: 'b', label: 'Increasing the model’s parameter count' },
        { id: 'c', label: 'Choosing a UI color scheme' },
      ],
      correct_option: 'a',
    },
    {
      id: 'context_engineering_scenario_1', skill_id: 'context_engineering', kind: 'scenario',
      prompt: 'A long-running agent session starts giving worse answers over time. What do you check first?',
      options: [
        { id: 'a', label: 'Whether stale/irrelevant context is crowding out what matters' },
        { id: 'b', label: 'Whether the font rendered correctly' },
        { id: 'c', label: 'Whether the session ID is a UUID' },
      ],
      correct_option: 'a',
    },
  ],
  governance: [
    {
      id: 'governance_recognition_1', skill_id: 'governance', kind: 'recognition',
      prompt: 'Human-in-the-loop (HITL) review is most important for:',
      options: [
        { id: 'a', label: 'High-stakes or irreversible decisions' },
        { id: 'b', label: 'Every single model output, regardless of stakes' },
        { id: 'c', label: 'Only cosmetic UI changes' },
      ],
      correct_option: 'a',
    },
    {
      id: 'governance_scenario_1', skill_id: 'governance', kind: 'scenario',
      prompt: 'An AI system will access sensitive customer data. What’s the first governance question?',
      options: [
        { id: 'a', label: 'Who is authorized to see it, and is that enforced and audited?' },
        { id: 'b', label: 'How fast can the query run?' },
        { id: 'c', label: 'What color should the alert banner be?' },
      ],
      correct_option: 'a',
    },
  ],
  deploy_ops: [
    {
      id: 'deploy_ops_recognition_1', skill_id: 'deploy_ops', kind: 'recognition',
      prompt: 'A production deploy without a rollback plan is best described as:',
      options: [
        { id: 'a', label: 'Not production-ready' },
        { id: 'b', label: 'Fine as long as tests passed locally' },
        { id: 'c', label: 'Only a concern for large companies' },
      ],
      correct_option: 'a',
    },
    {
      id: 'deploy_ops_scenario_1', skill_id: 'deploy_ops', kind: 'scenario',
      prompt: 'A new deploy causes a spike in errors. What’s the right immediate move?',
      options: [
        { id: 'a', label: 'Roll back to the last known-good release, then investigate' },
        { id: 'b', label: 'Keep the new version and wait to see if it improves' },
        { id: 'c', label: 'Deploy again immediately with a different config' },
      ],
      correct_option: 'a',
    },
  ],
};

export function getDiagnosticItems(skillId: ArchitectureSkillId | string): DiagnosticItem[] {
  return (bank as Record<string, DiagnosticItem[]>)[skillId] ?? [];
}

export function isValidDiagnosticSkillId(skillId: string): skillId is ArchitectureSkillId {
  return (ARCHITECTURE_SKILL_IDS as readonly string[]).includes(skillId);
}
