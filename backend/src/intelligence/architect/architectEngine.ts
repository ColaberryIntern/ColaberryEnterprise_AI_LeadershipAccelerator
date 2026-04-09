/**
 * Architect Engine — conversational, context-aware system planning.
 *
 * Manages multi-turn conversation to refine user intent, assess what exists
 * in the system, decide whether to reuse/extend/create BPs, and generate
 * Claude Code PLAN prompts through the existing promptGenerator.
 *
 * The LLM is ONLY used for:
 * - Intent classification (Step 1)
 * - Clarification question generation (Steps 2-4)
 * - Requirement extraction from conversation
 *
 * All execution decisions are deterministic.
 */

export type Phase = 'identify' | 'clarify' | 'assess' | 'plan' | 'confirm' | 'complete';

export interface ConversationTurn {
  role: 'user' | 'system';
  message: string;
  options?: { label: string; value: string }[];
  examples?: string;
  summary?: any;
  prompt?: any;
  timestamp: string;
}

export interface ArchitectIntent {
  intent_type: 'ui_improvement' | 'new_feature' | 'system_change' | 'bug_fix' | 'integration';
  target_description: string;
  specific_requirements: string[];
  scope: 'single_step' | 'multi_step';
  mode_context: string;
  priority: 'high' | 'medium' | 'low';
}

export interface SystemAssessment {
  matching_bps: { id: string; name: string; similarity: number; coverage: number; maturity: number }[];
  related_files: string[];
  existing_requirements: { key: string; text: string; status: string }[];
  recommended_action: 'reuse' | 'extend' | 'create_new';
  reason: string;
}

export interface BPDecision {
  decision: 'reuse' | 'extend' | 'create_new';
  target_bp_id: string | null;
  target_bp_name: string | null;
  match_confidence: number;
  match_reason: string;
  new_bp_name: string | null;
  new_bp_requirements: string[];
}

export interface ConversationState {
  session_id: string;
  project_id: string;
  turns: ConversationTurn[];
  phase: Phase;
  turn_count: number;
  intent: ArchitectIntent | null;
  assessment: SystemAssessment | null;
  bp_decision: BPDecision | null;
  prompt_output: any | null;
}

export interface TurnResponse {
  phase: Phase;
  message: string;
  options?: { label: string; value: string }[];
  examples?: string;
  summary?: any;
  prompt?: any;
  action_required?: 'confirm' | 'select' | 'input' | 'copy_prompt' | null;
  created_bp?: { id: string; name: string; requirements_count: number } | null;
}

/**
 * Start a new architect session.
 */
export function createSession(sessionId: string, projectId: string): ConversationState {
  return {
    session_id: sessionId,
    project_id: projectId,
    turns: [],
    phase: 'identify',
    turn_count: 0,
    intent: null,
    assessment: null,
    bp_decision: null,
    prompt_output: null,
  };
}

/**
 * Process one turn of conversation. Returns the system's response.
 */
export async function processArchitectTurn(
  state: ConversationState,
  userInput: string,
  projectMode: string
): Promise<{ state: ConversationState; response: TurnResponse }> {
  // Record user turn
  state.turns.push({ role: 'user', message: userInput, timestamp: new Date().toISOString() });
  state.turn_count++;

  let response: TurnResponse;

  switch (state.phase) {
    case 'identify':
      response = await handleIdentify(state, userInput, projectMode);
      break;
    case 'clarify':
      response = await handleClarify(state, userInput, projectMode);
      break;
    case 'assess':
      response = await handleAssess(state, userInput);
      break;
    case 'plan':
      response = await handlePlan(state);
      break;
    case 'confirm':
      response = await handleConfirm(state, userInput);
      break;
    default:
      response = { phase: state.phase, message: 'Session complete.', action_required: null };
  }

  // Record system turn
  state.turns.push({
    role: 'system',
    message: response.message,
    options: response.options,
    examples: response.examples,
    summary: response.summary,
    prompt: response.prompt,
    timestamp: new Date().toISOString(),
  });

  // Force summary after 5 user turns
  if (state.turn_count >= 5 && state.phase === 'clarify') {
    state.phase = 'assess';
  }

  return { state, response };
}

// ─── Phase Handlers ──────────────────────────────────────────────

