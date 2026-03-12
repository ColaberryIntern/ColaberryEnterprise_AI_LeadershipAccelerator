import { Op } from 'sequelize';
import { Department, DepartmentEvent, ChatMessage } from '../../../models';
import { createTicket } from '../../ticketService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AISafetyMonitorAgent';
const WINDOW_MINUTES = 5;

interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  // System role injection
  { name: 'System Prompt Override', pattern: /(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/i, severity: 'critical' },
  { name: 'Role Impersonation', pattern: /(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you\s+are)|imagine\s+you\s+are)\s+(?:a\s+)?(?:system|admin|developer|root)/i, severity: 'critical' },
  { name: 'System Message Injection', pattern: /\[system\]|\[INST\]|<\|im_start\|>|<<SYS>>|<system>/i, severity: 'critical' },
  // Instruction reveal
  { name: 'Instruction Reveal', pattern: /(?:what\s+(?:are|is)\s+your|show\s+me\s+(?:your|the)|reveal\s+(?:your|the)|print\s+(?:your|the))\s+(?:system\s+)?(?:prompt|instructions|rules|guidelines)/i, severity: 'high' },
  { name: 'Repeat Instructions', pattern: /repeat\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions|message)\s+(?:verbatim|exactly|word\s+for\s+word)/i, severity: 'high' },
  // Data exfiltration probes
  { name: 'Base64 Decode Probe', pattern: /(?:decode|convert)\s+(?:this\s+)?base64|atob\s*\(|Buffer\.from\s*\(/i, severity: 'medium' },
  { name: 'Data URI Injection', pattern: /data:(?:text|application)\/[^;]+;base64,/i, severity: 'high' },
  // OS command probes
  { name: 'OS Command Probe', pattern: /(?:run|execute|eval)\s+(?:the\s+)?(?:command|shell|bash|cmd)|(?:^|\s)(?:whoami|pwd|ls\s+-la|cat\s+\/etc|curl\s+http|wget\s+http)/i, severity: 'critical' },
  // Jailbreak patterns
  { name: 'DAN Jailbreak', pattern: /\bDAN\b.*(?:do\s+anything\s+now|jailbreak)/i, severity: 'critical' },
  { name: 'Hypothetical Bypass', pattern: /(?:hypothetically|theoretically|in\s+a\s+fictional)\s+(?:how\s+would|can\s+you|tell\s+me\s+how)/i, severity: 'medium' },
];

interface InjectionFinding {
  conversation_id: string;
  message_content_preview: string;
  pattern_name: string;
  severity: 'critical' | 'high' | 'medium';
  timestamp: Date;
}

export async function runAiSafetyMonitorAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const findings: InjectionFinding[] = [];

  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

    // Query visitor messages from recent window
    // ChatMessage has conversation_id; we need visitor messages (role = 'visitor' or 'user')
    const recentMessages = await ChatMessage.findAll({
      where: {
        role: { [Op.in]: ['visitor', 'user'] },
        timestamp: { [Op.gte]: since },
      },
      attributes: ['id', 'conversation_id', 'content', 'timestamp'],
      order: [['timestamp', 'DESC']],
      limit: 500,
      raw: true,
    });

    for (const msg of recentMessages as any[]) {
      const content = msg.content || '';
      if (content.length < 10) continue; // skip very short messages

      for (const ip of INJECTION_PATTERNS) {
        if (ip.pattern.test(content)) {
          findings.push({
            conversation_id: msg.conversation_id,
            message_content_preview: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            pattern_name: ip.name,
            severity: ip.severity,
            timestamp: msg.timestamp,
          });
          break; // one finding per message
        }
      }
    }

    // Group by conversation to detect repeat offenders
    const convCounts: Record<string, number> = {};
    for (const f of findings) {
      convCounts[f.conversation_id] = (convCounts[f.conversation_id] || 0) + 1;
    }
    const repeatOffenders = Object.entries(convCounts).filter(([, c]) => c >= 2);

    actions.push({
      campaign_id: '',
      action: 'ai_safety_scan',
      reason: `Scanned ${recentMessages.length} message(s) in ${WINDOW_MINUTES}min window: ${findings.length} injection attempt(s), ${repeatOffenders.length} repeat offender(s)`,
      confidence: 0.85,
      before_state: null,
      after_state: {
        messages_scanned: recentMessages.length,
        findings_count: findings.length,
        repeat_offenders: repeatOffenders.length,
        by_pattern: findings.reduce((acc, f) => { acc[f.pattern_name] = (acc[f.pattern_name] || 0) + 1; return acc; }, {} as Record<string, number>),
      },
      result: findings.length > 0 ? 'flagged' : 'success',
      entity_type: 'system',
      entity_id: agentId,
    });

    const securityDept = await Department.findOne({ where: { slug: 'security' } });
    if (securityDept) {
      const deptId = (securityDept as any).id;

      if (findings.length > 0) {
        const severity = findings.some((f) => f.severity === 'critical') ? 'critical'
          : findings.some((f) => f.severity === 'high') ? 'high' : 'normal';

        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'threat_detected' as any,
          title: `AI Safety: ${findings.length} injection attempt(s) detected`,
          description: `Patterns: ${[...new Set(findings.map((f) => f.pattern_name))].join(', ')}. Repeat offenders: ${repeatOffenders.length}`,
          severity,
          metadata: {
            agent: AGENT_NAME,
            messages_scanned: recentMessages.length,
            findings_count: findings.length,
            findings_by_type: findings.reduce((acc, f) => { acc[f.pattern_name] = (acc[f.pattern_name] || 0) + 1; return acc; }, {} as Record<string, number>),
            top_findings: findings.slice(0, 10).map((f) => ({ conversation_id: f.conversation_id, pattern: f.pattern_name, severity: f.severity })),
          },
        });

        // Ticket for repeat offenders with critical patterns
        const critRepeat = repeatOffenders.filter(([convId]) =>
          findings.some((f) => f.conversation_id === convId && f.severity === 'critical'),
        );
        if (critRepeat.length > 0) {
          try {
            await createTicket({
              title: `[Security] ${critRepeat.length} conversation(s) with repeated injection attempts`,
              description: `Detected ${critRepeat.length} conversation(s) with multiple critical prompt injection attempts. Conversations: ${critRepeat.map(([id, count]) => `${id.slice(0, 8)}… (${count} attempts)`).join('; ')}`,
              priority: 'critical',
              type: 'bug',
              source: 'security',
              created_by_type: 'agent',
              created_by_id: agentId,
              entity_type: 'system',
              entity_id: deptId,
              metadata: { conversations: critRepeat.slice(0, 5) },
            });
          } catch (err: any) {
            errors.push(`Ticket failed: ${err.message?.slice(0, 100)}`);
          }
        }
      } else {
        await DepartmentEvent.create({
          department_id: deptId,
          event_type: 'security_scan' as any,
          title: `AI Safety: clean — ${recentMessages.length} message(s) scanned`,
          description: `No injection attempts detected in the last ${WINDOW_MINUTES} minutes.`,
          severity: 'normal',
          metadata: { agent: AGENT_NAME, messages_scanned: recentMessages.length },
        });
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'AI safety monitor error');
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: findings.length,
  };
}
