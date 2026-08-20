import {
  decideRegeneration,
  buildCorrectiveInstruction,
  pickBetterContent,
  isOnTopicRegenEnabled,
  REGEN_CONFIDENCE_FLOOR,
} from '../../services/chapterOnTopicGuard';
import { ChapterQualityResult, SectionQuality } from '../../services/chapterQualityService';

const sec = (section: string, confidence: number): SectionQuality => ({
  section, confidence, completeness: confidence, relevance: 100, issues: [],
});

function quality(partial: Partial<ChapterQualityResult> = {}): ChapterQualityResult {
  return { overall_confidence: 90, grade: 'A', on_topic: true, low_confidence: false, sections: [], issues: [], ...partial };
}

const ctx = { title: 'Calculating ROI for AI Initiatives', learningGoal: 'Measure Return on Investment' };

describe('chapterOnTopicGuard.decideRegeneration', () => {
  it('does not regenerate acceptable, on-topic content', () => {
    const d = decideRegeneration(quality({ on_topic: true, overall_confidence: 88 }), ctx, false);
    expect(d.shouldRegenerate).toBe(false);
    expect(d.reason).toMatch(/acceptable/);
  });

  it('regenerates off-topic content even when overall confidence is not low', () => {
    const d = decideRegeneration(quality({ on_topic: false, overall_confidence: 72 }), ctx, false);
    expect(d.shouldRegenerate).toBe(true);
    expect(d.reason).toMatch(/off-topic/);
    expect(d.correctiveInstruction.length).toBeGreaterThan(0);
  });

  it('regenerates very low-confidence content even when on-topic', () => {
    const d = decideRegeneration(quality({ on_topic: true, overall_confidence: REGEN_CONFIDENCE_FLOOR - 1 }), ctx, false);
    expect(d.shouldRegenerate).toBe(true);
    expect(d.reason).toMatch(/low confidence/);
  });

  it('never regenerates twice (caps at one retry)', () => {
    const d = decideRegeneration(quality({ on_topic: false, overall_confidence: 10 }), ctx, true);
    expect(d.shouldRegenerate).toBe(false);
    expect(d.reason).toMatch(/already retried/);
  });
});

describe('chapterOnTopicGuard.buildCorrectiveInstruction', () => {
  it('names the lesson topic and the weak sections', () => {
    const q = quality({ on_topic: false, overall_confidence: 40, sections: [sec('ai_strategy', 20), sec('concept_snapshot', 95)] });
    const instr = buildCorrectiveInstruction(q, ctx);
    expect(instr).toMatch(/Calculating ROI for AI Initiatives/);
    expect(instr).toMatch(/ai_strategy/);
    expect(instr).not.toMatch(/concept_snapshot/); // strong section is not listed as weak
  });

  it('falls back to a generic topic phrase when no context is given', () => {
    const instr = buildCorrectiveInstruction(quality(), {});
    expect(instr).toMatch(/stated lesson topic/);
  });
});

describe('chapterOnTopicGuard.pickBetterContent', () => {
  it('keeps the higher-confidence draft', () => {
    const a = { content: 'orig', quality: quality({ overall_confidence: 60 }) };
    const b = { content: 'retry', quality: quality({ overall_confidence: 85 }) };
    expect(pickBetterContent(a, b).content).toBe('retry');
  });

  it('keeps the original on a tie', () => {
    const a = { content: 'orig', quality: quality({ overall_confidence: 70 }) };
    const b = { content: 'retry', quality: quality({ overall_confidence: 70 }) };
    expect(pickBetterContent(a, b).content).toBe('orig');
  });
});

describe('chapterOnTopicGuard.isOnTopicRegenEnabled', () => {
  const original = process.env.CHAPTER_ONTOPIC_REGEN;
  afterEach(() => { if (original === undefined) delete process.env.CHAPTER_ONTOPIC_REGEN; else process.env.CHAPTER_ONTOPIC_REGEN = original; });

  it('is off by default', () => {
    delete process.env.CHAPTER_ONTOPIC_REGEN;
    expect(isOnTopicRegenEnabled()).toBe(false);
  });

  it('is on only for the exact value "true"', () => {
    process.env.CHAPTER_ONTOPIC_REGEN = 'true';
    expect(isOnTopicRegenEnabled()).toBe(true);
    process.env.CHAPTER_ONTOPIC_REGEN = '1';
    expect(isOnTopicRegenEnabled()).toBe(false);
  });
});
