/**
 * UI Feedback Engine
 *
 * Deterministic rule-based analysis + LLM augmentation.
 * Rules run first (fast, predictable). LLM fills gaps (creative, targeted).
 *
 * Same input = same output. Feedback is deduped via hash in the store.
 */
import { createFeedback, CreateFeedbackInput } from './uiFeedbackStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UIElement {
  element_id: string;
  type: string;       // heading, button, link, image, form, input, container, text, nav, list
  tag: string;        // h1, button, a, img, form, input, div, p, nav, ul
  selector: string;
  text: string;
  depth: number;
  parent_id?: string;
  attributes?: Record<string, string>;
  children_count?: number;
}

interface PageContext {
  route: string;
  elements: UIElement[];
  hasH1: boolean;
  headingLevels: number[];
  interactiveElements: UIElement[];
  images: UIElement[];
  forms: UIElement[];
  links: UIElement[];
}

interface FeedbackRule {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  check: (element: UIElement, ctx: PageContext) => boolean;
  message: (element: UIElement) => { title: string; description: string; suggestion: string };
}

interface EngineResult {
  total_issues: number;
  new_issues: number;
  skipped_duplicates: number;
  issues: Array<{ element_id: string; title: string; severity: string; source: string; isNew: boolean }>;
}

// ---------------------------------------------------------------------------
// Rule Catalog
// ---------------------------------------------------------------------------

const RULES: FeedbackRule[] = [
  // Hierarchy
  {
    id: 'HIER-001', category: 'hierarchy', severity: 'high',
    check: (_el, ctx) => !ctx.hasH1,
    message: () => ({ title: 'Missing page heading (h1)', description: 'Page has no h1 element. Screen readers and SEO rely on a single h1 to identify the page purpose.', suggestion: 'Add an h1 heading that describes the page content.' }),
  },
  {
    id: 'HIER-002', category: 'hierarchy', severity: 'medium',
    check: (el) => el.tag === 'h3' || el.tag === 'h4' || el.tag === 'h5',
    message: (el) => {
      const level = parseInt(el.tag.replace('h', ''));
      return { title: `Heading level skip (${el.tag})`, description: `This ${el.tag} may skip heading levels. Headings should follow a sequential order (h1 → h2 → h3).`, suggestion: `Check if there are h${level - 1} headings above this one. If not, adjust the heading level.` };
    },
  },

  // Accessibility
  {
    id: 'ACCS-001', category: 'accessibility', severity: 'high',
    check: (el) => el.tag === 'img' && !el.attributes?.alt,
    message: (el) => ({ title: 'Image missing alt text', description: `Image "${el.text || el.selector}" has no alt attribute. Screen readers cannot describe this image.`, suggestion: 'Add a descriptive alt attribute to the image element.' }),
  },
  {
    id: 'ACCS-002', category: 'accessibility', severity: 'high',
    check: (el) => el.tag === 'input' && !el.attributes?.['aria-label'] && !el.attributes?.id,
    message: (el) => ({ title: 'Form input missing label', description: `Input "${el.text || el.selector}" has no associated label or aria-label.`, suggestion: 'Add a <label> element with a matching for/id, or add an aria-label attribute.' }),
  },
  {
    id: 'ACCS-003', category: 'accessibility', severity: 'high',
    check: (el) => (el.tag === 'button' || el.tag === 'a') && !el.text?.trim() && !el.attributes?.['aria-label'],
    message: (el) => ({ title: `${el.tag === 'button' ? 'Button' : 'Link'} has no accessible name`, description: `Interactive element "${el.selector}" has no visible text or aria-label. Screen readers cannot identify its purpose.`, suggestion: 'Add visible text content or an aria-label attribute.' }),
  },

  // Interaction
  {
    id: 'INTR-001', category: 'interaction', severity: 'medium',
    check: (el) => el.tag === 'a' && el.text?.toLowerCase().includes('click here'),
    message: () => ({ title: 'Vague link text "click here"', description: 'Link text should describe the destination, not the action. "Click here" is uninformative for screen readers.', suggestion: 'Replace "click here" with descriptive text about the link destination.' }),
  },
  {
    id: 'INTR-002', category: 'interaction', severity: 'medium',
    check: (el) => el.tag === 'a' && el.text?.toLowerCase() === 'read more',
    message: () => ({ title: 'Generic "read more" link', description: 'Multiple "read more" links are indistinguishable for screen reader users navigating by links.', suggestion: 'Make link text specific: "Read more about [topic]".' }),
  },

  // Content
  {
    id: 'CONT-001', category: 'content', severity: 'low',
    check: (el) => el.tag === 'p' && (el.text?.length || 0) > 300,
    message: (el) => ({ title: 'Long text block', description: `Paragraph has ${el.text?.length || 0} characters. Long text blocks reduce readability.`, suggestion: 'Break into shorter paragraphs (2-3 sentences each) or use bullet points.' }),
  },

  // Navigation
  {
    id: 'NAVI-001', category: 'navigation', severity: 'medium',
    check: (_el, ctx) => !ctx.elements.some(e => e.tag === 'nav'),
    message: () => ({ title: 'No navigation landmark', description: 'Page has no <nav> element. Navigation landmarks help screen readers understand page structure.', suggestion: 'Wrap the main navigation in a <nav> element with an aria-label.' }),
  },

  // Forms
  {
    id: 'FORM-001', category: 'interaction', severity: 'medium',
    check: (el) => el.tag === 'form' && !el.attributes?.['aria-label'] && !el.attributes?.['aria-labelledby'],
    message: () => ({ title: 'Form without accessible name', description: 'Form has no aria-label or aria-labelledby. Screen readers cannot identify the form purpose.', suggestion: 'Add aria-label="Form name" to the form element.' }),
  },
];