async function handleIdentify(state: ConversationState, input: string, mode: string): Promise<TurnResponse> {
  // Classify intent type via LLM
  const intentType = await classifyIntentType(input);

  state.intent = {
    intent_type: intentType,
    target_description: input,
    specific_requirements: [],
    scope: 'single_step',
    mode_context: mode,
    priority: 'high',
  };

  state.phase = 'clarify';

  const questions: Record<string, { message: string; options: { label: string; value: string }[]; examples: string }> = {
    ui_improvement: {
      message: 'Got it — you want to improve the UI. Which area specifically?',
      options: [
        { label: 'Page Layout', value: 'layout' },
        { label: 'Data Visualization', value: 'charts' },
        { label: 'Navigation', value: 'navigation' },
        { label: 'Forms & Input', value: 'forms' },
        { label: 'Performance', value: 'performance' },
      ],
      examples: 'e.g., "the visitors page needs charts", "dashboard header is too cluttered", "add a sidebar filter"',
    },
    new_feature: {
      message: 'You want to build something new. What should it do? Give me 2-3 specific capabilities.',
      options: [
        { label: 'Dashboard / Analytics', value: 'dashboard' },
        { label: 'CRUD Management', value: 'crud' },
        { label: 'Notification System', value: 'notifications' },
        { label: 'Integration / API', value: 'integration' },
        { label: 'AI / Automation', value: 'automation' },
      ],
      examples: 'e.g., "real-time visitor analytics with charts and filters", "email notification when leads convert"',
    },
    system_change: {
      message: 'You want to change system behavior. What specifically should change?',
      options: [
        { label: 'Business Logic', value: 'logic' },
        { label: 'Data Model', value: 'data' },
        { label: 'Permissions / Access', value: 'permissions' },
        { label: 'Workflow / Process', value: 'workflow' },
      ],
      examples: 'e.g., "change how lead scoring works", "add approval step before deployment"',
    },
    bug_fix: {
      message: 'You found an issue. Can you describe what\'s wrong and what should happen instead?',
      options: [
        { label: 'Display Issue', value: 'display' },
        { label: 'Data Issue', value: 'data' },
        { label: 'Broken Feature', value: 'broken' },
        { label: 'Performance Issue', value: 'slow' },
      ],
      examples: 'e.g., "the chart shows wrong data", "page loads too slow", "button does nothing"',
    },
    integration: {
      message: 'You want to connect with something. What system or service?',
      options: [
        { label: 'External API', value: 'api' },
        { label: 'Database', value: 'database' },
        { label: 'Third-party Service', value: 'service' },
        { label: 'Internal Module', value: 'internal' },
      ],
      examples: 'e.g., "connect to Stripe for payments", "sync with Slack for notifications"',
    },
  };

  const q = questions[intentType] || questions.new_feature;
  return { phase: 'clarify', ...q, action_required: 'select' };
}

async function handleClarify(state: ConversationState, input: string, mode: string): Promise<TurnResponse> {
  // Add input to requirements
  if (state.intent) {
    state.intent.specific_requirements.push(input);
    state.intent.target_description += ' — ' + input;
  }

  // After 2+ clarification turns with sufficient detail, move to assess
  const reqCount = state.intent?.specific_requirements.length || 0;
  if (reqCount >= 2) {
    state.phase = 'assess';
    return handleAssess(state, input);
  }

  // Ask one more clarification question
  const followUp = await generateClarificationQuestion(state, mode);
  return { phase: 'clarify', ...followUp, action_required: 'select' };
}

