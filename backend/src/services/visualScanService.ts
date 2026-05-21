/**
 * visualScanService — 2026-05-21.
 *
 * One-shot page-level Visual Scan that populates the Critique sidebar
 * with 5–15 suggestions per run. Wraps gpt-4o vision over a
 * client-supplied screenshot of the iframe contents + page metadata.
 *
 *   POST /api/portal/project/visual-review/session/:id/scan
 *     body: {
 *       screenshot_data_url: 'data:image/png;base64,...',
 *       page_route: '/admin/leads',
 *       cap_name?: string,
 *       cap_description?: string,
 *       preset?: 'comprehensive' | 'accessibility' | 'executive_polish' | 'data_density' | 'mobile',
 *       known_findings?: Array<{ title, status }>,   // Addition A: re-scan delta
 *     }
 *
 * Returns: array of VisualCritiqueItem rows it created.
 *
 * Cached per (route + screenshot SHA + preset) so re-runs against an
 * unchanged page cost $0.
 */
import crypto from 'crypto';

export type VisualScanPreset = 'comprehensive' | 'accessibility' | 'executive_polish' | 'data_density' | 'mobile';

export interface VisualScanInput {
  session_id: string;
  project_id: string;
  participant_sub: string;
  screenshot_data_url: string;        // data:image/png;base64,…
  page_route: string;
  cap_name?: string;
  cap_description?: string;
  preset?: VisualScanPreset;
  known_findings?: Array<{ title: string; status: string }>;
}

export interface VisualScanResult {
  created_count: number;
  cache_hit: boolean;
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    rationale: string;
    severity: 'low' | 'medium' | 'high';
    scope: 'page' | 'global' | 'component';
    category: string;
    region: { x: number; y: number; width: number; height: number } | null;
  }>;
  scan_summary?: string;
}

const PRESET_PROMPTS: Record<VisualScanPreset, string> = {
  comprehensive: `Scan comprehensively across layout, visual hierarchy, typography, color, spacing, accessibility, interaction affordances, content clarity, and data density. Return 5–15 findings worth an operator's attention.`,
  accessibility: `Scan for WCAG 2.1 AA issues specifically: color contrast, focus indicators, heading hierarchy, alt text affordance, keyboard reachability, form labeling. Return only accessibility findings.`,
  executive_polish: `Scan as if a CFO or board member were arriving at this surface. Look for: misaligned text, inconsistent spacing, weak hierarchy, low-trust styling, sloppy copy, unrefined density. Return only findings that would erode executive trust.`,
  data_density: `Scan tables / forms / lists specifically. Look for: column overcrowding, missing sort affordances, unclear empty states, no row-level actions, ambiguous filtering, density mismatched to scan-speed needs.`,
  mobile: `Scan with a mobile/responsive lens. Look for: tap target size (<44px), horizontal overflow, text wrapping issues, fixed elements blocking content, modal sizing on small viewports.`,
};

const SYSTEM_PROMPT = `You audit web UI surfaces for an enterprise SaaS platform whose audience is C-level executives.

You receive: a full-page screenshot + the page route + the capability this page implements.

Return JSON only:
{
  "scan_summary": "one paragraph framing the overall state of the page",
  "findings": [
    {
      "title": "<one-line headline>",
      "description": "<what's wrong / what you'd do about it, 1-3 sentences>",
      "rationale": "<why this matters for the operator/audience, 1 sentence>",
      "severity": "low" | "medium" | "high",
      "scope": "page" | "global" | "component",
      "category": "layout" | "spacing" | "typography" | "color" | "accessibility" | "hierarchy" | "interaction" | "copy" | "theme" | "data_density" | "responsiveness" | "workflow",
      "region": { "x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1 } | null
    }
  ]
}

Scope guide:
  page      — fix lives in THIS surface only (e.g., this hero copy)
  global    — fix is a theme/design-system change applied everywhere (e.g., button hover states)
  component — fix is to a reusable component shown across many pages (e.g., shared table widget)

Region coordinates are fractions (0.0–1.0) of the viewport, NOT pixels.

Prefer 5–15 findings. Skip nitpicks. If the page is genuinely clean,
return fewer findings rather than padding.`;

