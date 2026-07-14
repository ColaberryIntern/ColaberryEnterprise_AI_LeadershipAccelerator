import React, { useEffect } from 'react';
import ConceptV1 from './ConceptV1';
import ConceptV2 from './ConceptV2';
import WeekFeedbackSurvey from './WeekFeedbackSurvey';
import { StepInfo } from './LessonStepTracker';

interface ConceptLessonProps {
  content: any;
  lessonId: string;
  isCompleted: boolean;
  onCanCompleteChange?: (canComplete: boolean) => void;
  onQuizScoreChange?: (score: number) => void;
  onStepStatusChange?: (steps: StepInfo[]) => void;
  quizResponses?: any;
  taskData?: any;
  surveyResponses?: Record<string, number | string>;
}

export default function ConceptLesson({ content, lessonId, isCompleted, onCanCompleteChange, onQuizScoreChange, onStepStatusChange, quizResponses, taskData, surveyResponses }: ConceptLessonProps) {
  // Survey-type assessment: renders WeekFeedbackSurvey instead of ConceptV2
  if (content.quiz_type === 'survey' && Array.isArray(content.survey_questions)) {
    return (
      <SurveyLesson
        content={content}
        lessonId={lessonId}
        isCompleted={isCompleted}
        onCanCompleteChange={onCanCompleteChange}
        surveyResponses={surveyResponses}
      />
    );
  }

  // Legacy V1 fallback only for cached content without V2 markers
  if (content.content_version !== 'v2' && !content.concept_snapshot && content.concept_explanation) {
    return <ConceptV1 content={content} />;
  }
  return (
    <ConceptV2
      content={content}
      lessonId={lessonId}
      isCompleted={isCompleted}
      onCanCompleteChange={onCanCompleteChange}
      onQuizScoreChange={onQuizScoreChange}
      onStepStatusChange={onStepStatusChange}
      quizResponses={quizResponses}
      taskData={taskData}
    />
  );
}

interface SurveyLessonProps {
  content: any;
  lessonId: string;
  isCompleted: boolean;
  onCanCompleteChange?: (canComplete: boolean) => void;
  surveyResponses?: Record<string, number | string>;
}

function SurveyLesson({ content, lessonId, isCompleted, onCanCompleteChange, surveyResponses }: SurveyLessonProps) {
  const initialResponses = surveyResponses || {};
  const alreadyDone = isCompleted || Object.keys(initialResponses).length >= (content.survey_questions?.length || 0);

  useEffect(() => {
    if (alreadyDone) onCanCompleteChange?.(true);
  }, [alreadyDone, onCanCompleteChange]);

  return (
    <WeekFeedbackSurvey
      questions={content.survey_questions}
      lessonId={lessonId}
      weekNumber={content.week_number || 0}
      isCompleted={alreadyDone}
      initialResponses={initialResponses}
      onComplete={() => onCanCompleteChange?.(true)}
    />
  );
}
