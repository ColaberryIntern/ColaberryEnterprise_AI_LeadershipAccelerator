import { scoreChapterContent, ChapterQualityResult, ON_TOPIC_THRESHOLD } from '../../services/chapterQualityService';

/** On-topic lesson context: measuring ROI for AI projects. */
const roiCtx = {
  title: 'Calculating ROI for AI Initiatives',
  learningGoal: 'Measure Return on Investment (ROI) for AI projects',
  description: 'How executives quantify returns on AI spend.',
};

/** A fully populated, on-topic v2 chapter. */
function goodContent(): any {
  return {
    content_version: 'v2',
    concept_snapshot: {
      title: 'ROI Fundamentals',
      definition: 'Return on investment (ROI) measures the financial return of AI projects relative to their cost over time.',
      why_it_matters: 'Executives must justify AI spend by measuring return.',
      visual_metaphor: 'A scale weighing cost against return.',
    },
    ai_strategy: {
      description: 'Use AI to measure ROI by projecting returns on investment across candidate AI projects.',
      when_to_use_ai: ['Estimating returns', 'Comparing projects'],
      human_responsibilities: ['Validate assumptions', 'Approve investment'],
      suggested_prompt: 'Estimate the ROI for this AI project given these costs and returns.',
    },
    prompt_template: {
      template: 'Given {{company}} and its {{use_case}}, estimate the ROI and expected return on investment.',
      placeholders: ['company', 'use_case'],
      expected_output_shape: 'A short paragraph with an ROI percentage.',
    },
    implementation_task: {
      title: 'Compute ROI for your AI project',
      description: 'Calculate the return on investment for a chosen AI project using real cost and return figures.',
      requirements: ['Cost data', 'Return estimate'],
      deliverable: 'An ROI calculation worksheet.',
      getting_started: ['Gather costs', 'Estimate returns'],
    },
    knowledge_checks: [
      { question: 'What does ROI stand for?' },
      { question: 'Name one cost input.' },
      { question: 'Why measure ROI?' },
    ],
    reflection_questions: [
      { question: 'How will you measure returns?' },
      { question: 'What investment is justified?' },
    ],
  };
}

const sectionOf = (r: ChapterQualityResult, key: string) => r.sections.find((s) => s.section === key)!;

describe('chapterQualityService.scoreChapterContent', () => {
  describe('happy path', () => {
    it('scores complete, on-topic content as high confidence with no issues', () => {
      const r = scoreChapterContent(goodContent(), roiCtx);
      expect(r.overall_confidence).toBeGreaterThanOrEqual(90);
      expect(r.grade).toBe('A');
      expect(r.on_topic).toBe(true);
      expect(r.low_confidence).toBe(false);
      expect(r.sections).toHaveLength(6);
      expect(r.issues).toHaveLength(0);
    });
  });

  describe('failure path — missing sections', () => {
    it('flags low confidence and names the missing sections', () => {
      const content = goodContent();
      delete content.ai_strategy;
      content.knowledge_checks = [];
      const r = scoreChapterContent(content, roiCtx);

      expect(r.low_confidence).toBe(true);
      expect(r.overall_confidence).toBeLessThan(70);
      expect(r.issues).toContain('ai_strategy: section missing entirely');
      expect(r.issues).toContain('knowledge_checks: none present');
      expect(sectionOf(r, 'ai_strategy').confidence).toBe(0);
      expect(sectionOf(r, 'knowledge_checks').confidence).toBe(0);
    });
  });

  describe('boundary — empty and null input', () => {
    it('scores an empty object as F / zero confidence with every section missing', () => {
      const r = scoreChapterContent({}, roiCtx);
      expect(r.overall_confidence).toBe(0);
      expect(r.grade).toBe('F');
      expect(r.low_confidence).toBe(true);
      expect(r.on_topic).toBe(false);
      expect(r.sections).toHaveLength(6);
      expect(r.issues.length).toBeGreaterThan(0);
    });

    it('handles null content without throwing', () => {
      const r = scoreChapterContent(null, roiCtx);
      expect(r.overall_confidence).toBe(0);
      expect(r.grade).toBe('F');
      expect(r.issues).toContain('no content object to score');
      expect(r.sections).toHaveLength(0);
    });

    it('marks a thin definition as a partial completeness issue', () => {
      const content = goodContent();
      content.concept_snapshot.definition = 'Too short.';
      const r = scoreChapterContent(content, roiCtx);
      expect(r.issues).toContain('concept_snapshot: definition is thin (<40 chars)');
      expect(sectionOf(r, 'concept_snapshot').completeness).toBeLessThan(100);
    });
  });

  describe('on-topic detection', () => {
    it('flags complete-but-off-topic content as not on_topic', () => {
      const pastaCtx = { title: 'Cooking Pasta', learningGoal: 'Boil pasta al dente every time' };
      const r = scoreChapterContent(goodContent(), pastaCtx);
      expect(r.on_topic).toBe(false);
      expect(sectionOf(r, 'concept_snapshot').relevance).toBeLessThan(ON_TOPIC_THRESHOLD);
      expect(r.issues[0]).toMatch(/off-topic/i);
    });

    it('does not penalize relevance when no lesson topic is provided', () => {
      const r = scoreChapterContent(goodContent(), {});
      expect(r.on_topic).toBe(true);
      expect(r.overall_confidence).toBeGreaterThanOrEqual(90);
      expect(sectionOf(r, 'concept_snapshot').relevance).toBe(100);
    });
  });

  describe('prompt_template placeholder integrity', () => {
    it('flags undeclared and unused placeholders', () => {
      const content = goodContent();
      content.prompt_template = {
        template: 'Use {{company}} and {{undeclared}} here to plan the work.',
        placeholders: ['company', 'unused_var'],
        expected_output_shape: 'text',
      };
      const r = scoreChapterContent(content, roiCtx);
      const issues = sectionOf(r, 'prompt_template').issues.join(' | ');
      expect(issues).toMatch(/undeclared/);
      expect(issues).toMatch(/unused_var/);
      expect(issues).toMatch(/never used/);
    });
  });

  describe('knowledge_checks shape tolerance', () => {
    it('counts checks whether they are an array or an object of arrays', () => {
      const content = goodContent();
      content.knowledge_checks = { concept: [{ q: 1 }, { q: 2 }], strategy: [{ q: 3 }] };
      const r = scoreChapterContent(content, roiCtx);
      expect(sectionOf(r, 'knowledge_checks').completeness).toBe(100);
    });
  });

  describe('idempotency / purity', () => {
    it('returns an identical result for the same input and does not mutate it', () => {
      const input = goodContent();
      const snapshot = JSON.stringify(input);
      const a = scoreChapterContent(input, roiCtx);
      const b = scoreChapterContent(JSON.parse(snapshot), roiCtx);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      // scorer is pure — it must not attach _quality or otherwise mutate input
      expect(JSON.stringify(input)).toBe(snapshot);
      expect((input as any)._quality).toBeUndefined();
    });
  });
});
