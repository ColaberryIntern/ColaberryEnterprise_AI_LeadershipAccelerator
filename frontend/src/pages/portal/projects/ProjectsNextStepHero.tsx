import React from 'react';
import CondensedHeaderCard from '../today/CondensedHeaderCard';
import { StudentProject, ProjectTask, ProjectList } from './projectsStore';

type Props = {
  primary: StudentProject | null;
  primaryNext: { task: ProjectTask; list: ProjectList } | null;
  demo: boolean;
  variant: 'full' | 'condensed';
  onOpenBuild: () => void;
  onCopyPrompt: () => void;
  onStartBuild: () => void;
};

// Single source of truth for the Projects "your next step" hero — the same
// primary/primaryNext state renders two different presentations (full body
// card vs. condensed header slot) so the two can never show conflicting info.
const ProjectsNextStepHero: React.FC<Props> = ({ primary, primaryNext, demo, variant, onOpenBuild, onCopyPrompt, onStartBuild }) => {
  if (variant === 'condensed') {
    if (primary && primaryNext) {
      return (
        <CondensedHeaderCard
          label={`Next step · ${primary.name}`}
          title={primaryNext.task.title}
          action={<button className="te-btn ghost sm" type="button" onClick={onOpenBuild}>Open →</button>}
        />
      );
    }
    if (primary) {
      return (
        <CondensedHeaderCard
          label="Your next step"
          title={`${primary.name} is complete`}
          action={<button className="te-btn ghost sm" type="button" onClick={onOpenBuild}>Open →</button>}
        />
      );
    }
    return (
      <CondensedHeaderCard
        label="Your next step"
        title="Create your first build"
        action={<button className="te-btn ghost sm" type="button" onClick={onStartBuild}>Start →</button>}
      />
    );
  }

  // variant === 'full' — the original body hero, unchanged markup.
  if (primary && primaryNext) {
    return (
      <div className="te-hero">
        <div className="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg> Your next step · {primary.name}</div>
        <h2>{primaryNext.task.title}</h2>
        <p>{primaryNext.task.what || 'Pick this up next to keep your build moving.'}</p>
        <div className="pjw-actions" style={{ marginTop: 0 }}>
          <button className="te-btn cherry" onClick={onOpenBuild}>Open your build</button>
          {primaryNext.task.prompt && (
            <button className="te-btn ghost" onClick={onCopyPrompt} disabled={demo} title={demo ? 'Demo — enroll to build for real' : undefined}>Copy prompt</button>
          )}
        </div>
      </div>
    );
  }
  if (primary) {
    return (
      <div className="te-hero">
        <div className="eyebrow">Your next step</div>
        <h2>{primary.name} is complete</h2>
        <p>Every task on your build is done. Start another build, or review what you shipped.</p>
        <div className="pjw-actions" style={{ marginTop: 0 }}>
          <button className="te-btn cherry" onClick={onStartBuild}>Start a new build</button>
          <button className="te-btn ghost" onClick={onOpenBuild}>Open your build</button>
        </div>
      </div>
    );
  }
  return (
    <div className="te-hero">
      <div className="eyebrow"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg> Your next step</div>
      <h2>Create your first build</h2>
      <p>Describe an idea and we'll shape it into a scheduled build with lists and tasks — assembled in the background while you keep exploring.</p>
      <button className="te-btn cherry" onClick={onStartBuild}>Create a project</button>
    </div>
  );
};

export default ProjectsNextStepHero;
