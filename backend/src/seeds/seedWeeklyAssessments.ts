/**
 * seedWeeklyAssessments.ts
 *
 * Adds 3 assessment CurriculumLessons to each module in a cohort:
 *   lesson_number 0  → 5-question warmup MCQ (diagnostic, no pass gate)
 *   lesson_number 98 → 10-question post-quiz MCQ (70% pass gate)
 *   lesson_number 99 → 5-question feedback survey (3 Likert + 2 open-text)
 *
 * Content (actual questions) comes from Swati/CB. This seed ships PLACEHOLDER
 * questions tagged "[PLACEHOLDER]" so the engine is testable immediately.
 *
 * Usage:
 *   COHORT_ID=<uuid> npx ts-node src/seeds/seedWeeklyAssessments.ts
 *   # Without COHORT_ID: targets the first cohort found.
 *
 * Idempotent: checks for existing assessment lessons by lesson_number before inserting.
 * Safe to run multiple times.
 */

import { connectDatabase } from '../config/database';
import '../models';
import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';

interface MCQQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

interface SurveyQuestion {
  key: string;
  type: 'likert' | 'open_text';
  question: string;
}

const WEEK_TOPICS: Record<number, string> = {
  1: 'Claude Code Foundations',
  2: 'Agent Skills',
  3: 'Claude API and Workflow Assistant',
  4: 'Prompt Engineering',
  5: 'MCP Foundations',
  6: 'Advanced MCP',
  7: 'Subagents and Multi-Agent Teams',
  8: 'Workflows and Automation',
  9: 'AI Reliability and Safety',
  10: 'AI Governance',
  11: 'Systems Architecture',
  12: 'Capstone and Expo',
};

function makeWarmupQuestions(weekNum: number, topic: string): MCQQuestion[] {
  const base: MCQQuestion[] = [
    {
      question: `[PLACEHOLDER W${weekNum}] What is the primary focus of ${topic}?`,
      options: [
        `Core principle of ${topic}`,
        'Unrelated concept A',
        'Unrelated concept B',
        'Unrelated concept C',
      ],
      correct_index: 0,
      explanation: `[PLACEHOLDER] This question will be replaced by Swati/CB with Week ${weekNum} pre-knowledge content.`,
    },
    {
      question: `[PLACEHOLDER W${weekNum}] Before this week, which statement best describes your experience with ${topic}?`,
      options: [
        'No prior experience',
        'Heard of it but never used it',
        'Used it occasionally',
        'Use it regularly',
      ],
      correct_index: 3,
      explanation: `[PLACEHOLDER] Diagnostic question — any answer is informative. Will be replaced by Swati/CB.`,
    },
    {
      question: `[PLACEHOLDER W${weekNum}] Which of the following is a key benefit of ${topic}?`,
      options: [
        `Improved efficiency related to ${topic}`,
        'Reduced code quality',
        'Slower delivery cycles',
        'Increased manual work',
      ],
      correct_index: 0,
      explanation: `[PLACEHOLDER] Replace with specific Week ${weekNum} benefit question per Swati/CB content.`,
    },
    {
      question: `[PLACEHOLDER W${weekNum}] What prerequisite knowledge is most relevant to ${topic}?`,
      options: [
        'Basic programming concepts',
        'Advanced hardware design',
        'Physical infrastructure management',
        'No prerequisites needed',
      ],
      correct_index: 0,
      explanation: `[PLACEHOLDER] Replace with Week ${weekNum} prerequisite question per Swati/CB content.`,
    },
    {
      question: `[PLACEHOLDER W${weekNum}] In what context is ${topic} most commonly applied?`,
      options: [
        'AI system development and deployment',
        'Traditional database administration',
        'Hardware circuit design',
        'Physical network cabling',
      ],
      correct_index: 0,
      explanation: `[PLACEHOLDER] Replace with Week ${weekNum} application-context question per Swati/CB.`,
    },
  ];
  return base;
}

function makePostQuizQuestions(weekNum: number, topic: string): MCQQuestion[] {
  const questions: MCQQuestion[] = [];
  for (let i = 1; i <= 10; i++) {
    questions.push({
      question: `[PLACEHOLDER W${weekNum} Q${i}] Post-quiz question ${i} for ${topic}. Replace with Swati/CB content.`,
      options: [
        `Correct answer for Q${i} (${topic})`,
        `Distractor A for Q${i}`,
        `Distractor B for Q${i}`,
        `Distractor C for Q${i}`,
      ],
      correct_index: 0,
      explanation: `[PLACEHOLDER] This is post-quiz question ${i} for Week ${weekNum} (${topic}). Swati/CB will replace with validated content.`,
    });
  }
  return questions;
}