async function handleAssess(state: ConversationState, _input: string): Promise<TurnResponse> {
  // Run system assessment
  const assessment = await assessSystem(state.project_id, state.intent!);
  state.assessment = assessment;

  // Determine BP decision
  if (assessment.matching_bps.length > 0 && assessment.matching_bps[0].similarity > 0.7) {
    const best = assessment.matching_bps[0];
    state.bp_decision = {
      decision: best.coverage > 50 ? 'reuse' : 'extend',
      target_bp_id: best.id,
      target_bp_name: best.name,
      match_confidence: best.similarity,
      match_reason: `"${best.name}" is ${Math.round(best.similarity * 100)}% related (coverage: ${best.coverage}%)`,
      new_bp_name: null,
      new_bp_requirements: [],
    };
  } else if (assessment.matching_bps.length > 0 && assessment.matching_bps[0].similarity > 0.4) {
    const best = assessment.matching_bps[0];
    state.bp_decision = {
      decision: 'extend',
      target_bp_id: best.id,
      target_bp_name: best.name,
      match_confidence: best.similarity,
      match_reason: `"${best.name}" partially matches — extending with new requirements`,
      new_bp_name: null,
      new_bp_requirements: state.intent?.specific_requirements || [],
    };
  } else {
    state.bp_decision = {
      decision: 'create_new',
      target_bp_id: null,
      target_bp_name: null,
      match_confidence: 0,
      match_reason: 'No existing process matches — creating new',
      new_bp_name: state.intent?.target_description.substring(0, 80) || 'New Process',
      new_bp_requirements: state.intent?.specific_requirements || [],
    };
  }

  state.phase = 'plan';
  return handlePlan(state);
}

async function handlePlan(state: ConversationState): Promise<TurnResponse> {
  const d = state.bp_decision!;
  const intent = state.intent!;

  let summary: any;
  let message: string;

  if (d.decision === 'reuse') {
    summary = {
      action: 'Improve existing process',
      process: d.target_bp_name,
      confidence: `${Math.round(d.match_confidence * 100)}% match`,
      what_happens: `Generate improvement prompt for "${d.target_bp_name}"`,
      requirements: intent.specific_requirements,
    };
    message = `I found an existing process that matches: **${d.target_bp_name}** (${Math.round(d.match_confidence * 100)}% match).\n\nI'll generate an improvement prompt targeting this process.`;
  } else if (d.decision === 'extend') {
    summary = {
      action: 'Extend existing process',
      process: d.target_bp_name,
      confidence: `${Math.round(d.match_confidence * 100)}% match`,
      what_happens: `Add ${intent.specific_requirements.length} requirements to "${d.target_bp_name}" and generate implementation prompt`,
      requirements: intent.specific_requirements,
    };
    message = `I found a related process: **${d.target_bp_name}**.\n\nI'll add your requirements to it and generate an implementation prompt.`;
  } else {
    summary = {
      action: 'Create new business process',
      process: d.new_bp_name,
      what_happens: `Create new process with ${intent.specific_requirements.length} requirements, generate Step 1 prompt`,
      requirements: intent.specific_requirements,
      mode: intent.mode_context,
    };
    message = `This is a new capability. I'll create **"${d.new_bp_name}"** with ${intent.specific_requirements.length} requirements.\n\nWe'll start with Step 1 only.`;
  }

  state.phase = 'confirm';
  return { phase: 'plan', message, summary, action_required: 'confirm' };
}

