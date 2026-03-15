// ─── Admissions Knowledge Sync Agent ──────────────────────────────────────────
// Reads frontend page source files, extracts factual content via AI, and
// auto-updates Maya's knowledge base so it stays in sync with the site.
// Schedule: daily at 3 AM CT.

import fs from 'fs';
import path from 'path';
import { chatCompletion } from '../../../intelligence/assistant/openaiHelper';
import AdmissionsKnowledgeEntry from '../../../models/AdmissionsKnowledgeEntry';
import type { AdmissionsKnowledgeCategory } from '../../../models/AdmissionsKnowledgeEntry';
import type { AgentExecutionResult, AgentAction } from '../types';

const VALID_CATEGORIES: AdmissionsKnowledgeCategory[] = [
  'program', 'curriculum', 'pricing', 'faq', 'enterprise',
  'sponsorship', 'outcomes', 'logistics', 'champion',
];

// Map routes to their source page files (relative to frontend/src/pages/)
const PAGE_SOURCES: { route: string; file: string }[] = [
  { route: '/', file: 'HomePage.tsx' },
  { route: '/program', file: 'ProgramPage.tsx' },
  { route: '/pricing', file: 'PricingPage.tsx' },
  { route: '/sponsorship', file: 'SponsorshipPage.tsx' },
  { route: '/advisory', file: 'AdvisoryPage.tsx' },
  { route: '/case-studies', file: 'CaseStudiesPage.tsx' },
  { route: '/enroll', file: 'EnrollPage.tsx' },
  { route: '/contact', file: 'ContactPage.tsx' },
  { route: '/strategy-call-prep', file: 'StrategyCallPrepPage.tsx' },
  { route: '/alumni-ai-champion', file: 'AlumniChampionPage.tsx' },
];

interface ExtractedEntry {
  title: string;
  content: string;
  keywords: string[];
  category: AdmissionsKnowledgeCategory;
  priority: number;
}

/**
 * Resolve the frontend pages directory.
 * In Docker the source is at /app/frontend/src/pages (copied during build).
 * Locally it's relative to the project root.
 */
function getPagesDir(): string {
  // Docker build copies frontend/ into /app/frontend/
  const dockerPath = '/app/frontend/src/pages';
  if (fs.existsSync(dockerPath)) return dockerPath;

  // Local development — walk up from backend dist
  const localPath = path.resolve(__dirname, '../../../../frontend/src/pages');
  if (fs.existsSync(localPath)) return localPath;

  // Fallback — try CWD-relative
  const cwdPath = path.resolve(process.cwd(), 'frontend/src/pages');
  return cwdPath;
}

/**
 * Read a page source file and return its content.
 */
function readPageSource(file: string): string | null {
  const pagesDir = getPagesDir();
  const filePath = path.join(pagesDir, file);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    console.warn(`[KnowledgeSync] Cannot read ${filePath}`);
    return null;
  }
}

/**
 * Strip JSX/HTML tags and extract visible text content from a TSX source file.
 * Keeps string literals, template literals, and JSX text content.
 */
function extractVisibleText(source: string): string {
  // Remove imports and type definitions
  const lines = source.split('\n').filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('import ') &&
           !trimmed.startsWith('export type') &&
           !trimmed.startsWith('export interface') &&
           !trimmed.startsWith('//');
  });

  const code = lines.join('\n');

  // Extract string literals between quotes (JSX text, props, etc.)
  const strings: string[] = [];

  // Match JSX text content (between > and <)
  const jsxText = code.match(/>[^<>{]+</g);
  if (jsxText) {
    for (const match of jsxText) {
      const text = match.slice(1).trim();
      if (text.length > 3 && !/^[{}\s()]+$/.test(text)) {
        strings.push(text);
      }
    }
  }

  // Match string literals in single/double quotes (for arrays, objects, etc.)
  const quotedStrings = code.match(/'([^']{5,})'/g);
  if (quotedStrings) {
    for (const match of quotedStrings) {
      const text = match.slice(1, -1);
      if (!text.startsWith('/') && !text.includes('className') && !text.includes('style')) {
        strings.push(text);
      }
    }
  }

  // Match template literal content
  const templateStrings = code.match(/`([^`]{5,})`/g);
  if (templateStrings) {
    for (const match of templateStrings) {
      strings.push(match.slice(1, -1).replace(/\$\{[^}]+\}/g, ''));
    }
  }

  return strings.join('\n');
}

/**
 * Use AI to extract knowledge entries from page text.
 */
async function extractEntriesFromPage(
  route: string,
  pageText: string,
): Promise<ExtractedEntry[]> {
  const system = `You are extracting factual program information from the source code of a webpage of the Colaberry Enterprise AI Leadership Accelerator website.

