/**
 * Automated Mode Tagging Service
 *
 * Assigns mode arrays (mvp/production/enterprise/autonomous) to BPs and
 * requirements using rule-based keyword matching + agent signal analysis.
 *
 * Hierarchy: MVP ⊂ PRODUCTION ⊂ ENTERPRISE ⊂ AUTONOMOUS
 * A requirement tagged 'enterprise' automatically includes 'autonomous'.
 */
import Capability from '../models/Capability';
import { RequirementsMap } from '../models';
import CapabilityAgentMap from '../models/CapabilityAgentMap';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'mvp' | 'production' | 'enterprise' | 'autonomous';

const MODE_HIERARCHY: Mode[] = ['mvp', 'production', 'enterprise', 'autonomous'];

interface TagResult {
  id: string;
  name: string;
  type: 'bp' | 'requirement';
  suggestedModes: Mode[];
  confidence: number;
  matchedRules: string[];
  applied: boolean;
}

export interface AutoTagResult {
  bps_analyzed: number;
  bps_tagged: number;
  requirements_analyzed: number;
  requirements_tagged: number;
  confidence_avg: number;
  low_confidence: number;  // count with confidence < 50
  details: TagResult[];
}

// ---------------------------------------------------------------------------
// Keyword Rules
// ---------------------------------------------------------------------------

const KEYWORD_RULES: Array<{ minMode: Mode; keywords: string[]; label: string }> = [
  // MVP — basic CRUD and display
  { minMode: 'mvp', label: 'basic_crud', keywords: ['basic', 'simple', 'create', 'read', 'update', 'delete', 'form', 'display', 'list', 'view', 'page', 'input', 'submit', 'store', 'save', 'fetch', 'show'] },
  // PRODUCTION — automation and workflows
  { minMode: 'production', label: 'automation', keywords: ['automation', 'automate', 'schedule', 'workflow', 'pipeline', 'retry', 'validation', 'validate', 'queue', 'batch', 'trigger', 'cron', 'notification', 'alert', 'email', 'sms'] },
  // ENTERPRISE — compliance and governance
  { minMode: 'enterprise', label: 'compliance', keywords: ['audit', 'compliance', 'permission', 'security', 'monitoring', 'logging', 'governance', 'role', 'access control', 'encryption', 'gdpr', 'pii', 'retention', 'backup', 'disaster recovery', 'sla', 'uptime'] },
  // AUTONOMOUS — intelligence and optimization
  { minMode: 'autonomous', label: 'intelligence', keywords: ['optimize', 'optimization', 'learn', 'predict', 'predictive', 'adaptive', 'ai', 'intelligent', 'feedback', 'self-healing', 'auto-remediation', 'machine learning', 'ml', 'recommendation', 'personalization'] },
];

// Agent-based mode signals
const AGENT_MODE_SIGNALS: Record<string, Mode> = {
  // Scoring/basic agents → production
  lead_scoring: 'production',
  campaign_orchestrator: 'production',
  content_generation: 'production',
  ab_test_agent: 'production',
  // Compliance/governance agents → enterprise
  governance_agent: 'enterprise',
  audit_agent: 'enterprise',
  risk_evaluator: 'enterprise',
  compliance_agent: 'enterprise',
  // Intelligence/optimization agents → autonomous
  revenue_optimization: 'autonomous',
  cost_optimization: 'autonomous',
  growth_experiment: 'autonomous',
  strategic_intelligence: 'autonomous',
  problem_discovery: 'autonomous',
  self_healing_engine: 'autonomous',
};

// ---------------------------------------------------------------------------
// Tagging Logic
// ---------------------------------------------------------------------------

function modesFromMinLevel(minMode: Mode): Mode[] {
  const idx = MODE_HIERARCHY.indexOf(minMode);
  return MODE_HIERARCHY.slice(idx);
}

function tagText(text: string): { modes: Mode[]; confidence: number; matchedRules: string[] } {
  const lower = (text || '').toLowerCase();
  const matchedRules: string[] = [];
  let highestMode: Mode = 'mvp';
  let matchCount = 0;

  for (const rule of KEYWORD_RULES) {
    const hits = rule.keywords.filter(kw => lower.includes(kw));
    if (hits.length > 0) {
      matchedRules.push(`${rule.label}(${hits.length})`);
      matchCount += hits.length;
      const ruleIdx = MODE_HIERARCHY.indexOf(rule.minMode);
      const currentIdx = MODE_HIERARCHY.indexOf(highestMode);
      if (ruleIdx > currentIdx) highestMode = rule.minMode;
    }
  }

  // Confidence: based on number of keyword matches (more = higher confidence)
  const confidence = Math.min(100, matchCount === 0 ? 30 : 40 + matchCount * 10);

  // The modes array includes the matched level and everything above it
  // Plus MVP is always included (everything is at least MVP)
  const modes = [...new Set(['mvp' as Mode, ...modesFromMinLevel(highestMode)])];

  return { modes, confidence, matchedRules };
}