async function handleConfirm(state: ConversationState, input: string): Promise<TurnResponse> {
  const normalized = input.toLowerCase().trim();
  if (normalized === 'cancel' || normalized === 'no' || normalized === 'abort') {
    state.phase = 'complete';
    return { phase: 'complete', message: 'Cancelled. No changes made.', action_required: null };
  }

  if (normalized !== 'confirm' && normalized !== 'yes' && normalized !== 'ok' && normalized !== 'go') {
    return { phase: 'confirm', message: 'Please confirm to proceed, or say "cancel" to abort.', action_required: 'confirm' };
  }

  // Execute the plan
  const d = state.bp_decision!;
  const intent = state.intent!;
  let createdBP: TurnResponse['created_bp'] = null;
  let targetBPId = d.target_bp_id;

  // Create new BP if needed
  if (d.decision === 'create_new') {
    try {
      const { Capability, Feature, RequirementsMap, Project } = await import('../../models');
      const project = await Project.findByPk(state.project_id);

      const cap = await Capability.create({
        project_id: state.project_id,
        name: d.new_bp_name,
        description: intent.target_description,
        status: 'active',
        priority: 'high',
        sort_order: 0,
        source: 'architect',
        lifecycle_status: 'active',
        applicability_status: 'active',
        execution_profile: (project as any)?.target_mode || 'production',
      } as any);

      const feat = await Feature.create({
        capability_id: cap.id,
        name: 'Core Functionality',
        description: intent.target_description,
        status: 'active',
        priority: 'medium',
        sort_order: 0,
        source: 'architect',
      } as any);

      for (let i = 0; i < d.new_bp_requirements.length; i++) {
        await RequirementsMap.create({
          project_id: state.project_id,
          capability_id: cap.id,
          feature_id: feat.id,
          requirement_key: `REQ-ARCH-${Date.now()}-${i}`,
          requirement_text: d.new_bp_requirements[i],
          status: 'unmatched',
          confidence_score: 0,
        });
      }

      targetBPId = cap.id;
      createdBP = { id: cap.id, name: d.new_bp_name!, requirements_count: d.new_bp_requirements.length };
    } catch (err: any) {
      state.phase = 'complete';
      return { phase: 'complete', message: `Failed to create process: ${err.message}`, action_required: null };
    }
  }

  // Extend existing BP if needed
  if (d.decision === 'extend' && targetBPId && d.new_bp_requirements.length > 0) {
    try {
      const { RequirementsMap, Feature } = await import('../../models');
      const feat = await Feature.findOne({ where: { capability_id: targetBPId }, order: [['sort_order', 'ASC']] });
      if (feat) {
        for (let i = 0; i < d.new_bp_requirements.length; i++) {
          await RequirementsMap.create({
            project_id: state.project_id,
            capability_id: targetBPId,
            feature_id: feat.id,
            requirement_key: `REQ-ARCH-${Date.now()}-${i}`,
            requirement_text: d.new_bp_requirements[i],
            status: 'unmatched',
            confidence_score: 0,
          });
        }
      }
    } catch { /* non-critical */ }
  }

  // Generate prompt
  let prompt = null;
  if (targetBPId) {
    try {
      const { generateImprovementPrompt } = await import('../promptGenerator');
      // Determine target based on intent
      const target = intent.intent_type === 'ui_improvement' ? 'frontend_exposure' : 'requirement_implementation';

      // For requirement_implementation, pass requirements as extraContext
      let extraContext: any = undefined;
      if (target === 'requirement_implementation') {
        const { RequirementsMap } = await import('../../models');
        const reqs = await RequirementsMap.findAll({
          where: { capability_id: targetBPId },
          attributes: ['requirement_text', 'status', 'confidence_score'],
          limit: 50,
        });
        const needsWork = reqs.filter((r: any) =>
          r.status === 'unmatched' || r.status === 'not_started' ||
          (r.status === 'matched' && (r.confidence_score || 0) < 0.7)
        );
        extraContext = { unmappedRequirements: (needsWork.length > 0 ? needsWork : reqs).map((r: any) => ({ requirement_text: r.requirement_text })) };
      }

      prompt = await generateImprovementPrompt(targetBPId, target, extraContext);
      state.prompt_output = prompt;
    } catch (err: any) {
      prompt = { error: err.message };
    }
  }

  state.phase = 'complete';

  const actionLabel = d.decision === 'create_new' ? 'Created' : d.decision === 'extend' ? 'Extended' : 'Targeting';
  return {
    phase: 'complete',
    message: `${actionLabel} "${d.target_bp_name || d.new_bp_name}".\n\nHere's your Claude Code prompt — copy it and run in PLAN MODE.`,
    prompt,
    created_bp: createdBP,
    action_required: 'copy_prompt',
  };
}

// ─── Helpers ──────────────────────────────────────────────

async function classifyIntentType(input: string): Promise<ArchitectIntent['intent_type']> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0, max_tokens: 50,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Classify user input into exactly ONE type. Respond: {"type":"ui_improvement|new_feature|system_change|bug_fix|integration"}\n\nui_improvement = change appearance/layout/design\nnew_feature = build something that doesn\'t exist\nsystem_change = modify behavior/logic/workflow\nbug_fix = fix something broken\nintegration = connect with external system' },
        { role: 'user', content: input },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
    return parsed.type || 'new_feature';
  } catch {
    // Fallback: keyword-based classification
    const lower = input.toLowerCase();
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('broken')) return 'bug_fix';
    if (lower.includes('page') || lower.includes('design') || lower.includes('ui') || lower.includes('layout')) return 'ui_improvement';
    if (lower.includes('connect') || lower.includes('integrate') || lower.includes('api')) return 'integration';
    if (lower.includes('change') || lower.includes('modify') || lower.includes('update')) return 'system_change';
    return 'new_feature';
  }
}

