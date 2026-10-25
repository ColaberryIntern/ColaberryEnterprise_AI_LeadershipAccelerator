import React from 'react';
import { STAGES, type CockpitTask, type Stage } from './cockpitModel';

/**
 * TaskBoard — the 4-column board (Not started / In build / Commit matched / Verified). AI build stories and human
 * proposal tasks share the board; the filter narrows to all / AI build / mine. A card is a button that opens the
 * task drawer. Pure presentational: it owns no data, only the filter choice it is handed.
 */
export type BoardFilter = 'all' | 'ai' | 'mine';

function matchesFilter(t: CockpitTask, f: BoardFilter): boolean {
  if (f === 'ai') return t.owner === 'ai';
  if (f === 'mine') return t.mine;
  return true;
}

function TaskCard({ task, onOpen }: { task: CockpitTask; onOpen: (t: CockpitTask) => void }): React.ReactElement {
  return (
    <button type="button" className="gck-tcard" onClick={() => onOpen(task)}>
      <div className="top">
        <span className="gck-key">{task.key}</span>
        <span className={`gck-tag ${task.owner === 'ai' ? 'ai' : 'human'}`}>{task.owner === 'ai' ? 'AI task' : 'You'}</span>
      </div>
      <div className="gck-title">{task.title}</div>
      <div className="gck-tags">
        <span className="gck-tag">{task.track === 'proposal' ? 'Proposal' : 'Build'}</span>
        {task.orphaned && <span className="gck-tag warn">preserved</span>}
        {task.openGapCount > 0 && <span className="gck-tag warn">{task.openGapCount} open gap{task.openGapCount === 1 ? '' : 's'}</span>}
        {task.stage === 'done' && <span className="gck-tag ok">{task.track === 'proposal' ? 'Approved' : 'Verified'}</span>}
      </div>
      {task.commit && (
        <div className="gck-commitline"><i className="ri-git-commit-line" aria-hidden="true" /><span>{task.commit.sha.slice(0, 7)} &middot; {task.commit.message}</span></div>
      )}
    </button>
  );
}

export default function TaskBoard(
  { tasks, filter, onFilter, onOpen }: { tasks: CockpitTask[]; filter: BoardFilter; onFilter: (f: BoardFilter) => void; onOpen: (t: CockpitTask) => void },
): React.ReactElement {
  const visible = tasks.filter((t) => matchesFilter(t, filter));
  const seg: Array<{ id: BoardFilter; label: string }> = [{ id: 'all', label: 'All' }, { id: 'ai', label: 'AI build' }, { id: 'mine', label: 'Mine' }];
  return (
    <section>
      <div className="gck-filters">
        <div className="gck-seg" role="group" aria-label="Filter tasks">
          {seg.map((s) => (
            <button key={s.id} type="button" aria-pressed={filter === s.id} onClick={() => onFilter(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="gck-board">
        {STAGES.map((st: { id: Stage; name: string; hint: string }) => {
          const items = visible.filter((t) => t.stage === st.id);
          return (
            <div className="gck-col" key={st.id}>
              <h3><span>{st.name}</span><span className="gck-num">{items.length}</span></h3>
              <p className="gck-hint">{st.hint}</p>
              {items.length === 0 ? <div className="gck-empty">Nothing here.</div> : items.map((t) => <TaskCard key={t.track + ':' + t.key} task={t} onOpen={onOpen} />)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
