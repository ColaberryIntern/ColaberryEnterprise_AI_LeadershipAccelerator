// ─── Business Translator ─────────────────────────────────────────────────────
// Converts raw technical codes, metrics, and confidence values into
// business-friendly language suitable for executive audiences.

const PROBLEM_TYPE_MAP: Record<string, string> = {
  conversion_drop: 'Conversion Rate Decline',
  conversion_spike: 'Conversion Rate Spike',
  agent_error: 'Automation Issue',
  agent_stall: 'Automation Stall',
  campaign_stall: 'Campaign Stalled',
  campaign_error: 'Campaign Delivery Issue',
  lead_stagnation: 'Lead Pipeline Slowdown',
  lead_drop: 'Lead Volume Drop',
  enrollment_drop: 'Enrollment Decline',
  revenue_drop: 'Revenue Decline',
  email_bounce: 'Email Delivery Failure',
  email_spam: 'Email Spam Risk',
  high_error_rate: 'High Error Rate',
  low_engagement: 'Low Engagement',
  anomaly: 'Unusual Activity Detected',
  drift: 'Performance Drift',
  timeout: 'System Timeout',
  quota_exceeded: 'Capacity Limit Reached',
};

/**
 * Translate a snake_case problem type code to business language.
 */
export function translateProblemType(code: string): string {
  if (!code) return '';
  if (PROBLEM_TYPE_MAP[code]) return PROBLEM_TYPE_MAP[code];
  // If it contains underscores, it's likely a code — title-case it
  if (code.includes('_')) {
    return code
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  // Already human-readable
  return code;
}

/**
 * Format a 0-1 confidence score as human-readable text.
 */
export function formatConfidence(confidence: number | null | undefined): string {
  if (confidence == null) return '';
  if (confidence >= 0.9) return 'Very High Confidence';
  if (confidence >= 0.7) return 'High Confidence';
  if (confidence >= 0.5) return 'Moderate Confidence';
  if (confidence >= 0.3) return 'Low Confidence';
  return 'Very Low Confidence';
}

/**
 * Format a confidence value as a badge color class.
 */
export function confidenceBadgeColor(confidence: number | null | undefined): string {
  if (confidence == null) return 'secondary';
  if (confidence >= 0.7) return 'success';
  if (confidence >= 0.5) return 'info';
  if (confidence >= 0.3) return 'warning';
  return 'danger';
}

/**
 * Format an impact metric + change percentage into business language.
 */
export function formatImpact(metric: string, changePct: number): string {
  const direction = changePct > 0 ? 'increased' : 'decreased';
  const metricName = translateProblemType(metric);
  return `${metricName} ${direction} by ${Math.abs(Math.round(changePct))}%`;
}

/**
 * Detect if a string looks like a raw technical code (snake_case with no spaces).
 */
export function isTechnicalCode(text: string): boolean {
  return /^[a-z][a-z0-9_]+$/.test(text);
}

/**
 * Smart translate: if the text looks like a technical code, translate it.
 * Otherwise return as-is.
 */
export function smartTranslate(text: string): string {
  if (!text) return '';
  if (isTechnicalCode(text)) return translateProblemType(text);
  return text;
}