async function generateClarificationQuestion(
  state: ConversationState,
  mode: string
): Promise<{ message: string; options: { label: string; value: string }[]; examples: string }> {
  const intent = state.intent!;
  const reqCount = intent.specific_requirements.length;

  // Mode-aware questions
  if (mode === 'mvp' && reqCount === 1) {
    return {
      message: 'Since you\'re in MVP mode — what\'s the minimum that would make this useful?',
      options: [
        { label: 'Basic data display', value: 'basic display with table' },
        { label: 'Simple CRUD', value: 'create, read, update, delete operations' },
        { label: 'Read-only view', value: 'read-only dashboard view' },
      ],
      examples: 'Keep it simple — we can enhance later',
    };
  }

  if (reqCount === 1) {
    return {
      message: 'What specific data or functionality should this include?',
      options: [
        { label: 'Real-time Data', value: 'real-time data updates and live metrics' },
        { label: 'Historical Trends', value: 'historical trend charts and comparisons' },
        { label: 'Export & Reports', value: 'data export and report generation' },
        { label: 'Alerts & Notifications', value: 'alert thresholds and notifications' },
      ],
      examples: 'e.g., "show visitor count, bounce rate, and conversion funnel"',
    };
  }

  return {
    message: 'Any specific technical requirements or constraints?',
    options: [
      { label: 'Use existing data', value: 'must use existing database tables' },
      { label: 'Real-time updates', value: 'needs WebSocket or polling for live data' },
      { label: 'Mobile responsive', value: 'must work on mobile devices' },
      { label: 'No special requirements', value: 'standard implementation is fine' },
    ],
    examples: 'e.g., "must use the visitor_sessions table", "needs to load in under 2 seconds"',
  };
}

async function assessSystem(projectId: string, intent: ArchitectIntent): Promise<SystemAssessment> {
  const matching_bps: SystemAssessment['matching_bps'] = [];
  const related_files: string[] = [];
  const existing_requirements: SystemAssessment['existing_requirements'] = [];

  try {
    // 1. Find matching BPs by keyword overlap
    const { Capability } = await import('../../models');
    const caps = await Capability.findAll({ where: { project_id: projectId }, attributes: ['id', 'name'] });
    const intentWords = intent.target_description.toLowerCase().split(/\W+/).filter(w => w.length > 3);

    for (const cap of caps) {
      const capWords = (cap as any).name.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
      const overlap = intentWords.filter(w => capWords.some((cw: string) => cw.includes(w) || w.includes(cw)));
      const similarity = intentWords.length > 0 ? overlap.length / intentWords.length : 0;
      if (similarity > 0.2) {
        matching_bps.push({ id: (cap as any).id, name: (cap as any).name, similarity, coverage: 0, maturity: 0 });
      }
    }

    // Sort by similarity
    matching_bps.sort((a, b) => b.similarity - a.similarity);

    // 2. Check existing requirements
    const { RequirementsMap } = await import('../../models');
    const reqs = await RequirementsMap.findAll({
      where: { project_id: projectId },
      attributes: ['requirement_key', 'requirement_text', 'status'],
      limit: 200,
    });
    for (const req of reqs) {
      const text = ((req as any).requirement_text || '').toLowerCase();
      if (intentWords.some(w => text.includes(w))) {
        existing_requirements.push({ key: (req as any).requirement_key, text: (req as any).requirement_text, status: (req as any).status });
      }
    }
  } catch { /* non-critical */ }

  // Determine recommendation
  let recommended_action: SystemAssessment['recommended_action'] = 'create_new';
  let reason = 'No matching processes found';

  if (matching_bps.length > 0 && matching_bps[0].similarity > 0.7) {
    recommended_action = 'reuse';
    reason = `"${matching_bps[0].name}" matches with ${Math.round(matching_bps[0].similarity * 100)}% confidence`;
  } else if (matching_bps.length > 0 && matching_bps[0].similarity > 0.4) {
    recommended_action = 'extend';
    reason = `"${matching_bps[0].name}" partially matches — can be extended`;
  }

  return { matching_bps: matching_bps.slice(0, 5), related_files, existing_requirements: existing_requirements.slice(0, 10), recommended_action, reason };
}