export async function runVisualScan(input: VisualScanInput): Promise<VisualScanResult> {
  const preset: VisualScanPreset = input.preset || 'comprehensive';

  // Cache key: route + image SHA + preset. Stable inputs = cache hit = $0.
  const screenshotSha = sha256(input.screenshot_data_url).slice(0, 16);
  const cacheKey = `visual-scan:${input.page_route}:${preset}:${screenshotSha}`;

  // Persist cap-level dedup hash so re-scans don't duplicate prior findings.
  const knownTitles = new Set((input.known_findings || []).map(f => f.title.toLowerCase()));

  const userPrompt = buildUserPrompt(input, preset, Array.from(knownTitles));

  // Image must be passed as a vision content part to gpt-4o.
  const result = await callVisionLLM(SYSTEM_PROMPT, userPrompt, input.screenshot_data_url, cacheKey);

  let parsed: any = {};
  try { parsed = JSON.parse(result.content); } catch { parsed = { findings: [] }; }
  const findings: any[] = Array.isArray(parsed.findings) ? parsed.findings : [];

  // Dedup against known titles (Addition A — re-scan delta).
  const novel = findings.filter(f => f.title && !knownTitles.has(String(f.title).toLowerCase()));

  // Persist each as a VisualCritiqueItem with created_by='visual-scan' so
  // the sidebar can render them distinctly from operator annotations.
  const { default: VisualCritiqueItem } = await import('../models/VisualCritiqueItem');
  const created: any[] = [];
  for (const f of novel) {
    const kind = mapCategoryToKind(String(f.category || 'workflow').toLowerCase());
    const scope = mapScope(String(f.scope || 'page').toLowerCase());
    const severity = mapSeverity(String(f.severity || 'medium').toLowerCase());
    const region = (f.region && typeof f.region.x === 'number')
      ? { x: clamp01(f.region.x), y: clamp01(f.region.y), width: clamp01(f.region.width), height: clamp01(f.region.height) }
      : null;
    const row: any = await VisualCritiqueItem.create({
      session_id: input.session_id,
      project_id: input.project_id,
      kind: kind as any,
      severity: severity as any,
      description: String(f.description || '').slice(0, 2000),
      region,
      target_selector: null,
      workflow_id: null,
      expected_outcome: null,
      scope: scope as any,
      lifecycle_stage: 'suggested',
      title: String(f.title || '').slice(0, 255) || null,
      rationale: String(f.rationale || '').slice(0, 1000) || null,
      related_routes: [],
      created_by: 'visual-scan',
    } as any);
    created.push({
      id: row.id,
      title: row.title || '',
      description: row.description,
      rationale: row.rationale || '',
      severity: row.severity,
      scope: row.scope,
      category: row.kind,
      region: row.region,
    });
  }

  return {
    created_count: created.length,
    cache_hit: result.cacheHit,
    suggestions: created,
    scan_summary: parsed.scan_summary,
  };
}

function buildUserPrompt(input: VisualScanInput, preset: VisualScanPreset, knownTitles: string[]): string {
  const lines = [
    `## Page route`,
    input.page_route,
    ``,
  ];
  if (input.cap_name) {
    lines.push(`## Capability this page implements`);
    lines.push(`${input.cap_name}${input.cap_description ? ` — ${input.cap_description}` : ''}`);
    lines.push(``);
  }
  lines.push(`## Scan preset`);
  lines.push(PRESET_PROMPTS[preset]);
  lines.push(``);
  if (knownTitles.length > 0) {
    lines.push(`## Findings already surfaced on this page`);
    lines.push(`Skip these (or note in scan_summary if still relevant):`);
    for (const t of knownTitles.slice(0, 20)) lines.push(`- ${t}`);
    lines.push(``);
  }
  lines.push(`Return JSON only.`);
  return lines.join('\n');
}

async function callVisionLLM(systemPrompt: string, userPrompt: string, dataUrl: string, cacheKey: string): Promise<{ content: string; cacheHit: boolean }> {
  // Check in-memory cache first (per-process; replace with persistent cache later if needed)
  const cached = visionCacheGet(cacheKey);
  if (cached) return { content: cached, cacheHit: true };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing — cannot run Visual Scan');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 500)}`);
  }
  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  visionCacheSet(cacheKey, content);
  return { content, cacheHit: false };
}

// ─── Process-local cache ─────────────────────────────────────────────────
// Per-instance only — fine for short bursts. Reset on every backend deploy.
const _cache = new Map<string, { value: string; at: number }>();
const _CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const _CACHE_MAX = 200;
function visionCacheGet(key: string): string | null {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > _CACHE_TTL_MS) { _cache.delete(key); return null; }
  return hit.value;
}
function visionCacheSet(key: string, value: string): void {
  if (_cache.size >= _CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
  _cache.set(key, { value, at: Date.now() });
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
function mapSeverity(s: string): 'low' | 'medium' | 'high' {
  if (s === 'low' || s === 'high') return s;
  return 'medium';
}
function mapScope(s: string): 'page' | 'global' | 'component' {
  if (s === 'global' || s === 'component') return s;
  return 'page';
}
function mapCategoryToKind(c: string): string {
  const allowed = ['spacing', 'alignment', 'color', 'typography', 'interaction', 'accessibility', 'hierarchy', 'responsiveness', 'workflow', 'copy', 'theme', 'data_density', 'mobile'];
  if (allowed.includes(c)) return c;
  // Map common LLM aliases.
  if (c === 'layout') return 'alignment';
  return 'workflow';
}
