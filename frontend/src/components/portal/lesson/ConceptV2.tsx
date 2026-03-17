import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ConceptSnapshot from './ConceptSnapshot';
import AIStrategy from './AIStrategy';
import PromptTemplate from './PromptTemplate';
import ImplementationTask from './ImplementationTask';
import KnowledgeChecks from './KnowledgeChecks';
import ReflectionQuestions from './ReflectionQuestions';
import LessonReactions from './LessonReactions';
import LLMChooser from './LLMChooser';
import ConfusionRecoveryDrawer from './ConfusionRecoveryDrawer';
import LessonStepTracker, { StepInfo } from './LessonStepTracker';
import SectionStepLabel from './SectionStepLabel';
import SectionOutputPanel from './SectionOutputPanel';
import { useMentorContext } from '../../../contexts/MentorContext';

interface ConceptV2Props {
  content: any;
  lessonId: string;
  isCompleted: boolean;
  onCanCompleteChange?: (canComplete: boolean) => void;
  onQuizScoreChange?: (score: number) => void;
  onStepStatusChange?: (steps: StepInfo[]) => void;
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

export default function ConceptV2({ content, lessonId, isCompleted, onCanCompleteChange, onQuizScoreChange, onStepStatusChange, quizResponses, taskData }: ConceptV2Props) {
  const { sendToMentor } = useMentorContext();
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [showConfusionDrawer, setShowConfusionDrawer] = useState(false);

  // Step tracking state
  const [conceptViewed, setConceptViewed] = useState(false);
  const [strategyViewed, setStrategyViewed] = useState(false);
  const [promptGenerated, setPromptGenerated] = useState(false);
  const [artifactsVerified, setArtifactsVerified] = useState(false);
  const [reflectionDone, setReflectionDone] = useState(false);

  const legacy = isLegacyChecks(content.knowledge_checks);
  const allChecks = legacy ? content.knowledge_checks : collectAllChecks(content.knowledge_checks);
  const hasQuiz = allChecks.length > 0;
  const hasTask = !!content.implementation_task;

  // Get reflection questions from either top-level or knowledge_checks.reflection
  const reflectionData = content.reflection_questions ||
    (content.knowledge_checks && !Array.isArray(content.knowledge_checks) ? content.knowledge_checks.reflection : null);

  // Auto-view tracking for Concept (2s timer)
  useEffect(() => {
    if (content.concept_snapshot && !conceptViewed) {
      const timer = setTimeout(() => setConceptViewed(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [content.concept_snapshot, conceptViewed]);

  // Auto-view tracking for Strategy (2s timer)
  useEffect(() => {
    if (content.ai_strategy && !strategyViewed) {
      const timer = setTimeout(() => setStrategyViewed(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [content.ai_strategy, strategyViewed]);

  // Derive steps from content presence + tracking state
  const steps = useMemo(() => {
    const presentSteps: { key: string; label: string; icon: string; isDone: boolean }[] = [];

    if (content.concept_snapshot) {
      presentSteps.push({ key: 'concept', label: 'Concept', icon: 'bi-lightbulb', isDone: conceptViewed });
    }
    if (content.ai_strategy) {
      presentSteps.push({ key: 'strategy', label: 'AI Strategy', icon: 'bi-cpu', isDone: strategyViewed });
    }
    if (content.prompt_template) {
      presentSteps.push({ key: 'prompt', label: 'Prompt Lab', icon: 'bi-terminal', isDone: promptGenerated });
    }
    if (hasTask) {
      presentSteps.push({ key: 'task', label: 'Execute', icon: 'bi-rocket', isDone: taskSubmitted });
    }
    if (hasQuiz) {
      presentSteps.push({ key: 'check', label: 'Check', icon: 'bi-patch-question', isDone: quizScore !== null });
    }
    if (reflectionData) {
      presentSteps.push({ key: 'reflect', label: 'Reflect', icon: 'bi-chat-square-quote', isDone: reflectionDone });
    }

    // Determine status: completed → first non-completed is active → rest upcoming
    let foundActive = false;
    const result: StepInfo[] = presentSteps.map(s => {
      if (s.isDone) return { key: s.key, label: s.label, icon: s.icon, status: 'completed' as const };
      if (!foundActive) { foundActive = true; return { key: s.key, label: s.label, icon: s.icon, status: 'active' as const }; }
      return { key: s.key, label: s.label, icon: s.icon, status: 'upcoming' as const };
    });

    return result;
  }, [content.concept_snapshot, content.ai_strategy, content.prompt_template, hasTask, hasQuiz, reflectionData, conceptViewed, strategyViewed, promptGenerated, taskSubmitted, quizScore, reflectionDone]);

  const activeIndex = steps.findIndex(s => s.status === 'active');
  const currentStepIndex = activeIndex >= 0 ? activeIndex : steps.length - 1;

  // Notify parent of step changes
  useEffect(() => {
    onStepStatusChange?.(steps);
  }, [steps, onStepStatusChange]);

  // Artifact enforcement in canComplete
  useEffect(() => {
    const quizOk = !hasQuiz || quizScore !== null;
    const taskOk = !hasTask || taskSubmitted;
    const artifactOk = !hasTask || artifactsVerified || !content.implementation_task?.required_artifacts?.length;
    const canComplete = quizOk && taskOk && artifactOk;
    onCanCompleteChange?.(canComplete);
  }, [quizScore, taskSubmitted, artifactsVerified, hasQuiz, hasTask, content.implementation_task, onCanCompleteChange]);

  const handleQuizComplete = (score: number) => {
    setQuizScore(score);
    onQuizScoreChange?.(score);
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

  // Helper to get step status by key
  const stepStatus = (key: string): 'completed' | 'active' | 'upcoming' => {
    const s = steps.find(st => st.key === key);
    return s?.status || 'upcoming';
  };
  const stepNumber = (key: string): number => {
    const idx = steps.findIndex(st => st.key === key);
    return idx >= 0 ? idx + 1 : 0;
  };

  return (
    <div>
      {/* Step Tracker */}
      {steps.length > 1 && (
        <LessonStepTracker steps={steps} currentStepIndex={currentStepIndex} />
      )}

      {/* Section Output Panel */}
      <SectionOutputPanel
        conceptViewed={conceptViewed}
        strategyViewed={strategyViewed}
        promptGenerated={promptGenerated}
        taskSubmitted={taskSubmitted}
        artifactCount={content.implementation_task?.required_artifacts?.length || 0}
        artifactsUploaded={artifactsVerified ? (content.implementation_task?.required_artifacts?.length || 0) : 0}
        quizScore={quizScore}
        hasQuiz={hasQuiz}
        reflectionDone={reflectionDone}
        hasReflection={!!reflectionData}
      />

      <div className="d-flex justify-content-end mb-2">
        <LLMChooser />
      </div>

      {content.concept_snapshot && (
        <>
          <SectionStepLabel stepNumber={stepNumber('concept')} totalSteps={steps.length} label="Concept" status={stepStatus('concept')} />
          <ConceptSnapshot data={content.concept_snapshot} />
        </>
      )}

      {content.ai_strategy && (
        <>
          <SectionStepLabel stepNumber={stepNumber('strategy')} totalSteps={steps.length} label="AI Strategy" status={stepStatus('strategy')} />
          <AIStrategy data={content.ai_strategy} />
        </>
      )}

      {content.prompt_template && (
        <>
          <SectionStepLabel stepNumber={stepNumber('prompt')} totalSteps={steps.length} label="Prompt Lab" status={stepStatus('prompt')} />
          <PromptTemplate
            data={content.prompt_template}
            onPromptGenerated={() => setPromptGenerated(true)}
            conceptSnapshot={content.concept_snapshot}
            aiStrategy={content.ai_strategy}
            implementationTask={content.implementation_task}
          />
        </>
      )}

      {content.implementation_task && (
        <>
          <SectionStepLabel stepNumber={stepNumber('task')} totalSteps={steps.length} label="Launch Your Build" status={stepStatus('task')} />
          <ImplementationTask
            data={content.implementation_task}
            lessonId={lessonId}
            onSubmit={handleTaskSubmit}
            onArtifactsVerified={(v) => setArtifactsVerified(v)}
            initialTaskData={taskData}
          />
        </>
      )}

      {/* Consolidated Knowledge Check — all quiz questions in one place */}
      {hasQuiz && (
        <>
          <SectionStepLabel stepNumber={stepNumber('check')} totalSteps={steps.length} label="Knowledge Check" status={stepStatus('check')} />
          <KnowledgeChecks
            data={allChecks}
            lessonId={lessonId}
            onComplete={handleQuizComplete}
            initialAnswers={quizResponses}
            onSaveProgress={handleSaveQuizProgress}
          />
        </>
      )}

      {/* Reflection */}
      {reflectionData && (
        <>
          <SectionStepLabel stepNumber={stepNumber('reflect')} totalSteps={steps.length} label="Reflect" status={stepStatus('reflect')} />
          <ReflectionQuestions data={reflectionData} lessonId={lessonId} onReflectionDone={() => setReflectionDone(true)} />
        </>
      )}

      <LessonReactions onConfused={() => setShowConfusionDrawer(true)} />

      <ConfusionRecoveryDrawer
        mode="lesson"
        isOpen={showConfusionDrawer}
        onClose={() => setShowConfusionDrawer(false)}
        lessonId={lessonId}
        lessonTitle={content.concept_snapshot?.title || 'this lesson'}
      />
    </div>
  );
}
