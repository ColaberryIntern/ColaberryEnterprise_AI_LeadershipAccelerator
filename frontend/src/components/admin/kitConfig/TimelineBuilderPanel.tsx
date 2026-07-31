import React, { useCallback, useState } from 'react';
import {
  DndContext, useDroppable, pointerWithin, rectIntersection,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  DragEndEvent, CollisionDetection,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CountAndOverride, StoryBeatOverride, TeachSlideOverride, PromptOverride, InteractionPlacement,
  CheckpointLandmark, BreakLandmark, TimelineSegment, CategoryKey, resolveTimelineList, moveItemOnDrop, SEGMENT_OPTIONS,
} from './types';

/**
 * TimelineBuilderPanel — the whole class laid out against the real run-of-show
 * clock: every Lesson/Prompt/Question/Story Beat in its lane, drag to reorder
 * within a segment or drag across lanes to re-place it (changes `.segment`),
 * plus checkpoints/the break rendered as read-only landmarks. Click a card to
 * jump to that category's own full editor (already built in earlier phases) —
 * this view is a map of the class, not a second copy of the field editors.
 *
 * Reuses the exact lane/droppable convention TimelineEditorTab.tsx established
 * (`lane::<id>` droppable prefix, pointer-first collision detection that
 * prefers a card over the lane background) — one independent DndContext per
 * category track, since each category is its own separate array; a shared
 * board would make cross-category drops ambiguous for no real benefit.
 */

const LABEL_COL_WIDTH = 148;

function segmentLabel(id: string): string {
  for (const g of SEGMENT_OPTIONS) {
    const hit = g.options.find((o) => o.value === id);
    if (hit) return hit.label;
  }
  return id;
}

const TimelineLane: React.FC<{ segmentId: string; width: number; children: React.ReactNode }> = ({ segmentId, width, children }) => {
  const { isOver, setNodeRef } = useDroppable({ id: `lane::${segmentId}` });
  return (
    <div ref={setNodeRef} style={{ flex: `${Math.max(width, 1)} 1 0`, minWidth: 88, background: isOver ? 'rgba(54,120,149,.12)' : undefined }}
      className="border-end p-1" data-testid={`lane-${segmentId}`}>
      {children}
    </div>
  );
};

const TimelineCard: React.FC<{ id: string; capped?: boolean; onClick: () => void; children: React.ReactNode }> = ({ id, capped, onClick, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.35 : capped ? 0.55 : 1, cursor: 'grab', touchAction: 'none',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="rounded-2 border bg-white shadow-sm p-2 mb-1 small" onClick={onClick} title={capped ? "Beyond this category's cap — won't render tonight" : 'Click to edit · drag to move'}>
      {children}
      {capped && <div className="text-danger" style={{ fontSize: '.65rem' }}>over cap</div>}
    </div>
  );
};

/** One draggable, re-segmentable category row. Generic over T so the same
 * drag/drop/cap-badge machinery serves Lessons/Prompts/Questions/Story Beats
 * without four near-duplicate implementations. */
