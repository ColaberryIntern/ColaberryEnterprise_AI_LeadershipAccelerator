import React from 'react';
import CondensedHeaderCard, { CondensedTone } from '../today/CondensedHeaderCard';
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

// Same sparkle mark the full hero's eyebrow uses, reused as the condensed
// card's leading icon for a consistent "next step" identity across sizes.
const SPARKLE = (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" /></svg>
);
// Conditional formatting: how urgent the single next task is drives the
// condensed chip's accent (overdue reads hot, "up next" reads calm).
/** The release (list) a task belongs to. */
function releaseOf(p: StudentProject, task: ProjectTask): ProjectList | null {
  return p.lists.find((l) => l.tasks.some((t) => t.id === task.id)) ?? null;
}

/**
 * "Release 0 · Initial Setup and Integration" reads as "Release 0" in a narrow
 * rail. Anything that is not a release keeps its own name (the demo-prep list).
 */
function releaseLabel(name: string | undefined): string {
  if (!name) return 'This build';
  const m = /^(Release\s+\d+)/i.exec(name);
  return m ? m[1] : name.split('·')[0].trim();
}

const DUE_TONE: Record<string, CondensedTone> = { overdue: 'cherry', today: 'amber', up: 'berry', done: 'leaf' };

// Single source of truth for the Projects "your next step" hero — the same
// primary/primaryNext state renders two different presentations (full body
// card vs. condensed header slot) so the two can never show conflicting info.
const ProjectsNextStepHero: React.FC<Props> = ({ primary, primaryNext, demo, variant, onOpenBuild, onCopyPrompt, onStartBuild }) => {
  if (variant === 'condensed') {
    if (primary && primaryNext) {
      return (
        <CondensedHeaderCard
          icon={SPARKLE}
          tone={DUE_TONE[primaryNext.task.due] ?? 'berry'}
          label={`Next step · ${primary.name}`}
          title={primaryNext.task.title}
          action={<button className="te-btn ghost sm" type="button" onClick={onOpenBuild}>Open →</button>}
        />
      );
    }
    if (primary) {
      return (
        <CondensedHeaderCard
          icon={SPARKLE}
          tone="leaf"
          label="Your next step"
          title={`${primary.name} is complete`}
          action={<button className="te-btn ghost sm" type="button" onClick={onOpenBuild}>Open →</button>}
        />
      );
    }
    return (
      <CondensedHeaderCard
        icon={SPARKLE}
        tone="berry"
        label="Your next step"
        title="Create your first build"
        action={<button className="te-btn ghost sm" type="button" onClick={onStartBuild}>Start →</button>}
      />
    );
  }

  // variant === 'full' — the SAME card the Classroom uses for "your next step",
  // with the release in the left rail where the week sits there. Deliberately
  // the same class names (`tl-nextweek`, `tl-nextweek-week`, `tl-nextweek-step`,
  // `tl-ptbadge`) rather than a lookalike built from `te-hero`: two cards doing
  // the same job on two pages should not be two implementations that drift.
  if (primary && primaryNext) {
    const release = releaseOf(primary, primaryNext.task);
    const inRelease = release ? release.tasks : [];
    const done = inRelease.filter((t) => t.state === 'done').length;
    const pct = inRelease.length ? Math.round((done / inRelease.length) * 100) : 0;
    const pts = primaryNext.task.points ?? 0;

    // Wrapped in `.tl-de`. Every rule for this card is scoped under it in
    // timeline.css (`.tl-de .tl-nextweek{...}`), so on a page that does not carry
    // that class the markup renders completely unstyled. Wrapping is the fix;
    // copying the rules into projects.css would be two implementations of one
    // card, which is what reusing the Classroom's markup was meant to avoid.
    return (
      <div className="tl-de">
        <div className="tl-card tl-nextweek" style={{ borderTopColor: primary.accent }}>
          <div className="tl-nextweek-week">
            <h3 style={{ textAlign: 'center' }}>{releaseLabel(release?.name)}</h3>
            <div className="tl-small" style={{ textAlign: 'center' }}>
              {inRelease.length} task{inRelease.length === 1 ? '' : 's'} this release
            </div>
            <div className="tl-prog"><i style={{ width: `${pct}%` }} /></div>
            <div className="tl-small" style={{ textAlign: 'center' }}>
              <b>{done}</b> of <b>{inRelease.length}</b> complete
            </div>
          </div>
          <div className="tl-nextweek-step">
            <div className="eyebrow">
              Your next step · {primary.name}
              {/* Only shown when the task actually carries points. An invented
                  number here would be the dashboard lying, on the first screen. */}
              {pts > 0 && <span className="tl-ptbadge">+{pts} pts</span>}
            </div>
            <h2>{primaryNext.task.title}</h2>
            {primaryNext.task.what && <p>{primaryNext.task.what}</p>}
            <div className="pjw-actions" style={{ marginTop: 0 }}>
              <button type="button" className="tl-btn primary" onClick={onOpenBuild}>Open</button>
              {primaryNext.task.prompt && (
                <button type="button" className="te-btn ghost" onClick={onCopyPrompt} disabled={demo} title={demo ? 'Demo — enroll to build for real' : undefined}>Copy prompt</button>
              )}
            </div>
          </div>
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
      <div className="eyebrow"><span style={{ width: 13, height: 13, display: 'inline-flex' }}>{SPARKLE}</span> Your next step</div>
      <h2>Create your first build</h2>
      <p>Describe an idea and we'll shape it into a scheduled build with lists and tasks — assembled in the background while you keep exploring.</p>
      <button className="te-btn cherry" onClick={onStartBuild}>Create a project</button>
    </div>
  );
};

export default ProjectsNextStepHero;