// ---------------------------------------------------------------------------
// Rule Engine
// ---------------------------------------------------------------------------

function buildPageContext(elements: UIElement[], route: string): PageContext {
  const headings = elements.filter(e => /^h[1-6]$/.test(e.tag));
  return {
    route,
    elements,
    hasH1: headings.some(h => h.tag === 'h1'),
    headingLevels: headings.map(h => parseInt(h.tag.replace('h', ''))),
    interactiveElements: elements.filter(e => ['button', 'a', 'input', 'select', 'textarea'].includes(e.tag)),
    images: elements.filter(e => e.tag === 'img'),
    forms: elements.filter(e => e.tag === 'form'),
    links: elements.filter(e => e.tag === 'a'),
  };
}

// ---------------------------------------------------------------------------
// Main: Analyze Page or Element
// ---------------------------------------------------------------------------

export async function analyzePageElements(options: {
  capabilityId: string;
  projectId: string;
  pageRoute: string;
  elements: UIElement[];
  targetElementId?: string;  // if set, only analyze this element
}): Promise<EngineResult> {
  const { capabilityId, projectId, pageRoute, elements, targetElementId } = options;
  const ctx = buildPageContext(elements, pageRoute);
  const result: EngineResult = { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] };

  // Filter elements if targeting specific one
  const targetElements = targetElementId
    ? elements.filter(e => e.element_id === targetElementId)
    : elements;

  // Page-level rules (run once, applied to first element or synthetic page element)
  const pageLevelRules = RULES.filter(r => r.id === 'HIER-001' || r.id === 'NAVI-001');
  if (!targetElementId) {
    const pageElement: UIElement = { element_id: 'page', type: 'page', tag: 'html', selector: 'html', text: '', depth: 0 };
    for (const rule of pageLevelRules) {
      if (rule.check(pageElement, ctx)) {
        const msg = rule.message(pageElement);
        const input: CreateFeedbackInput = {
          capabilityId, projectId,
          elementId: 'page',
          elementType: 'page',
          pageRoute,
          issueType: rule.category,
          title: msg.title,
          description: msg.description,
          suggestion: msg.suggestion,
          severity: rule.severity,
          source: 'rule',
          confidence: 1.0,
        };
        const { isNew } = await createFeedback(input);
        result.total_issues++;
        if (isNew) result.new_issues++; else result.skipped_duplicates++;
        result.issues.push({ element_id: 'page', title: msg.title, severity: rule.severity, source: 'rule', isNew });
      }
    }
  }

  // Element-level rules
  const elementRules = RULES.filter(r => !pageLevelRules.includes(r));
  for (const el of targetElements) {
    for (const rule of elementRules) {
      if (rule.check(el, ctx)) {
        const msg = rule.message(el);
        const input: CreateFeedbackInput = {
          capabilityId, projectId,
          elementId: el.element_id,
          elementType: el.type,
          elementSelector: el.selector,
          elementText: (el.text || '').substring(0, 500),
          pageRoute,
          issueType: rule.category,
          title: msg.title,
          description: msg.description,
          suggestion: msg.suggestion,
          severity: rule.severity,
          source: 'rule',
          confidence: 1.0,
        };
        const { isNew } = await createFeedback(input);
        result.total_issues++;
        if (isNew) result.new_issues++; else result.skipped_duplicates++;
        result.issues.push({ element_id: el.element_id, title: msg.title, severity: rule.severity, source: 'rule', isNew });
      }
    }
  }

  return result;
}