Given the extracted text from the ${route} page, identify all distinct factual claims as knowledge entries.

Return a JSON object with key "entries" containing an array: { "entries": [{ "title": string, "content": string, "keywords": string[], "category": string, "priority": number }] }

Rules:
- category MUST be one of: program, curriculum, pricing, faq, enterprise, sponsorship, outcomes, logistics, champion
- Use "champion" category ONLY for referral/alumni content
- priority: 10 = critical facts (dates, pricing, duration), 8 = important (curriculum, outcomes, audience), 6 = supplementary
- content should be concise factual statements (1-3 sentences max)
- keywords should include the most searchable terms a visitor would use
- Do NOT include navigation text, button labels, boilerplate, or styling text
- Do NOT include vague/generic statements — only specific, factual program details
- Titles should be descriptive and unique (e.g., "Program Duration" not "Duration")
- If the page has very little factual content, return an empty entries array
- Merge related facts into single entries (don't create one entry per sentence)`;

  const user = `Page route: ${route}\n\nExtracted text:\n${pageText.slice(0, 8000)}`;

  const result = await chatCompletion(system, user, {
    json: true,
    maxTokens: 2048,
    temperature: 0.1,
  });

  if (!result) return [];

  try {
    const parsed = JSON.parse(result);
    const entries: ExtractedEntry[] = (parsed.entries || [])
      .filter((e: any) => e.title && e.content && e.category)
      .map((e: any) => ({
        title: String(e.title).slice(0, 200),
        content: String(e.content).slice(0, 2000),
        keywords: Array.isArray(e.keywords) ? e.keywords.map(String).slice(0, 10) : [],
        category: VALID_CATEGORIES.includes(e.category) ? e.category : 'faq',
        priority: Math.min(10, Math.max(1, Number(e.priority) || 6)),
      }));

    return entries;
  } catch {
    console.warn(`[KnowledgeSync] Failed to parse AI output for ${route}`);
    return [];
  }
}

/**
 * Simple title similarity check (lowercase normalized).
 */
function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;

  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Main agent executor.
 */
