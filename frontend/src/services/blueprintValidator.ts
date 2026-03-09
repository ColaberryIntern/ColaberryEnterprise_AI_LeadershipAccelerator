// SAFETY: This service is READ-ONLY. It uses querySelectorAll for inspection only.
// It must never modify the DOM or application state.

import { MARKETING_BLUEPRINT, type BlueprintRule, type CheckType } from '../config/marketingBlueprint';

export interface ValidationResult {
  ruleId: string;
  category: string;
  passed: boolean;
  confidence: number;
  details: string;
  suggestion?: string;
  severity: 'critical' | 'warning' | 'info';
  blueprintAlignmentScore: number; // 1-5 (same as severityWeight)
}

export interface PageValidationReport {
  route: string;
  timestamp: string;
  results: ValidationResult[];
  score: number;     // 0-100
  passRate: number;  // 0.0-1.0
}

// Confidence by check type
const CONFIDENCE_MAP: Record<CheckType, number> = {
  selector_exists: 1.0,
  selector_attr: 0.98,
  selector_count: 1.0,
  text_content: 0.95,
  meta_tag: 0.97,
};

function matchesRoute(rule: BlueprintRule, route: string): boolean {
  if (rule.appliesTo.includes('*')) return true;
  return rule.appliesTo.includes(route);
}

function severityFromWeight(weight: number, required: boolean): 'critical' | 'warning' | 'info' {
  if (required && weight >= 4) return 'critical';
  if (required || weight >= 3) return 'warning';
  return 'info';
}

function checkSelectorExists(selector: string, minCount: number): { passed: boolean; found: number } {
  const elements = document.querySelectorAll(selector);
  return { passed: elements.length >= minCount, found: elements.length };
}

function checkSelectorAttr(selector: string, attr: string): { passed: boolean; total: number; withAttr: number } {
  const elements = document.querySelectorAll(selector);
  if (elements.length === 0) return { passed: true, total: 0, withAttr: 0 };
  let withAttr = 0;
  elements.forEach(el => { if (el.hasAttribute(attr)) withAttr++; });
  return { passed: withAttr === elements.length, total: elements.length, withAttr };
}

function checkSelectorCount(selector: string, min: number, max?: number): { passed: boolean; count: number } {
  const count = document.querySelectorAll(selector).length;
  const passed = count >= min && (max === undefined || count <= max);
  return { passed, count };
}

function checkTextContent(selector: string, patternSource: string): { passed: boolean; matched: string | null } {
  const elements = document.querySelectorAll(selector);
  const pattern = new RegExp(patternSource, 'i');
  for (const el of elements) {
    const text = el.textContent || '';
    const match = text.match(pattern);
    if (match) return { passed: true, matched: match[0] };
  }
  return { passed: false, matched: null };
}

function checkMetaTag(name: string): { passed: boolean; content: string | null } {
  if (name === 'title') {
    const title = document.title;
    return { passed: title.length > 0, content: title };
  }

  // Check both name and property attributes (for OG tags)
  const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`) as HTMLMetaElement | null;
  if (!meta) return { passed: false, content: null };
  const content = meta.getAttribute('content') || '';
  return { passed: content.length > 0, content };
}

function runCheck(rule: BlueprintRule): ValidationResult {
  const baseConfidence = CONFIDENCE_MAP[rule.checkType];
  const severity = severityFromWeight(rule.severityWeight, rule.required);
  let passed = false;
  let details = '';
  let suggestion: string | undefined;

  switch (rule.checkType) {
    case 'selector_exists': {
      const result = checkSelectorExists(rule.selector || '', rule.minCount || 1);
      passed = result.passed;
      details = passed
        ? `Found ${result.found} matching element(s) for "${rule.selector}"`
        : `Expected at least ${rule.minCount || 1} element(s) matching "${rule.selector}", found ${result.found}`;
      if (!passed) {
        suggestion = `Add element(s) matching "${rule.selector}" — ${rule.validationCriteria}`;
      }
      break;
    }
    case 'selector_attr': {
      const result = checkSelectorAttr(rule.selector || '', rule.attribute || '');
      passed = result.passed;
      details = result.total === 0
        ? `No "${rule.selector}" elements found to check`
        : passed
          ? `All ${result.total} element(s) have "${rule.attribute}" attribute`
          : `${result.withAttr}/${result.total} element(s) have "${rule.attribute}" attribute`;
      if (!passed) {
        suggestion = `Add ${rule.attribute}="" to all ${rule.selector} elements`;
      }
      break;
    }
    case 'selector_count': {
      const result = checkSelectorCount(rule.selector || '', rule.minCount || 0, rule.maxCount);
      passed = result.passed;
      const range = rule.maxCount !== undefined
        ? `${rule.minCount || 0}-${rule.maxCount}`
        : `at least ${rule.minCount || 0}`;
      details = passed
        ? `Found ${result.count} element(s) (expected ${range})`
        : `Found ${result.count} element(s), expected ${range}`;
      if (!passed) {
        suggestion = `Adjust the number of "${rule.selector}" elements to be ${range}`;
      }
      break;
    }
    case 'text_content': {
      const result = checkTextContent(rule.selector || 'body', rule.textPattern || '');
      passed = result.passed;
      details = passed
        ? `Text pattern matched: "${result.matched}"`
        : `Pattern /${rule.textPattern}/ not found in "${rule.selector}"`;
      if (!passed) {
        suggestion = `Add content matching: ${rule.validationCriteria}`;
      }
      break;
    }
    case 'meta_tag': {
      const result = checkMetaTag(rule.metaName || '');
      passed = result.passed;
      details = passed
        ? `Meta "${rule.metaName}" present: "${(result.content || '').substring(0, 60)}..."`
        : `Meta "${rule.metaName}" is missing or empty`;
      if (!passed) {
        suggestion = `Add <meta name="${rule.metaName}" content="..."> — ${rule.validationCriteria}`;
      }
      break;
    }
  }

  return {
    ruleId: rule.id,
    category: rule.category,
    passed,
    confidence: baseConfidence,
    details,
    suggestion,
    severity,
    blueprintAlignmentScore: rule.severityWeight,
  };
}

export function validatePage(route: string): PageValidationReport {
  const applicableRules = MARKETING_BLUEPRINT.filter(rule => matchesRoute(rule, route));
  const results = applicableRules.map(runCheck);

  const totalWeight = applicableRules.reduce((sum, r) => sum + r.severityWeight, 0);
  const passedWeight = applicableRules
    .filter((_, i) => results[i].passed)
    .reduce((sum, r) => sum + r.severityWeight, 0);

  const score = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 100;
  const passRate = results.length > 0 ? results.filter(r => r.passed).length / results.length : 1;

  return {
    route,
    timestamp: new Date().toISOString(),
    results,
    score,
    passRate,
  };
}

export function validatePageAsync(route: string): Promise<PageValidationReport> {
  return new Promise(resolve => {
    const run = () => resolve(validatePage(route));
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 3000 });
    } else {
      setTimeout(run, 100);
    }
  });
}