/**
 * LLM augmentation — only called when rules find < 3 issues or user requests creative analysis.
 */
export async function augmentWithLLM(options: {
  capabilityId: string;
  projectId: string;
  pageRoute: string;
  elements: UIElement[];
  userFeedback?: string;
  ruleIssueCount: number;
}): Promise<EngineResult> {
  const { capabilityId, projectId, pageRoute, elements, userFeedback, ruleIssueCount } = options;

  // Only augment if rules found few issues OR user gave specific feedback
  if (ruleIssueCount >= 3 && !userFeedback) {
    return { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] };
  }

  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const elementSummary = elements.slice(0, 30).map(e =>
      `${e.element_id} [${e.tag}] "${(e.text || '').substring(0, 40)}"`
    ).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'system',
        content: `You analyze a SINGLE frontend page for UX issues. You must ONLY analyze the specific page shown — do NOT reference or suggest changes to other pages in the application.

CRITICAL RULES:
- ONLY analyze elements on THIS page (${pageRoute})
- Do NOT suggest changes to pages you cannot see
- Do NOT mention other pages by name unless the user asked about navigation
- Every issue must reference a specific element_id from the list provided
- Suggestions must be implementable on THIS page only

Respond with valid JSON only.`,
      }, {
        role: 'user',
        content: `Analyzing ONLY this page: ${pageRoute}
${userFeedback ? `User feedback: "${userFeedback}"` : ''}

Elements on THIS page:
${elementSummary}

Find UX issues for THIS page only. Do NOT suggest changes to other pages.
Focus on: layout, spacing, visual hierarchy, user flow, data presentation, enterprise readiness.

Respond: {"issues": [{"element_id": "...", "issue_type": "...", "title": "...", "description": "...", "suggestion": "...", "severity": "low|medium|high"}]}`,
      }],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
    const llmIssues = (parsed.issues || []) as Array<any>;
    const result: EngineResult = { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] };

    for (const issue of llmIssues) {
      if (!issue.element_id || !issue.title) continue;
      const input: CreateFeedbackInput = {
        capabilityId, projectId,
        elementId: issue.element_id,
        pageRoute,
        issueType: issue.issue_type || 'ux',
        title: issue.title,
        description: issue.description || issue.title,
        suggestion: issue.suggestion,
        severity: issue.severity || 'medium',
        source: 'llm',
        confidence: 0.8,
      };
      const { isNew } = await createFeedback(input);
      result.total_issues++;
      if (isNew) result.new_issues++; else result.skipped_duplicates++;
      result.issues.push({ element_id: issue.element_id, title: issue.title, severity: issue.severity || 'medium', source: 'llm', isNew });
    }

    return result;
  } catch (err) {
    console.error('[FeedbackEngine] LLM augmentation failed:', (err as Error).message);
    return { total_issues: 0, new_issues: 0, skipped_duplicates: 0, issues: [] };
  }
}