export async function runAdmissionsKnowledgeSyncAgent(
  _agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  console.log('[KnowledgeSync] Starting knowledge base sync...');

  // Step 1: Read all page source files and extract text
  const pageTexts: { route: string; text: string }[] = [];
  for (const { route, file } of PAGE_SOURCES) {
    const source = readPageSource(file);
    if (!source) {
      errors.push(`Cannot read source for ${route} (${file})`);
      continue;
    }
    const text = extractVisibleText(source);
    if (text.length > 50) {
      pageTexts.push({ route, text });
    }
  }

  console.log(`[KnowledgeSync] Read ${pageTexts.length}/${PAGE_SOURCES.length} page sources`);

  if (pageTexts.length === 0) {
    errors.push('No page sources could be read');
    return {
      agent_name: 'AdmissionsKnowledgeSyncAgent',
      campaigns_processed: 0,
      actions_taken: actions,
      errors,
      duration_ms: Date.now() - startTime,
      entities_processed: 0,
    };
  }

  // Step 2: Extract entries from each page via AI
  const allExtracted: ExtractedEntry[] = [];
  for (const { route, text } of pageTexts) {
    try {
      const entries = await extractEntriesFromPage(route, text);
      allExtracted.push(...entries);
      console.log(`[KnowledgeSync] Extracted ${entries.length} entries from ${route}`);
    } catch (err: any) {
      errors.push(`AI extraction failed for ${route}: ${err.message}`);
    }
  }

  console.log(`[KnowledgeSync] Total extracted: ${allExtracted.length} entries from ${pageTexts.length} pages`);

  // Deduplicate extracted entries by title
  const deduped = new Map<string, ExtractedEntry>();
  for (const entry of allExtracted) {
    const key = entry.title.toLowerCase().trim();
    if (!deduped.has(key) || entry.priority > (deduped.get(key)?.priority || 0)) {
      deduped.set(key, entry);
    }
  }
  const extracted = [...deduped.values()];

  // Step 3: Load existing entries
  const existing = await AdmissionsKnowledgeEntry.findAll({ where: { active: true } });
  const existingByTitle = new Map(existing.map((e) => [e.title.toLowerCase().trim(), e]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  // Step 4: Compare and sync
  const matchedExistingTitles = new Set<string>();

  for (const entry of extracted) {
    const titleKey = entry.title.toLowerCase().trim();

    // Exact match
    let match = existingByTitle.get(titleKey);

    // Fuzzy match if no exact match
    if (!match) {
      for (const [existingKey, existingEntry] of existingByTitle) {
        if (titleSimilarity(titleKey, existingKey) > 0.8) {
          match = existingEntry;
          break;
        }
      }
    }

    if (match) {
      matchedExistingTitles.add(match.title.toLowerCase().trim());

      // Check if content meaningfully changed
      const contentChanged = match.content.trim() !== entry.content.trim();
      const keywordsChanged = JSON.stringify(match.keywords?.sort()) !== JSON.stringify(entry.keywords.sort());

      if (contentChanged || keywordsChanged) {
        await match.update({
          content: entry.content,
          keywords: entry.keywords,
          category: entry.category as any,
          priority: entry.priority,
        });
        updated++;
        actions.push({
          campaign_id: '',
          action: 'knowledge_entry_updated',
          reason: `Content changed for "${entry.title}"`,
          confidence: 0.9,
          before_state: { content: match.content.slice(0, 100) },
          after_state: { content: entry.content.slice(0, 100) },
          result: 'success',
          entity_type: 'system',
          entity_id: match.id,
        });
      } else {
        unchanged++;
      }
    } else {
      // New entry
      const newEntry = await AdmissionsKnowledgeEntry.create({
        category: entry.category as any,
        title: entry.title,
        content: entry.content,
        keywords: entry.keywords,
        priority: entry.priority,
        active: true,
      });
      created++;
      actions.push({
        campaign_id: '',
        action: 'knowledge_entry_created',
        reason: `New knowledge entry: "${entry.title}"`,
        confidence: 0.85,
        before_state: null,
        after_state: { title: entry.title, category: entry.category },
        result: 'success',
        entity_type: 'system',
        entity_id: newEntry.id,
      });
    }
  }

  // Step 5: Flag stale entries (exist in DB but not found on any page)
  let flagged = 0;
  for (const existingEntry of existing) {
    const key = existingEntry.title.toLowerCase().trim();
    if (!matchedExistingTitles.has(key)) {
      const hasSimilar = extracted.some((e) => titleSimilarity(e.title, existingEntry.title) > 0.6);
      if (!hasSimilar) {
        flagged++;
        actions.push({
          campaign_id: '',
          action: 'knowledge_entry_flagged_stale',
          reason: `Entry "${existingEntry.title}" not found on any page — may be stale`,
          confidence: 0.7,
          before_state: { title: existingEntry.title, category: existingEntry.category },
          after_state: null,
          result: 'flagged',
          entity_type: 'system',
          entity_id: existingEntry.id,
        });
      }
    }
  }

  console.log(`[KnowledgeSync] Done: ${created} created, ${updated} updated, ${unchanged} unchanged, ${flagged} flagged stale`);

  return {
    agent_name: 'AdmissionsKnowledgeSyncAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: created + updated + flagged,
  };
}