function SegmentTrack<T>({
  icon, label, items, max, segments, getSegment, setSegment, renderCard, onChange, onCardClick, emptyNote,
}: {
  icon: string; label: string; items: T[]; max: number | null; segments: TimelineSegment[];
  getSegment: (item: T) => string; setSegment: (item: T, seg: string) => T;
  renderCard: (item: T) => React.ReactNode;
  onChange: (next: T[]) => void; onCardClick: () => void; emptyNote: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length ? pointerHits : rectIntersection(args);
    const cardHit = hits.find((h) => !String(h.id).startsWith('lane::'));
    return cardHit ? [cardHit] : hits;
  }, []);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeIndex = Number(String(active.id).slice('card::'.length));
    if (Number.isNaN(activeIndex)) return;
    const next = moveItemOnDrop(items, activeIndex, String(over.id), getSegment, setSegment);
    if (next !== items) onChange(next);
  };

  const row = (
    <div className="d-flex border-top">
      <div style={{ width: LABEL_COL_WIDTH, flex: `0 0 ${LABEL_COL_WIDTH}px` }} className="small fw-semibold px-2 py-2">{icon} {label}</div>
      <div className="d-flex flex-grow-1" style={{ minWidth: 0 }}>
        {segments.map((seg) => {
          const segItems = items.map((it, i) => ({ it, i })).filter((x) => getSegment(x.it) === seg.id);
          // The break segment is never a valid content slot — the deck never
          // pushes Lessons/Prompts/Questions/Story Beats there (only the one
          // fixed "Short break" slide). Render it as a non-droppable cell
          // (no useDroppable, no SortableContext) so a drag can never land a
          // card there and silently produce content that never renders —
          // but still SHOW any item already (mis)assigned to it, flagged, so
          // that pre-existing bad data is visible and fixable rather than
          // silently hidden from this view.
          if (seg.mode === 'break') {
            return (
              <div key={seg.id} style={{ flex: `${Math.max(seg.endMin - seg.startMin, 1)} 1 0`, minWidth: 88, background: '#f7f4ee' }} className="border-end p-1">
                {segItems.map((x) => (
                  <div key={x.i} className="rounded-2 border border-danger-subtle bg-white p-2 mb-1 small" style={{ cursor: 'pointer' }}
                    onClick={onCardClick} title="Assigned to the break — this will never render. Click to open its editor and move it to a real segment.">
                    {renderCard(x.it)}
                    <div className="text-danger" style={{ fontSize: '.62rem' }}>won't render (break)</div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <TimelineLane key={seg.id} segmentId={seg.id} width={seg.endMin - seg.startMin}>
              {!segItems.length ? null : (
                <SortableContext items={segItems.map((x) => `card::${x.i}`)} strategy={verticalListSortingStrategy}>
                  {segItems.map((x) => (
                    <TimelineCard key={`card::${x.i}`} id={`card::${x.i}`} capped={max != null && x.i >= max} onClick={onCardClick}>
                      {renderCard(x.it)}
                    </TimelineCard>
                  ))}
                </SortableContext>
              )}
            </TimelineLane>
          );
        })}
      </div>
    </div>
  );

  if (!items.length) {
    return (
      <div className="d-flex border-top">
        <div style={{ width: LABEL_COL_WIDTH, flex: `0 0 ${LABEL_COL_WIDTH}px` }} className="small fw-semibold px-2 py-2">{icon} {label}</div>
        <div className="text-muted small px-2 py-2">{emptyNote}</div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
      {row}
    </DndContext>
  );
}

interface Props {
  dayKind: 'orientation' | 'architecture' | 'build';
  segments: TimelineSegment[];
  checkpoints: CheckpointLandmark[];
  breakSegment: BreakLandmark | null;
  storyBeats: { config: CountAndOverride<StoryBeatOverride>; defaults: StoryBeatOverride[] };
  teach: { config: CountAndOverride<TeachSlideOverride>; defaults: TeachSlideOverride[] };
  prompts: { config: CountAndOverride<PromptOverride>; defaults: PromptOverride[] };
  interactions: { config: CountAndOverride<InteractionPlacement>; defaults: InteractionPlacement[] };
  onChangeStoryBeats: (next: CountAndOverride<StoryBeatOverride>) => void;
  onChangeTeach: (next: CountAndOverride<TeachSlideOverride>) => void;
  onChangePrompts: (next: CountAndOverride<PromptOverride>) => void;
  onChangeInteractions: (next: CountAndOverride<InteractionPlacement>) => void;
  onJumpToCategory: (key: CategoryKey) => void;
  onGenerateQuestion: (segment: string, instruction?: string) => Promise<InteractionPlacement>;
}

const TimelineBuilderPanel: React.FC<Props> = ({
  dayKind, segments, checkpoints, breakSegment, storyBeats, teach, prompts, interactions,
  onChangeStoryBeats, onChangeTeach, onChangePrompts, onChangeInteractions, onJumpToCategory, onGenerateQuestion,
}) => {
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const teachItems = resolveTimelineList(teach.config, teach.defaults);
  const promptItems = resolveTimelineList(prompts.config, prompts.defaults);
  const interactionItems = resolveTimelineList(interactions.config, interactions.defaults);
  const storyBeatItems = resolveTimelineList(storyBeats.config, storyBeats.defaults);

  const addQuestionAt = async (segmentId: string) => {
    setAddingFor(segmentId);
    try {
      const q = await onGenerateQuestion(segmentId);
      const current = resolveTimelineList(interactions.config, interactions.defaults).map((x) => ({ ...x }));
      onChangeInteractions({ ...interactions.config, overrides: [...current, q] });
    } finally {
      setAddingFor(null);
    }
  };

  return (
    <>
      <p className="text-muted small">
        Every Lesson, Claude Code example, survey question, and story beat, laid out against the real run-of-show
        clock. Drag a card to reorder it or move it to a different point in the class. Click a card to open its full
        editor. 🚩 checkpoints and the ☕ break are fixed landmarks — see the Lessons and Survey Questions tabs to
        change that content.
      </p>
      <div className="rounded-3 border bg-white" style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 720 }}>
          {/* Ruler */}
          <div className="d-flex">
            <div style={{ width: LABEL_COL_WIDTH, flex: `0 0 ${LABEL_COL_WIDTH}px` }} className="small text-muted px-2 py-2">Run of show</div>
            <div className="d-flex flex-grow-1" style={{ minWidth: 0 }}>
              {segments.map((seg) => (
                <div key={seg.id} style={{ flex: `${Math.max(seg.endMin - seg.startMin, 1)} 1 0`, minWidth: 88, background: seg.mode === 'break' ? '#f7f4ee' : undefined }}
                  className="border-end px-2 py-2 text-center">
                  <div className="small fw-semibold text-truncate">{seg.mode === 'break' ? '☕ ' : ''}{segmentLabel(seg.id)}</div>
                  <div className="text-muted" style={{ fontSize: '.7rem' }}>{seg.endMin - seg.startMin} min</div>
                </div>
              ))}
            </div>
          </div>

          {/* Landmarks: checkpoints (read-only pins; break already shown via the ruler's own tint) */}
          {checkpoints.length > 0 && (
            <div className="d-flex border-top">
              <div style={{ width: LABEL_COL_WIDTH, flex: `0 0 ${LABEL_COL_WIDTH}px` }} className="small fw-semibold px-2 py-2">🚩 Checkpoints</div>
              <div className="d-flex flex-grow-1" style={{ minWidth: 0 }}>
                {segments.map((seg) => {
                  const pins = checkpoints.filter((c) => c.segment === seg.id);
                  return (
                    <div key={seg.id} style={{ flex: `${Math.max(seg.endMin - seg.startMin, 1)} 1 0`, minWidth: 88 }} className="border-end p-1">
                      {pins.map((cp) => (
                        <div key={cp.n} className="small text-muted" title={cp.detail}>🚩 CP{cp.n} · {cp.label}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <SegmentTrack
            icon="📖" label="Lessons" items={teachItems} max={teach.config.max} segments={segments}
            getSegment={(s) => s.segment} setSegment={(s, seg) => ({ ...s, segment: seg })}
            renderCard={(s) => <><div className="fw-semibold text-truncate">{s.title}</div><div className="text-muted text-truncate" style={{ fontSize: '.72rem' }}>{s.eyebrow}</div></>}
            onChange={(next) => onChangeTeach({ ...teach.config, overrides: next })}
            onCardClick={() => onJumpToCategory('teach')}
            emptyNote={teach.config.enabled ? 'No Lessons authored yet — see the Lessons tab.' : 'Lessons are off for this class.'}
          />

          {dayKind === 'build' && (
            // Claude Code Examples have no per-item segment (they run as one
            // flat ordered list wherever the Build Bay's guided-build flow
            // is, not spliced per-segment like the other 3 categories) — so
            // this track only ever shows the 'guided-build' lane, and drag
            // support is reorder-only, never cross-lane (there's nowhere
            // else for a prompt to conceptually go).
            <SegmentTrack
              icon="⌨️" label="Claude Code" items={promptItems} max={prompts.config.max}
              segments={segments.filter((s) => s.id === 'guided-build')}
              getSegment={() => 'guided-build'} setSegment={(p) => p}
              renderCard={(p) => <div className="fw-semibold text-truncate">{p.label}</div>}
              onChange={(next) => onChangePrompts({ ...prompts.config, overrides: next })}
              onCardClick={() => onJumpToCategory('prompts')}
              emptyNote={prompts.config.enabled ? 'No Claude Code examples authored yet — see the Claude Code Examples tab.' : 'Claude Code Examples are off for this class.'}
            />
          )}

          <SegmentTrack
            icon="🗳️" label="Questions" items={interactionItems} max={interactions.config.max} segments={segments}
            getSegment={(q) => q.segment} setSegment={(q, seg) => ({ ...q, segment: seg })}
            renderCard={(q) => <><div className="fw-semibold text-truncate">{q.q || '(untitled)'}</div><div className="text-muted" style={{ fontSize: '.7rem' }}>{q.kind}</div></>}
            onChange={(next) => onChangeInteractions({ ...interactions.config, overrides: next })}
            onCardClick={() => onJumpToCategory('interactions')}
            emptyNote={interactions.config.enabled ? 'No survey questions yet — add one below or see the Survey Questions tab.' : 'Survey Questions are off for this class.'}
          />
          {interactions.config.enabled && (
            <div className="d-flex border-top">
              <div style={{ width: LABEL_COL_WIDTH, flex: `0 0 ${LABEL_COL_WIDTH}px` }} className="px-2 py-1" />
              <div className="d-flex flex-grow-1" style={{ minWidth: 0 }}>
                {segments.map((seg) => (
                  <div key={seg.id} style={{ flex: `${Math.max(seg.endMin - seg.startMin, 1)} 1 0`, minWidth: 88 }} className="border-end p-1 text-center">
                    {seg.mode !== 'break' && (
                      <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: '.68rem', padding: '.1rem .35rem' }}
                        disabled={addingFor === seg.id} onClick={() => addQuestionAt(seg.id)} title="AI-generate a question here">
                        {addingFor === seg.id ? '…' : '+ ✨'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <SegmentTrack
            icon="🎭" label="Story Beats" items={storyBeatItems} max={storyBeats.config.max} segments={segments}
            getSegment={(b) => b.segment} setSegment={(b, seg) => ({ ...b, segment: seg })}
            renderCard={(b) => <><div className="fw-semibold text-truncate">{b.icon} {b.title}</div></>}
            onChange={(next) => onChangeStoryBeats({ ...storyBeats.config, overrides: next })}
            onCardClick={() => onJumpToCategory('storyBeats')}
            emptyNote={storyBeats.config.enabled ? 'No story beats authored yet — see the Story Beats tab.' : 'Story Beats are off for this class.'}
          />

          {breakSegment && (
            <div className="text-muted small px-2 py-2 border-top">☕ Reset break: {breakSegment.endMin - breakSegment.startMin} min, fixed every week — not editable.</div>
          )}
        </div>
      </div>
    </>
  );
};

export default TimelineBuilderPanel;
