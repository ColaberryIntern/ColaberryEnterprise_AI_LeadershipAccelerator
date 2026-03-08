import React from 'react';
import ConceptV1 from './ConceptV1';
import ConceptV2 from './ConceptV2';

interface ConceptLessonProps {
  content: any;
  lessonId: string;
  isCompleted: boolean;
  onCanCompleteChange?: (canComplete: boolean) => void;
  onQuizScoreChange?: (score: number) => void;
  quizResponses?: any;
  taskData?: any;
}

export default function ConceptLesson({ content, lessonId, isCompleted, onCanCompleteChange, onQuizScoreChange, quizResponses, taskData }: ConceptLessonProps) {
  if (content.content_version === 'v2') {
    return (
      <ConceptV2
        content={content}
        lessonId={lessonId}
        isCompleted={isCompleted}
        onCanCompleteChange={onCanCompleteChange}
        onQuizScoreChange={onQuizScoreChange}
        quizResponses={quizResponses}
        taskData={taskData}
      />
    );
  }
  return <ConceptV1 content={content} />;
}