async function getAgentModeSignals(capabilityId: string): Promise<{ agentMode: Mode | null; agents: string[] }> {
  try {
    const maps = await CapabilityAgentMap.findAll({
      where: { capability_id: capabilityId, status: 'active' },
      attributes: ['agent_name'],
    });

    let highest: Mode | null = null;
    const agents: string[] = [];

    for (const map of maps) {
      const signal = AGENT_MODE_SIGNALS[map.agent_name];
      if (signal) {
        agents.push(map.agent_name);
        const sigIdx = MODE_HIERARCHY.indexOf(signal);
        const curIdx = highest ? MODE_HIERARCHY.indexOf(highest) : -1;
        if (sigIdx > curIdx) highest = signal;
      }
    }

    return { agentMode: highest, agents };
  } catch {
    return { agentMode: null, agents: [] };
  }
}

// ---------------------------------------------------------------------------
// Main Auto-Tag Function
// ---------------------------------------------------------------------------

export async function autoTagModes(options: {
  projectId: string;
  dryRun?: boolean;
  overwrite?: boolean;
}): Promise<AutoTagResult> {
  const { projectId, dryRun = false, overwrite = false } = options;
  const details: TagResult[] = [];
  let bpsTagged = 0;
  let reqsTagged = 0;

  // Load all BPs for this project
  const bps = await Capability.findAll({ where: { project_id: projectId } });
  const reqs = await RequirementsMap.findAll({ where: { project_id: projectId } });

  // Tag Business Processes
  for (const bp of bps) {
    if ((bp as any).modes && !overwrite) {
      details.push({ id: bp.id, name: bp.name, type: 'bp', suggestedModes: (bp as any).modes, confidence: 100, matchedRules: ['existing'], applied: false });
      continue;
    }

    // Combine BP name + description for keyword matching
    const text = `${bp.name} ${bp.description || ''}`;
    const { modes, confidence, matchedRules } = tagText(text);

    // Enhance with agent signals
    const { agentMode, agents } = await getAgentModeSignals(bp.id);
    let finalModes = modes;
    let finalConfidence = confidence;

    if (agentMode) {
      const agentModes = modesFromMinLevel(agentMode);
      finalModes = [...new Set([...modes, ...agentModes])].sort((a, b) => MODE_HIERARCHY.indexOf(a) - MODE_HIERARCHY.indexOf(b));
      finalConfidence = Math.min(100, confidence + agents.length * 10);
      matchedRules.push(`agents(${agents.join(',')})`);
    }

    if (!dryRun) {
      (bp as any).modes = finalModes;
      (bp as any).changed('modes', true);
      await bp.save();
      bpsTagged++;
    }

    details.push({ id: bp.id, name: bp.name, type: 'bp', suggestedModes: finalModes, confidence: finalConfidence, matchedRules, applied: !dryRun });
  }

  // Tag Requirements
  for (const req of reqs) {
    if ((req as any).modes && !overwrite) {
      continue; // Skip already tagged
    }

    const { modes, confidence, matchedRules } = tagText(req.requirement_text || '');

    if (!dryRun) {
      (req as any).modes = modes;
      await req.save();
      reqsTagged++;
    }

    // Only include in details if notable (not default)
    if (confidence > 40 || modes.length !== 4) {
      details.push({ id: req.id, name: req.requirement_key, type: 'requirement', suggestedModes: modes, confidence, matchedRules, applied: !dryRun });
    }
  }

  const allConfidences = details.map(d => d.confidence);
  const confidenceAvg = allConfidences.length > 0 ? Math.round(allConfidences.reduce((s, c) => s + c, 0) / allConfidences.length) : 0;
  const lowConfidence = allConfidences.filter(c => c < 50).length;

  console.log(`[ModeTagging] ${dryRun ? 'DRY RUN:' : 'Applied:'} ${bps.length} BPs (${bpsTagged} tagged), ${reqs.length} reqs (${reqsTagged} tagged), avg confidence: ${confidenceAvg}%, ${lowConfidence} low-confidence`);

  return {
    bps_analyzed: bps.length,
    bps_tagged: bpsTagged,
    requirements_analyzed: reqs.length,
    requirements_tagged: reqsTagged,
    confidence_avg: confidenceAvg,
    low_confidence: lowConfidence,
    details: details.slice(0, 100), // Cap detail output
  };
}
