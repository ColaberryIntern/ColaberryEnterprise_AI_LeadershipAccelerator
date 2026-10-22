/**
 * ensureFreshContent — hand-authored content does not expire.
 *
 * The break this pins: authorship is marked by two writers and only one of them
 * honored the lock contract. `scripts/lib/authorTimelineCard` sets `locked: true`
 * alongside `authored: true`; the admin create/update path (timelineAdminService)
 * stamps `authored` alone. `ensureFreshContent` read only `locked`, so every card
 * hand-written through the Experience Studio was exposed to the 30-day TTL and
 * silently paraphrased by the first student to open it past that window.
 *
 * In production that ran from 2026-07-20 to 2026-10-22 and overwrote 68 authored
 * cards, 40 of which ended up with a body naming a different thing from the card's
 * own title. The reported half was three Claude Studio weeks: week 3's card said
 * "Stakeholder and Requirements Studio" while the panel described a "Business
 * Workflow Assistant Studio", under an 85-minute header whose regenerated stages
 * summed to 48.
 *
 * The invariants here, in order of importance:
 *   1. `authored: true` + content past the TTL ⇒ NO regeneration, and no write.
 *   2. a roster-summary card that is authored STILL resets when the week's
 *      curriculum actually changes — the fix denies the clock, not real edits.
 *   3. an un-authored card past the TTL still regenerates (the TTL still works).
 */

// ---------------------------------------------------------------------------
// Mocks — ensureFreshContent's dependency graph, plus enough of
// generateCardContent's that an ATTEMPT to regenerate is observable. The
// observable is getInstrumentedOpenAI: generateCardContent cannot reach a model
// without it, so "was it called" answers "did we try to regenerate", regardless
// of whether the attempt then succeeds.
// ---------------------------------------------------------------------------
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../curriculumScope', () => ({
  isCardServable: jest.fn(() => true),
}));

jest.mock('../blueprintContext', () => ({
  getBlueprintContext: jest.fn(),
}));

jest.mock('../sectionCurriculumContext', () => ({
  getSectionCurriculumContext: jest.fn(),
  SECTION_ROSTER_TYPES: new Set(['prompt_lab', 'announcement']),
}));

jest.mock('../../components/promptTesterService', () => ({
  resolvePrompt: jest.fn((tpl: string) => tpl),
}));

jest.mock('../../components/costEstimationService', () => ({
  DEFAULT_MODEL: 'gpt-4o-mini',
  MODEL_PRICING: { 'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.6 } },
}));

jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(),
}));

import { ensureFreshContent, CONTENT_TTL_MS } from '../cardContentService';
import TimelineCard from '../../../models/TimelineCard';
import { getSectionCurriculumContext } from '../sectionCurriculumContext';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockFindByPk = (TimelineCard as unknown as { findByPk: jest.Mock }).findByPk;
const mockRoster = getSectionCurriculumContext as jest.Mock;
const mockGetClient = getInstrumentedOpenAI as jest.Mock;

const AUTHORED_CONTENT = {
  title: 'Claude Studio — Stakeholder and Requirements Studio',
  summary: 'An interactive Requirements Explorer.',
  body_html: '<h4>The situation</h4><p>Four people want your Workflow Assistant to do four different things.</p>',
};

/** Milliseconds, as an ISO string, offset into the past. */
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * A stored card. `update` is a spy so the test can assert that a locked read is
 * also a read with NO WRITE — content_at must not churn.
 */
function stubCard(meta: Record<string, unknown>, type = 'claude_studio') {
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    card: { id: 'card-1', type, week: 3, program_id: 'prog-1', visibility: 'published', metadata: meta, update },
    update,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Any regeneration attempt that gets this far dies here. That is deliberate:
  // these tests assert WHETHER we tried, never what the model returned.
  mockGetClient.mockReturnValue(undefined);
  mockRoster.mockResolvedValue({ items: [] });
});

describe('ensureFreshContent — the authored lock', () => {
  it('does NOT regenerate authored content past the 30-day TTL, and writes nothing (the original break)', async () => {
    const { card, update } = stubCard({
      authored: true, // no `locked` — this is exactly what timelineAdminService writes
      content: AUTHORED_CONTENT,
      content_at: daysAgo(60),
    });
    mockFindByPk.mockResolvedValue(card);

    const result = await ensureFreshContent('card-1');

    expect(result.regenerated).toBe(false);
    expect(result.content).toEqual(AUTHORED_CONTENT);
    expect(mockGetClient).not.toHaveBeenCalled(); // never reached a model
    expect(update).not.toHaveBeenCalled(); // content_at did not churn
  });

  it('still regenerates an UN-authored card past the TTL (the TTL itself is intact)', async () => {
    const { card } = stubCard({
      content: { title: 'Generated earlier', body_html: '<p>x</p>' },
      content_at: daysAgo(60),
    });
    mockFindByPk.mockResolvedValue(card);

    const result = await ensureFreshContent('card-1');

    expect(mockGetClient).toHaveBeenCalled(); // did try to regenerate
    expect(result.regenerated).toBe(false); // the attempt then failed, and is swallowed
  });

  it('keeps honoring the hard `locked` flag (unchanged behavior)', async () => {
    const { card } = stubCard({ locked: true, authored: true, content: AUTHORED_CONTENT, content_at: daysAgo(60) });
    mockFindByPk.mockResolvedValue(card);

    const result = await ensureFreshContent('card-1');

    expect(result.content).toEqual(AUTHORED_CONTENT);
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('STILL resets an authored roster-summary card when the week\'s curriculum changes', async () => {
    // The fix denies the clock, not real edits. An authored announcement whose
    // placed roster no longer matches its stored fingerprint must regenerate, or
    // "what you'll cover this week" freezes the moment someone hand-edits it.
    const { card } = stubCard({
      authored: true,
      content: { title: 'This Week — Claude API', body_html: '<p>old roster</p>' },
      content_at: daysAgo(1), // FRESH: only the fingerprint mismatch can fire
      section_fingerprint: 'stale0000fingerp',
    }, 'announcement');
    mockFindByPk.mockResolvedValue(card);
    mockRoster.mockResolvedValue({
      items: [{ type: 'claude_studio', title: 'Stakeholder and Requirements Studio', bucket: 'build', est_minutes: 85 }],
    });

    await ensureFreshContent('card-1');

    expect(mockGetClient).toHaveBeenCalled(); // the roster reset still fires
  });

  it('does not lock on a non-`true` authored value (boundary)', async () => {
    // The gate is `=== true` on purpose: `authored: false` is not authorship, and
    // a stringy "true" is a data defect that should not silently freeze a card.
    for (const authored of [false, 'true', 1, null]) {
      jest.clearAllMocks();
      mockGetClient.mockReturnValue(undefined);
      mockRoster.mockResolvedValue({ items: [] });
      const { card } = stubCard({ authored, content: AUTHORED_CONTENT, content_at: daysAgo(60) });
      mockFindByPk.mockResolvedValue(card);

      await ensureFreshContent('card-1');

      expect(mockGetClient).toHaveBeenCalled();
    }
  });

  it('returns authored content inside the TTL without touching a model (happy path)', async () => {
    const { card, update } = stubCard({ authored: true, content: AUTHORED_CONTENT, content_at: daysAgo(1) });
    mockFindByPk.mockResolvedValue(card);

    const result = await ensureFreshContent('card-1');

    expect(result).toEqual({ content: AUTHORED_CONTENT, regenerated: false });
    expect(mockGetClient).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('exposes a 30-day TTL (the window the break ran on)', () => {
    expect(CONTENT_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