const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: 'content_usefulness',
    type: 'likert',
    question: 'How useful was this week\'s content for your role?',
  },
  {
    key: 'clarity',
    type: 'likert',
    question: 'How clearly were the learning objectives explained?',
  },
  {
    key: 'confidence',
    type: 'likert',
    question: 'How confident do you feel applying this week\'s concepts?',
  },
  {
    key: 'top_learning',
    type: 'open_text',
    question: 'What was the most valuable thing you learned this week?',
  },
  {
    key: 'open_questions',
    type: 'open_text',
    question: 'What questions or challenges do you still have after this week?',
  },
];

async function seedWeeklyAssessments() {
  await connectDatabase();

  const cohortId = process.env.COHORT_ID;
  const where = cohortId ? { cohort_id: cohortId } : {};

  const modules = await CurriculumModule.findAll({
    where,
    order: [['module_number', 'ASC']],
  });

  if (modules.length === 0) {
    console.log('No modules found. Set COHORT_ID env var or seed modules first.');
    process.exit(0);
  }

  console.log(`Found ${modules.length} module(s). Adding assessment lessons...`);

  let created = 0;
  let skipped = 0;

  for (const mod of modules) {
    const weekNum = mod.module_number;
    const topic = WEEK_TOPICS[weekNum] || `Week ${weekNum}`;

    const existing = await CurriculumLesson.findAll({
      where: { module_id: mod.id },
      attributes: ['lesson_number'],
    });
    const existingNumbers = new Set(existing.map((l) => l.lesson_number));

    const toInsert: Array<{
      lesson_number: number;
      title: string;
      lesson_type: 'assessment' | 'reflection';
      description: string;
      estimated_minutes: number;
      completion_requirements: Record<string, any>;
      content_template_json: Record<string, any>;
    }> = [];

    if (!existingNumbers.has(0)) {
      toInsert.push({
        lesson_number: 0,
        title: `Week ${weekNum} Warmup Quiz`,
        lesson_type: 'assessment',
        description: `5-question diagnostic warmup for ${topic}. Assesses prior knowledge before the course. No pass gate.`,
        estimated_minutes: 10,
        completion_requirements: { quiz_pass_score: 0 },
        content_template_json: {
          quiz_type: 'warmup',
          week_number: weekNum,
          knowledge_checks: makeWarmupQuestions(weekNum, topic),
        },
      });
    } else {
      skipped++;
    }

    if (!existingNumbers.has(98)) {
      toInsert.push({
        lesson_number: 98,
        title: `Week ${weekNum} Post-Quiz`,
        lesson_type: 'assessment',
        description: `10-question post-quiz for ${topic}. Validates mastery after completing the week's content. 70% pass required.`,
        estimated_minutes: 20,
        completion_requirements: { quiz_pass_score: 70 },
        content_template_json: {
          quiz_type: 'post_quiz',
          week_number: weekNum,
          knowledge_checks: makePostQuizQuestions(weekNum, topic),
        },
      });
    } else {
      skipped++;
    }

    if (!existingNumbers.has(99)) {
      toInsert.push({
        lesson_number: 99,
        title: `Week ${weekNum} Feedback Survey`,
        lesson_type: 'reflection',
        description: `5-question feedback survey for ${topic}. Captures learning experience and open questions.`,
        estimated_minutes: 5,
        completion_requirements: {},
        content_template_json: {
          quiz_type: 'survey',
          week_number: weekNum,
          survey_questions: SURVEY_QUESTIONS,
        },
      });
    } else {
      skipped++;
    }

    for (const def of toInsert) {
      await CurriculumLesson.create({
        module_id: mod.id,
        lesson_number: def.lesson_number,
        title: def.title,
        lesson_type: def.lesson_type,
        description: def.description,
        estimated_minutes: def.estimated_minutes,
        requires_structured_input: false,
        completion_requirements: def.completion_requirements,
        content_template_json: def.content_template_json,
        sort_order: def.lesson_number,
        mandatory: true,
      });
      console.log(`  ✓ Module ${weekNum} (${mod.id.slice(0, 8)}…): created "${def.title}"`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, skipped (already existed): ${skipped}`);
  process.exit(0);
}

seedWeeklyAssessments().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
