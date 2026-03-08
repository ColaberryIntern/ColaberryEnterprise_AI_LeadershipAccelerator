import React, { useState, useEffect, useCallback } from 'react';
import ConceptSnapshot from './ConceptSnapshot';
import AIStrategy from './AIStrategy';
import PromptTemplate from './PromptTemplate';
import ImplementationTask from './ImplementationTask';
import KnowledgeChecks from './KnowledgeChecks';
import ReflectionQuestions from './ReflectionQuestions';
import LessonReactions from './LessonReactions';
import LLMChooser from './LLMChooser';
import { useMentorContext } from '../../../contexts/MentorContext';

interface ConceptV2Props {
  content: any;
  lessonId: string;
  isCompleted: boolean;
  onCanCompleteChange?: (canComplete: boolean) => void;
  quizResponses?: Record<number, { answer: string; correct: boolean }>;
  taskData?: any;
}

/**
 * Collect all quiz-type knowledge checks from a section-keyed object into one flat array.
 * Excludes 'reflection' which are reflection questions, not quiz questions.
 */
function collectAllChecks(knowledgeChecks: any): any[] {
  if (!knowledgeChecks || Array.isArray(knowledgeChecks)) return [];
  const quizSections = ['concept_snapshot', 'ai_strategy', 'prompt_template', 'implementation_task'];
  const all: any[] = [];
  for (const key of quizSections) {
    const checks = knowledgeChecks[key];
    if (Array.isArray(checks)) {
      all.push(...checks);
    }
  }
  return all;
}

function isLegacyChecks(knowledgeChecks: any): boolean {
  return Array.isArray(knowledgeChecks) && knowledgeChecks.length > 0;
}

export default function ConceptV2({ content, lessonId, isCompleted, onCanCompleteChange, quizResponses, taskData }: ConceptV2Props) {
  const { sendToMentor } = useMentorContext();
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [taskSubmitted, setTaskSubmitted] = useState(false);

  const legacy = isLegacyChecks(content.knowledge_checks);
  const allChecks = legacy ? content.knowledge_checks : collectAllChecks(content.knowledge_checks);
  const hasQuiz = allChecks.length > 0;
  const hasTask = !!content.implementation_task;

  // Get reflection questions from either top-level or knowledge_checks.reflection
  const reflectionData = content.reflection_questions ||
    (content.knowledge_checks && !Array.isArray(content.knowledge_checks) ? content.knowledge_checks.reflection : null);

  useEffect(() => {
    const quizOk = !hasQuiz || quizScore !== null;
    const taskOk = !hasTask || taskSubmitted;
    const canComplete = quizOk && taskOk;
    onCanCompleteChange?.(canComplete);
  }, [quizScore, taskSubmitted, hasQuiz, hasTask, onCanCompleteChange]);

  const handleQuizComplete = (score: number) => {
    setQuizScore(score);
  };

  const handleTaskSubmit = () => {
    setTaskSubmitted(true);
  };

  const handleSaveQuizProgress = useCallback((questionIndex: number, answer: string, correct: boolean) => {
    const token = localStorage.getItem('participant_token');
    if (!token) return;
    fetch(`/api/portal/curriculum/lessons/${lessonId}/quiz-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ [questionIndex]: { answer, correct } }),
    }).catch(() => {}); // Fire and forget
  }, [lessonId]);

  return (
    <div>
      <div className="d-flex justify-content-end mb-2">
        <LLMChooser />
      </div>

      {content.concept_snapshot && <ConceptSnapshot data={content.concept_snapshot} />}

      {content.ai_strategy && <AIStrategy data={content.ai_strategy} />}

      {content.prompt_template && <PromptTemplate data={content.prompt_template} />}

      {content.implementation_task && (
        <ImplementationTask
          data={content.implementation_task}
          lessonId={lessonId}
          onSubmit={handleTaskSubmit}
          initialTaskData={taskData}
        />
      )}

      {/* Consolidated Knowledge Check — all quiz questions in one place */}
      {hasQuiz && (
        <KnowledgeChecks
          data={allChecks}
          lessonId={lessonId}
          onComplete={handleQuizComplete}
          initialAnswers={quizResponses}
          onSaveProgress={handleSaveQuizProgress}
        />
      )}

      {/* Reflection */}
      {reflectionData && <ReflectionQuestions data={reflectionData} lessonId={lessonId} />}

      <LessonReactions onConfused={() => {
        sendToMentor(
          `I'm confused about the lesson "${content.concept_snapshot?.title || 'this lesson'}". Can you explain the key concepts in a simpler way?`,
          'lesson_confusion'
        );
      }} />
    </div>
  );
}
