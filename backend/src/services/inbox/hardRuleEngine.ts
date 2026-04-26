import InboxVip from '../../models/InboxVip';
import InboxRule from '../../models/InboxRule';

const LOG_PREFIX = '[InboxCOS][HardRule]';

interface HardRuleResult {
  matched: boolean;
  state?: 'INBOX' | 'AUTOMATION';
  rule_id?: string;
  reason?: string;
  classified_by?: string;
}

interface NormalizedEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: any[];
  cc_addresses: any[];
  subject: string;
  body_text: string | null;
  headers: any;
}

/**
 * Deterministic classification engine. Evaluates hard-coded rules and
 * user-defined rules in strict priority order. No LLM, no external calls.
 */
export async function evaluateHardRules(email: NormalizedEmail): Promise<HardRuleResult> {
  const fromLower = email.from_address.toLowerCase();
  const subjectLower = (email.subject || '').toLowerCase();
  const bodyLower = (email.body_text || '').toLowerCase();
  const headers = email.headers || {};

  // --- 0a. Weekly/Daily Reports from Cory → INBOX (keep visible) ---
  if (fromLower.includes('ali@colaberry.com') && (subjectLower.includes('weekly report') || subjectLower.includes('daily report') || subjectLower.includes('cory'))) {
    const reason = 'Cory report email - keep in INBOX';
    console.log(`${LOG_PREFIX} Cory report: ${reason}`);
    return { matched: true, state: 'INBOX', reason, classified_by: 'hard_rule' };
  }

  // --- 0b. System Alert Emails → AUTOMATION ---
  if (fromLower.includes('ali@colaberry.com') && /^\[alert\]/i.test(email.subject || '')) {
    const reason = 'System-generated alert email (self-sent [Alert])';
    console.log(`${LOG_PREFIX} System alert: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason, classified_by: 'hard_rule' };
  }

  // --- 1. VIP Check ---
  try {
    const vip = await InboxVip.findOne({
      where: InboxVip.sequelize!.where(
        InboxVip.sequelize!.fn('LOWER', InboxVip.sequelize!.col('email_address')),
        fromLower
      ),
    });

    if (vip) {
      const reason = `VIP sender: ${vip.name || vip.email_address}`;
      console.log(`${LOG_PREFIX} VIP match: ${reason}`);
      return { matched: true, state: 'INBOX', reason, classified_by: 'hard_rule' };
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} VIP lookup failed: ${error.message}`);
    // Continue to next rule — VIP check failure should not block classification
  }

  // --- 2. Name Check ---
  const namePattern = /ali\s+muwwakkil/i;
  if (namePattern.test(email.subject) || namePattern.test(email.body_text || '')) {
    const reason = 'Directly addressed to Ali Muwwakkil';
    console.log(`${LOG_PREFIX} Name match: ${reason}`);
    return { matched: true, state: 'INBOX', reason, classified_by: 'hard_rule' };
  }

  // --- 3. Keyword Check ---
  const priorityKeywords = ['school', 'daycare', 'sports league', 'parent teacher', 'pta', 'field trip'];
  for (const keyword of priorityKeywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    if (wordBoundaryRegex.test(email.subject) || wordBoundaryRegex.test(email.body_text || '')) {
      const reason = `Contains priority keyword: ${keyword}`;
      console.log(`${LOG_PREFIX} Keyword match: ${reason}`);
      return { matched: true, state: 'INBOX', reason, classified_by: 'hard_rule' };
    }
  }

  // --- 4. Automation Header Check ---
  const headerKeys = Object.keys(headers);
  const hasListUnsubscribe = headerKeys.some(
    (key) => key.toLowerCase() === 'list-unsubscribe'
  );
  if (hasListUnsubscribe) {
    const reason = 'Has List-Unsubscribe header';
    console.log(`${LOG_PREFIX} Automation header: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason, classified_by: 'hard_rule' };
  }

  // --- 5. Noreply Check ---
  if (/no[-_.]?reply|do[-_.]?not[-_.]?reply/i.test(fromLower)) {
    const reason = 'Sent from noreply address';
    console.log(`${LOG_PREFIX} Noreply match: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason, classified_by: 'hard_rule' };
  }

  // --- 6. User-Defined Rules ---
  try {
    const rules = await InboxRule.findAll({
      where: { enabled: true },
      order: [['priority', 'ASC']],
    });

    for (const rule of rules) {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
      if (conditions.length === 0) continue;

      const allMatch = conditions.every((condition: any) => {
        return evaluateCondition(condition, email, fromLower, subjectLower, bodyLower, headers);
      });

      if (allMatch) {
        const reason = `Matched rule: ${rule.name}`;
        console.log(`${LOG_PREFIX} User rule match: ${reason} (id=${rule.id})`);
        return {
          matched: true,
          state: rule.target_state as 'INBOX' | 'AUTOMATION',
          rule_id: rule.id,
          reason,
          classified_by: 'hard_rule',
        };
      }
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} User-defined rules lookup failed: ${error.message}`);
    // Continue — rule evaluation failure should not block classification
  }

  // --- 7. No Match ---
  console.log(`${LOG_PREFIX} No hard rule matched for email ${email.id}`);
  return { matched: false };
}

/**
 * Evaluates a single condition against an email.
 */
function evaluateCondition(
  condition: { field: string; operator: string; value: string },
  email: NormalizedEmail,
  fromLower: string,
  subjectLower: string,
  bodyLower: string,
  headers: any
): boolean {
  const { field, operator, value } = condition;
  if (!field || !operator || value === undefined) return false;

  let target: string;
  switch (field) {
    case 'from':
      target = fromLower;
      break;
    case 'subject':
      target = subjectLower;
      break;
    case 'body':
      target = bodyLower;
      break;
    case 'header': {
      // For header conditions, check if any header key/value matches
      const headerEntries = Object.entries(headers);
      const valueLower = value.toLowerCase();
      target = headerEntries
        .map(([k, v]) => `${k.toLowerCase()}: ${String(v).toLowerCase()}`)
        .join('\n');
      return applyOperator(operator, target, valueLower);
    }
    default:
      return false;
  }

  return applyOperator(operator, target, value.toLowerCase());
}

/**
 * Applies a comparison operator to a target string and value.
 */
function applyOperator(operator: string, target: string, value: string): boolean {
  switch (operator) {
    case 'contains':
      return target.includes(value);
    case 'equals':
      return target === value;
    case 'starts_with':
      return target.startsWith(value);
    case 'regex':
      try {
        const regex = new RegExp(value, 'i');
        return regex.test(target);
      } catch {
        console.error(`${LOG_PREFIX} Invalid regex in rule condition: ${value}`);
        return false;
      }
    default:
      console.warn(`${LOG_PREFIX} Unknown operator: ${operator}`);
      return false;
  }
}
