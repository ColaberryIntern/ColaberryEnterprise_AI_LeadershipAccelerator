import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../../utils/api';
import CardDetailBody from '../../../components/timeline/CardDetailBody';
import { adaptToFeedCard } from '../../../utils/cardAdapter';
import AutofillButton from '../../../components/common/AutofillButton';
import { composerApi, Course, BlueprintContextDTO } from './composer/composerKit';
import BlueprintDefaults from './BlueprintDefaults';
import '../../../components/timeline/timeline.css';

/**
 * TimelineEditorTab — the AUTHOR side of the Classroom, built to feel like the
 * student timeline (Facebook-style feed of cards) so authors see exactly what
 * they ship. Each card plays its video inline and carries admin actions
 * (Edit / Publish / Clone / Delete); Edit opens a right-side drawer (like the
 * student detail panel) with a full-size, playable "finished product" preview
 * above the editable controls. Writes to the global timeline_cards.
 */

const BUCKETS = ['pre_class', 'learn', 'practice', 'build', 'reflect', 'share', 'advance'] as const;
type Bucket = typeof BUCKETS[number];
const BUCKET_LABEL: Record<Bucket, string> = {
  pre_class: 'Pre-Class', learn: 'Learn', practice: 'Practice', build: 'Build',
  reflect: 'Reflect', share: 'Share', advance: 'Advance',
};
const BUCKET_COLOR: Record<Bucket, string> = {
  pre_class: '#6B6B6B', learn: '#367895', practice: '#E8920C', build: '#FB2832',
  reflect: '#8256B5', share: '#5BA63C', advance: '#B5710A',
};

// Every card is an Experience Studio TYPE. Its render_band drives the thumbnail
// (what kind of event it is) and which per-card controls appear in the editor.
const VIDEO_BANDS = ['media', 'live_class', 'video_feedback'];
const BAND_ICON: Record<string, string> = {
  media: '🎬', live_class: '🎥', video_feedback: '🎥', demo: '🖥️', interview: '🎙️', presentation: '📊',
  promptlab: '⚡', quiz: '✅', warmup: '🔥', exam: '📝', evaluation: '⚖️', skills_jar: '🎓', study: '📚',
  reflection: '✍️', discussion: '💬', community: '👥', question: '❓', survey: '📋',
  overview: '🧭', announcement: '📣', deepdive: '📖',
  task: '🔨', build_story: '🏗️', github: '🐙', artifact: '🧩',
  event: '📅', milestone: '🏁', achievement: '🏆', badge: '🏅', streak: '🔁',
};
const BAND_COLOR: Record<string, string> = {
  media: '#367895', live_class: '#367895', video_feedback: '#367895', demo: '#367895', interview: '#367895', presentation: '#367895', deepdive: '#367895',
  promptlab: '#E8920C', quiz: '#E8920C', warmup: '#E8920C', exam: '#E8920C', evaluation: '#E8920C', skills_jar: '#E8920C', study: '#E8920C',
  reflection: '#8256B5', discussion: '#8256B5', community: '#8256B5', question: '#8256B5', survey: '#8256B5',
  overview: '#6B6B6B', announcement: '#6B6B6B',
  task: '#FB2832', build_story: '#FB2832', github: '#FB2832', artifact: '#FB2832',
  event: '#B5710A', milestone: '#5BA63C', achievement: '#5BA63C', badge: '#5BA63C', streak: '#5BA63C',
};
const bandIcon = (b?: string) => (b && BAND_ICON[b]) || '🎴';
const bandColor = (b?: string) => (b && BAND_COLOR[b]) || '#8A8A8A';
// Fall back to a band guess for system types (milestone/badge/...) not in the authorable registry.
const guessBand = (slug: string): string => {
  if (/video|media/.test(slug)) return 'media';
  if (/milestone/.test(slug)) return 'milestone';
  if (/achievement|badge/.test(slug)) return 'achievement';
  if (/streak/.test(slug)) return 'streak';
  return '';
};

// A small type thumbnail — tinted by render_band so the card's kind reads at a glance.
const TypeThumb: React.FC<{ band?: string; size?: number }> = ({ band, size = 34 }) => (
  <span title={band ? band.replace(/_/g, ' ') : 'card'} style={{
    width: size, height: size, borderRadius: 8, flex: 'none', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: size * 0.5, background: `${bandColor(band)}18`, border: `1px solid ${bandColor(band)}40`,
  }}>{bandIcon(band)}</span>
);

interface CardVideo { url?: string | null; presenter?: string | null; poster?: string | null }
interface CardCourse { name?: string | null; url?: string | null }   // Skills Course (skills_jar)
interface Card {
  id: string; type: string; title: string; subtitle: string | null; description: string | null;
  week: number | null; bucket: Bucket; order: number; difficulty: string;
  estimated_time: number | null; points: { learning?: number; builder?: number; community?: number };
  competencies: Array<{ domain_id: string; weight: number }>; visibility: string;
  metadata?: { video?: CardVideo | null; [k: string]: any } | null;
}
interface TypeDef {
  slug: string; label: string; bucket: Bucket; render_band: string; difficulty: string;
  learning_xp: number; builder_xp: number; community_xp: number; competencies: string[]; event: boolean;
  capabilities?: string[];   // the type's Parts — gate the preview's optional sections
  launched?: boolean;        // Studio lifecycle "published" + active — only these can be ADDED
}
interface Board { scope: string; buckets: Bucket[]; cards: Card[]; types: TypeDef[] }

const pts = (p: Card['points']) => (p?.learning || 0) + (p?.builder || 0) + (p?.community || 0);

// ── one Facebook-style feed card (draggable) with inline play + admin actions ──
const SortableCard: React.FC<{
  card: Card; band?: string; studentLabel?: string; onEdit: (c: Card) => void; onClone: (c: Card) => void;
  onDelete: (c: Card) => void; onPublish: (c: Card) => void;
}> = ({ card, band, studentLabel, onEdit, onClone, onDelete, onPublish }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const published = card.visibility === 'published';
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  // Every card renders the SAME student view inline (the shared CardDetailBody),
  // so the timeline == the edit preview == what the student sees — one size,
  // one render, for every type (not just video).
  const previewCard = adaptToFeedCard({
    slug: card.type, render_band: band, label: card.title,
    student_label: studentLabel || card.type.replace(/_/g, ' '),
    subtitle: card.subtitle, description: card.description,
    difficulty: card.difficulty, estimated_time: card.estimated_time, week: card.week,
    points: card.points, video: card.metadata?.video, course: (card.metadata as any)?.course,
    experience: (card.metadata as any)?.content,
  });
  return (
    <div ref={setNodeRef} style={style} className={`te-card${isDragging ? ' dragging' : ''}`}>
      <div className="te-chead">
        <span {...attributes} {...listeners} className="te-drag" title="Drag to reorder">⋮⋮</span>
        <TypeThumb band={band} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="te-ttl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</div>
          <div className="te-sub">{card.type.replace(/_/g, ' ')} · {pts(card.points)} pts{card.estimated_time ? ` · ${card.estimated_time}m` : ''}{card.week != null ? ` · Week ${card.week}` : ''}</div>
        </div>
        <span className="te-badge" style={{ background: published ? '#E7F5E9' : '#F0F0F0', color: published ? '#3C7A26' : '#8A8A8A' }}>{published ? 'LIVE' : card.visibility.toUpperCase()}</span>
      </div>

      <div className="te-media">
        <div className="tl-de"><div className="tld-inlinepanel"><CardDetailBody card={previewCard} preview /></div></div>
      </div>

      <div className="te-foot">
        <button className="te-act pri" onClick={() => onEdit(card)}>✎ Edit</button>
        <button className="te-act" onClick={() => onPublish(card)}>{published ? 'Unpublish' : 'Publish'}</button>
        <button className="te-act" onClick={() => onClone(card)}>Clone</button>
        <button className="te-act danger" onClick={() => onDelete(card)}>Delete</button>
      </div>
    </div>
  );
};

// ── one bucket section (full width, vertical) ────────────────────────────────
const BucketSection: React.FC<{
  bucket: Bucket; cards: Card[]; bandOf: (type: string) => string; labelOf: (type: string) => string; onReorder: (bucket: Bucket, ids: string[]) => void; onAdd: (bucket: Bucket) => void;
  cardActions: Omit<React.ComponentProps<typeof SortableCard>, 'card' | 'band' | 'studentLabel'>;
}> = ({ bucket, cards, bandOf, labelOf, onReorder, onAdd, cardActions }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = cards.map((c) => c.id);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = ids.indexOf(String(active.id));
    const newI = ids.indexOf(String(over.id));
    if (oldI < 0 || newI < 0) return;
    onReorder(bucket, arrayMove(ids, oldI, newI));
  };
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_COLOR[bucket], flex: 'none' }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: BUCKET_COLOR[bucket], textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {BUCKET_LABEL[bucket]}
        </span>
        <span style={{ fontSize: 12, color: '#B0B0B0', fontWeight: 600 }}>{cards.length}</span>
        <span style={{ flex: 1, height: 1, background: '#EEE' }} />
        <button className="tl-mini" onClick={() => onAdd(bucket)}>+ Add card</button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {cards.length === 0
            ? <div style={{ fontSize: 12, color: '#C4C4C4', padding: '4px 0 8px 18px' }}>No cards in this bucket yet.</div>
            : cards.map((c) => <SortableCard key={c.id} card={c} band={bandOf(c.type)} studentLabel={labelOf(c.type)} {...cardActions} />)}
        </SortableContext>
      </DndContext>
    </div>
  );
};

// ── right-side create / edit drawer (like the student detail panel) ──────────
// The "finished product" preview renders the SHARED <CardDetailBody> (the exact
// component the student drawer uses) via adaptToFeedCard, so the editor preview
// is the classroom, pixel for pixel — no separate lessonDoc/markup to drift.
const EditDrawer: React.FC<{
  draft: Partial<Card> & { type?: string; video?: CardVideo; course?: CardCourse }; types: TypeDef[]; isNew: boolean; saving: boolean;
  aiBusy: boolean; onAiFill: () => void; genBusy: '' | 'title' | 'video' | 'course'; onGenerate: (anchor: 'title' | 'video' | 'course') => void;
  bpContext: BlueprintContextDTO | null;
  onChange: (patch: Partial<Card> & { type?: string; video?: CardVideo; course?: CardCourse }) => void; onSave: () => void; onClose: () => void;
}> = ({ draft, types, isNew, saving, aiBusy, onAiFill, genBusy, onGenerate, bpContext, onChange, onSave, onClose }) => {
  const typeDef = types.find((t) => t.slug === draft.type);
  const band = typeDef?.render_band || guessBand(draft.type || '');
  const isVideo = VIDEO_BANDS.includes(band);
  const isSkillsJar = band === 'skills_jar';
  const setVideo = (patch: Partial<CardVideo>) => onChange({ video: { ...(draft.video || {}), ...patch } });
  const setCourse = (patch: Partial<CardCourse>) => onChange({ course: { ...(draft.course || {}), ...patch } });
  // The preview IS the student drawer: build the same synthetic card the Studio
  // preview uses and render the shared <CardDetailBody preview/> — one renderer.
  const previewCard = adaptToFeedCard({
    slug: draft.type, render_band: band,
    label: draft.title || typeDef?.label, student_label: typeDef?.label,
    subtitle: draft.subtitle, description: draft.description,
    difficulty: draft.difficulty, estimated_time: draft.estimated_time, week: draft.week,
    points: draft.points, video: draft.video, experience: draft.metadata?.content || null,
    course: draft.course, capabilities: typeDef?.capabilities,
  });
  return (
    <div className="te-scrim" onClick={onClose}>
      <div className="te-drawer" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="te-dhead">
          <TypeThumb band={band} size={32} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{isNew ? 'Add card' : 'Edit card'}</div>
            <div style={{ fontSize: 11, color: '#8A8A8A' }}>{typeDef?.label || (draft.type || '').replace(/_/g, ' ')} · Experience Studio type</div>
          </div>
          <button className="te-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="te-dbody">
          {isNew && (
            <label style={lbl}>Type
              <select style={inp} value={draft.type || ''} onChange={(e) => onChange({ type: e.target.value })}>
                <option value="" disabled>Choose a type…</option>
                {/* Only APPROVED types (the Studio's "✓ Approved for curriculum"
                    flag — same gate as the Composer) can be hand-placed. */}
                {types.filter((t) => t.launched).map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
              </select>
              <span style={{ fontSize: 11, color: '#8A8A8A', marginTop: 4, display: 'block' }}>
                Only types approved for curriculum appear here. Approve a type in the Experience Studio.
              </span>
            </label>
          )}

          {/* FINISHED PRODUCT — play it, resize, then toy with the controls below */}
          {draft.type && (
            <div style={{ marginBottom: 18 }}>
              <div className="te-plabel">Finished product · what the student sees</div>
              <div className="tl-de">
                <div className="tld-inlinepanel">
                  <CardDetailBody card={previewCard} preview />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="te-act" style={{ flex: 1, justifyContent: 'center', padding: '9px 12px' }}
                  disabled={aiBusy || !draft.title} title={!draft.title ? 'Give it a title first' : 'Let AI write the subtitle, description, points, and suggest a video'}
                  onClick={onAiFill}>{aiBusy ? '✦ Filling…' : '✦ Fill in the fields'}</button>
                <button type="button" className="te-act pri" style={{ flex: 1, justifyContent: 'center', padding: '9px 12px' }}
                  disabled={!!genBusy || (isSkillsJar ? !(draft.course?.url || '').trim() : (!draft.title && !(draft.video?.url || '').trim()))}
                  title={isSkillsJar ? 'Fill everything from the SkillsJar link. Then Save.' : (!draft.title && !(draft.video?.url || '').trim()) ? 'Add a title (or paste a video URL) first' : isVideo ? 'Fill everything from your Title — or from your Video URL if you only pasted a link. Then Save.' : 'Write the subtitle, description, and lesson content for this title. Then Save.'}
                  onClick={() => onGenerate(isSkillsJar ? 'course' : (draft.title ? 'title' : 'video'))}>{genBusy ? (isVideo || isSkillsJar ? '✦ Working…' : '✦ Generating…') : previewCard.content ? '↻ Regenerate' : '✦ Generate content'}</button>
              </div>
              <div style={{ fontSize: 11, color: '#8A8A8A', marginTop: 6 }}>
                {isSkillsJar
                  ? 'Paste the SkillsJar course link and press ✦ Generate content — it fills the class name, description, XP, minutes, and overview. Then Save changes.'
                  : isVideo
                    ? 'Add a Title and press the ✦ next to it to find a video and fill the rest — or paste a Video URL and press the ✦ next to it to fill everything from that video. Then Save changes.'
                    : 'Add a title and click Generate content to write what students see. Then Save changes.'}
              </div>
            </div>
          )}

          <div className="te-sechead">Controls — tweak and watch the preview update</div>
          <label style={lbl}>Title
            {isVideo ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...inp, flex: 1, minWidth: 0 }} value={draft.title || ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="Card title" />
                <AutofillButton onClick={() => onGenerate('title')} busy={genBusy === 'title'} disabled={!draft.title || !!genBusy}
                  title="✦ Auto-fill from this title — find a matching video and write everything else" />
              </div>
            ) : (
              <input style={inp} value={draft.title || ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="Card title" />
            )}
          </label>
          <label style={lbl}>Subtitle
            <input style={inp} value={draft.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="(optional)" />
          </label>
          <label style={lbl}>Description
            <textarea style={{ ...inp, minHeight: 64 }} value={draft.description || ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="(optional)" />
          </label>

          {isVideo && (
            <div style={{ border: '1px solid #D4E3E8', borderRadius: 9, padding: '10px 12px', marginBottom: 12, background: '#F5FAFB' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#367895', marginBottom: 8 }}>
                ▶ Video &amp; playback <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#8A8A8A' }}>· the link this card plays in-app</span>
              </div>
              <label style={lbl}>Video URL
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...inp, flex: 1, minWidth: 0 }} value={draft.video?.url || ''} onChange={(e) => setVideo({ url: e.target.value })} placeholder="YouTube, Vimeo, Loom, Wistia, or .mp4 link" />
                  <AutofillButton onClick={() => onGenerate('video')} busy={genBusy === 'video'} disabled={!(draft.video?.url || '').trim() || !!genBusy}
                    title="✦ Auto-fill from this video — write the title and everything else" />
                </div>
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>Presenter
                  <input style={inp} value={draft.video?.presenter || ''} onChange={(e) => setVideo({ presenter: e.target.value })} placeholder="(optional)" />
                </label>
                <label style={{ ...lbl, flex: 1, marginBottom: 0 }}>Poster image URL
                  <input style={inp} value={draft.video?.poster || ''} onChange={(e) => setVideo({ poster: e.target.value })} placeholder="(optional)" />
                </label>
              </div>
            </div>
          )}

          {isSkillsJar && (
            <div style={{ border: '1px solid #D4E3E8', borderRadius: 9, padding: '10px 12px', marginBottom: 12, background: '#F5FAFB' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#367895', marginBottom: 8 }}>
                🎓 SkillsJar course <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#8A8A8A' }}>· paste the link, then ✦ to fill the rest</span>
              </div>
              <label style={lbl}>Class link
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...inp, flex: 1, minWidth: 0 }} value={draft.course?.url || ''} onChange={(e) => setCourse({ url: e.target.value })} placeholder="The SkillsJar course URL (https://anthropic.skilljar.com/…)" />
                  <AutofillButton onClick={() => onGenerate('course')} busy={genBusy === 'course'} disabled={!(draft.course?.url || '').trim() || !!genBusy}
                    title="✦ Fill everything from this course link — class name, description, XP, minutes, and the overview" />
                </div>
              </label>
              <label style={{ ...lbl, marginBottom: 0 }}>Class name
                <input style={inp} value={draft.course?.name || ''} onChange={(e) => setCourse({ name: e.target.value })} placeholder="(auto-filled by ✦ — editable)" />
              </label>
            </div>
          )}

          {/* Auto-included Blueprint context — LOCKED to this card's week (no picker,
              no drill-down). Sits right above the Week field it follows; always shown so
              every curriculum type carries the section. Shared with the Studio via <BlueprintDefaults>. */}
          <BlueprintDefaults ctx={bpContext} week={draft.week ?? null} locked />
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ ...lbl, flex: 1 }}>Week
              <input type="number" style={inp} value={draft.week ?? ''} onChange={(e) => onChange({ week: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <label style={{ ...lbl, flex: 1 }}>Bucket
              <select style={inp} value={draft.bucket || ''} onChange={(e) => onChange({ bucket: e.target.value as Bucket })}>
                {BUCKETS.map((b) => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ ...lbl, flex: 1 }}>Difficulty
              <select style={inp} value={draft.difficulty || 'core'} onChange={(e) => onChange({ difficulty: e.target.value })}>
                {['intro', 'core', 'stretch'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label style={{ ...lbl, flex: 1 }}>Est. minutes
              <input type="number" style={inp} value={draft.estimated_time ?? ''} onChange={(e) => onChange({ estimated_time: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['learning', 'builder', 'community'] as const).map((k) => (
              <label key={k} style={{ ...lbl, flex: 1 }}>{k} XP
                <input type="number" style={inp} value={draft.points?.[k] ?? 0}
                  onChange={(e) => onChange({ points: { ...(draft.points || {}), [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
          <label style={{ ...lbl, marginBottom: 0 }}>Visibility
            <select style={inp} value={draft.visibility || 'draft'} onChange={(e) => onChange({ visibility: e.target.value })}>
              {['draft', 'scheduled', 'published', 'archived'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>

        <div className="te-dfoot">
          <button className="tl-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="tl-btn-primary" disabled={saving || (isNew && !draft.type) || !draft.title} onClick={onSave}>
            {saving ? 'Saving…' : isNew ? 'Add card' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', fontSize: 12, fontWeight: 600, color: '#4A4A4A', marginBottom: 12, gap: 4 };
const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid #D8D8D8', borderRadius: 7, fontSize: 13, fontWeight: 400 };

// ── main tab ─────────────────────────────────────────────────────────────────
const TimelineEditorTab: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>('');
  const [board, setBoard] = useState<Board | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<(Partial<Card> & { type?: string; video?: CardVideo; course?: CardCourse }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [genBusy, setGenBusy] = useState<'' | 'title' | 'video' | 'course'>('');
  const [bpContext, setBpContext] = useState<BlueprintContextDTO | null>(null);

  // Load the courses once and default to the AI Systems Architect Accelerator —
  // the Timeline is scoped to one course.
  useEffect(() => {
    (async () => {
      try {
        const cs = await composerApi.courses();
        setCourses(cs);
        const def = cs.find((c) => /architect/i.test(c.name)) || cs.find((c) => c.is_active) || cs[0];
        setCourseId(def?.id || '');
      } catch { setError('Failed to load courses'); }
    })();
  }, []);

  const loadBoard = useCallback(async () => {
    if (!courseId) return;
    setLoading(true); setError('');
    try {
      const r = await api.get('/api/admin/orchestration/timeline', { params: { program_id: courseId } });
      setBoard(r.data as Board);
    } catch { setError('Failed to load the curriculum'); }
    finally { setLoading(false); }
  }, [courseId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  // The week's Blueprint that's auto-injected into every generator for this card —
  // fetched read-only so the editor can show it grayed out.
  useEffect(() => {
    if (!draft || draft.week == null || !courseId) { setBpContext(null); return; }
    let cancelled = false;
    api.get('/api/admin/orchestration/timeline/blueprint-context', { params: { program_id: courseId, week: draft.week } })
      .then((r) => { if (!cancelled) setBpContext(r.data || null); })
      .catch(() => { if (!cancelled) setBpContext(null); });
    return () => { cancelled = true; };
  }, [draft?.week, courseId, Boolean(draft)]);

  const weeks = useMemo(() => {
    const s = new Set<number | null>();
    (board?.cards || []).forEach((c) => s.add(typeof c.week === 'number' ? c.week : null));
    const nums = Array.from(s).filter((w): w is number => w != null).sort((a, b) => a - b);
    return { nums, hasUnscheduled: s.has(null) };
  }, [board]);

  useEffect(() => {
    if (!board) return;
    if (week != null && weeks.nums.includes(week)) return;
    setWeek(weeks.nums[0] ?? null);
  }, [board, weeks, week]);

  // slug -> render_band, from the authorable type registry (+ a guess for system types).
  const bandOf = useCallback((type: string): string => {
    const t = board?.types.find((x) => x.slug === type);
    return t?.render_band || guessBand(type);
  }, [board]);
  // slug -> the type's participant-facing label (for the inline student render's crumb/chip).
  const labelOf = useCallback((type: string): string => {
    const t = board?.types.find((x) => x.slug === type);
    return t?.label || type.replace(/_/g, ' ');
  }, [board]);

  const weekCards = useMemo(
    () => (board?.cards || []).filter((c) => (typeof c.week === 'number' ? c.week : null) === week),
    [board, week],
  );
  const laneCards = (bucket: Bucket) => weekCards.filter((c) => c.bucket === bucket).sort((a, b) => a.order - b.order);

  const onReorder = async (bucket: Bucket, ids: string[]) => {
    if (!board) return;
    const orderMap = new Map(ids.map((id, i) => [id, i]));
    setBoard({ ...board, cards: board.cards.map((c) => (orderMap.has(c.id) ? { ...c, order: orderMap.get(c.id)! } : c)) });
    try {
      await api.put('/api/admin/orchestration/timeline/cards/reorder', { items: ids.map((id, i) => ({ id, order: i })) });
    } catch { setError('Reorder failed'); loadBoard(); }
  };

  const openAdd = (bucket: Bucket, wk?: number | null) => {
    // Default to a LAUNCHED type — unlaunched ones aren't offered in the picker.
    const launched = (board?.types || []).filter((t) => t.launched);
    const def = launched.find((t) => t.bucket === bucket) || launched[0];
    setIsNew(true);
    setDraft({ type: def?.slug, title: '', bucket, week: wk !== undefined ? wk : week, difficulty: def?.difficulty || 'core',
      points: { learning: def?.learning_xp, builder: def?.builder_xp, community: def?.community_xp }, visibility: 'draft' });
  };
  const openEdit = (c: Card) => { setIsNew(false); setDraft({ ...c, video: c.metadata?.video || undefined, course: c.metadata?.course || undefined }); };

  const onDraftChange = (patch: Partial<Card> & { type?: string; video?: CardVideo; course?: CardCourse }) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      if (isNew && patch.type) {
        const def = board?.types.find((t) => t.slug === patch.type);
        if (def) {
          next.bucket = (d.bucket || def.bucket) as Bucket;
          next.difficulty = def.difficulty;
          next.points = { learning: def.learning_xp, builder: def.builder_xp, community: def.community_xp };
          if (!d.title) next.title = def.label;
        }
      }
      return next;
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      // Per-card "unique" data (the video/link) rides along as `video`; the API
      // merges it into metadata.video, which the student feed + Runtime read.
      const videoPayload = draft.video && (draft.video.url || '').trim() ? draft.video : null;
      // AI-generated (or authored) student content rides along in metadata.content
      // so "Generate content → Save" persists exactly what the preview showed.
      const contentPayload = (draft.metadata as any)?.content || null;
      const coursePayload = draft.course && ((draft.course.name || '').trim() || (draft.course.url || '').trim()) ? draft.course : null;
      if (isNew) {
        await api.post('/api/admin/orchestration/timeline/cards', {
          type: draft.type, title: draft.title, subtitle: draft.subtitle || null,
          description: draft.description || null, week: draft.week ?? null, bucket: draft.bucket,
          difficulty: draft.difficulty, estimated_time: draft.estimated_time ?? null,
          points: draft.points, visibility: draft.visibility, video: videoPayload, content: contentPayload, course: coursePayload,
          program_id: courseId || null,
        });
      } else if (draft.id) {
        await api.put(`/api/admin/orchestration/timeline/cards/${draft.id}`, {
          title: draft.title, subtitle: draft.subtitle || null, description: draft.description || null,
          week: draft.week ?? null, bucket: draft.bucket, difficulty: draft.difficulty,
          estimated_time: draft.estimated_time ?? null, points: draft.points, visibility: draft.visibility,
          video: videoPayload, content: contentPayload, course: coursePayload,
        });
      }
      setDraft(null);
      await loadBoard();
    } catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  // "Fill with AI" — reuse the composer's single-card fill (returns copy + a suggested
  // video_url for media types). Populates the draft; the author reviews before saving.
  const aiFill = async () => {
    if (!draft?.type) return;
    setAiBusy(true); setError('');
    try {
      const r = await api.post('/api/admin/composer/fill-card', {
        blueprint: { title: draft.title || '', week: draft.week ?? null },
        type: draft.type,
        instruction: draft.title || draft.type,
      });
      const c = r.data?.card || {};
      setDraft((d) => d && ({
        ...d,
        title: d.title || c.title || d.title,
        subtitle: c.subtitle ?? d.subtitle,
        description: c.description ?? d.description,
        difficulty: c.difficulty || d.difficulty,
        estimated_time: typeof c.estimated_time === 'number' ? c.estimated_time : d.estimated_time,
        points: c.points || d.points,
        video: c.video_url ? { ...(d.video || {}), url: c.video_url } : d.video,
      }));
    } catch (e: any) { setError(e?.response?.data?.error || 'AI fill failed'); }
    finally { setAiBusy(false); }
  };

  // The one-click, field-ANCHORED. The anchored field is kept; every other field
  // is regenerated into the draft (nothing saved yet — the author reviews the
  // live preview, then Save persists it).
  //   anchor='title' → keep the Title, find a fresh video + fill the rest.
  //   anchor='video' → keep the URL,  write the Title + fill the rest.
  const genContent = async (anchor: 'title' | 'video' | 'course' = 'title') => {
    if (!draft?.type) return;
    // Skills Course: from just the SkillsJar link, fill class name + everything.
    if (anchor === 'course') {
      if (!(draft.course?.url || '').trim()) return;
      setGenBusy('course'); setError('');
      try {
        const r = await api.post('/api/admin/orchestration/timeline/generate-course-draft', { type: draft.type, url: draft.course!.url, program_id: courseId || null, week: draft.week ?? null });
        const g = r.data || {};
        setDraft((d) => d && ({
          ...d,
          title: g.title ?? d.title,
          subtitle: g.subtitle ?? d.subtitle,
          description: g.description ?? d.description,
          estimated_time: typeof g.estimated_time === 'number' ? g.estimated_time : d.estimated_time,
          points: g.points || d.points,
          course: g.course || d.course,   // keeps the URL, fills the class name
          metadata: { ...(d.metadata || {}), content: g.content || (d.metadata as any)?.content },
        }));
      } catch (e: any) { setError(e?.response?.data?.error || 'Generate failed'); }
      finally { setGenBusy(''); }
      return;
    }
    if (anchor === 'title' && !draft.title) return;
    if (anchor === 'video' && !(draft.video?.url || '').trim()) return;
    setGenBusy(anchor); setError('');
    try {
      const r = await api.post('/api/admin/orchestration/timeline/generate-video-draft', {
        type: draft.type, title: draft.title || null,
        subtitle: draft.subtitle || null, description: draft.description || null,
        program_id: courseId || null, week: draft.week ?? null,
        video: draft.video || null, anchor,
      });
      const g = r.data || {};
      setDraft((d) => d && ({
        ...d,
        title: anchor === 'video' ? (g.title ?? d.title) : d.title,   // keep title when title-anchored
        subtitle: g.subtitle ?? d.subtitle,
        description: g.description ?? d.description,
        estimated_time: typeof g.estimated_time === 'number' ? g.estimated_time : d.estimated_time,
        points: g.points || d.points,                                  // AI-guessed XP
        video: g.video || d.video,                                     // g.video keeps the URL when video-anchored
        metadata: { ...(d.metadata || {}), content: g.content || (d.metadata as any)?.content },
      }));
      if (g.video && g.video_verified === false) {
        setError('Heads up: could not verify the video plays — check it in the preview or paste your own URL.');
      }
    } catch (e: any) { setError(e?.response?.data?.error || 'Generate failed'); }
    finally { setGenBusy(''); }
  };

  const onPublish = async (c: Card) => {
    try { await api.put(`/api/admin/orchestration/timeline/cards/${c.id}`, { visibility: c.visibility === 'published' ? 'draft' : 'published' }); loadBoard(); }
    catch { setError('Publish failed'); }
  };
  const onClone = async (c: Card) => { try { await api.post(`/api/admin/orchestration/timeline/cards/${c.id}/clone`); loadBoard(); } catch { setError('Clone failed'); } };
  const onDelete = async (c: Card) => {
    if (!window.confirm(`Delete "${c.title}"? This removes it from the Classroom for every batch.`)) return;
    try { await api.delete(`/api/admin/orchestration/timeline/cards/${c.id}`); loadBoard(); } catch { setError('Delete failed'); }
  };

  const publishedCount = (board?.cards || []).filter((c) => c.visibility === 'published').length;

  return (
    <div style={{ maxWidth: 720 }}>
      <style>{`
        .tl-mini{font-size:11px;font-weight:600;padding:4px 11px;border:1px solid #DADADA;background:#fff;border-radius:7px;cursor:pointer;color:#4A4A4A;white-space:nowrap}
        .tl-mini:hover{background:#F2F2F2}
        .tl-btn-primary{font-size:13px;font-weight:600;padding:9px 18px;border:none;background:#367895;color:#fff;border-radius:8px;cursor:pointer}
        .tl-btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .tl-btn-ghost{font-size:13px;font-weight:600;padding:9px 18px;border:1px solid #D8D8D8;background:#fff;border-radius:8px;cursor:pointer}
        .tl-wk{font-size:13px;font-weight:600;padding:6px 14px;border:1px solid #DADADA;background:#fff;border-radius:999px;cursor:pointer;color:#4A4A4A}
        .tl-wk.on{background:#1A1A1A;color:#fff;border-color:#1A1A1A}
        /* FB-style feed card */
        .te-card{background:#fff;border:1px solid #E4E4E4;border-radius:12px;overflow:hidden;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
        .te-card.dragging{opacity:.55}
        .te-chead{display:flex;align-items:center;gap:11px;padding:12px 14px}
        .te-ttl{font-size:15px;font-weight:700;color:#1A1A1A}
        .te-sub{font-size:12px;color:#8A8A8A;margin-top:1px}
        .te-badge{font-size:10px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:.03em;flex:none}
        .te-media{padding:12px 14px 2px}
        .te-hero{aspect-ratio:16/9;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;color:#fff}
        .te-desc{padding:10px 14px 0;font-size:13.5px;color:#4A4A4A;line-height:1.5;margin:0}
        .te-foot{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid #F2F2F2;margin-top:12px;flex-wrap:wrap}
        .te-drag{cursor:grab;color:#B8B8B8;font-size:16px;user-select:none;flex:none}
        .te-act{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:6px 13px;border:1px solid #DADADA;background:#fff;border-radius:7px;cursor:pointer;color:#4A4A4A}
        .te-act:hover{background:#F5F5F5}
        .te-act:disabled{opacity:.55;cursor:not-allowed}
        .te-act.pri{background:#367895;color:#fff;border-color:#367895}.te-act.pri:hover{background:#2E6A86}
        .te-act.danger{color:#C20E1E;margin-left:auto}
        /* right-side edit drawer */
        .te-scrim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1000;display:flex;justify-content:flex-end}
        .te-drawer{width:620px;max-width:94vw;height:100%;background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.16);display:flex;flex-direction:column;animation:te-slide .22s ease}
        @keyframes te-slide{from{transform:translateX(40px);opacity:.5}to{transform:none;opacity:1}}
        .te-dhead{display:flex;align-items:center;gap:10px;padding:15px 20px;border-bottom:1px solid #EEE;flex:none}
        .te-dbody{flex:1;overflow:auto;padding:18px 20px}
        .te-dfoot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid #EEE;flex:none;background:#fff}
        .te-close{margin-left:auto;background:none;border:none;cursor:pointer;color:#8A8A8A;font-size:24px;line-height:1;padding:0 4px}
        .te-plabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#8A8A8A;margin-bottom:8px}
        .te-pcard{border:1px solid #E4E4E4;border-radius:12px;padding:14px;background:#FBFBFC;margin-bottom:10px}
        .te-sechead{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#367895;margin:4px 0 12px}
        /* shared in-app player (feed card + drawer preview) */
        .tl-vwrap{border-radius:10px;overflow:hidden}
        .tl-vwrap .tlv-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center}
        .tl-vwrap .tlv-media{position:absolute;inset:0;width:100%;height:100%;border:none;display:block;background:#000}
        .tl-vwrap .tlv-poster{cursor:pointer;padding:0;border:none}
        .tl-vwrap .tlv-posterimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
        .tl-vwrap .tlv-postergrad{position:absolute;inset:0;background:linear-gradient(135deg,rgba(54,120,149,.55),rgba(20,24,27,.78));z-index:1}
        .tl-vwrap .tlv-bigplay{position:relative;z-index:2;width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.96);display:flex;align-items:center;justify-content:center}
        .tl-vwrap .tlv-bigplay svg{width:26px;height:26px;color:#FB2832;margin-left:3px}
        .tl-vwrap .tlv-postertitle{position:absolute;left:12px;bottom:10px;z-index:2;color:#fff;font-weight:700;font-size:14px;text-shadow:0 1px 3px rgba(0,0,0,.5)}
        .tl-vwrap .tlv-link,.tl-vwrap .tlv-none{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;text-align:center;background:#F5F5F5;border:1px solid #E4E4E4;border-radius:10px;color:#8A8A8A;padding:16px;font-size:12.5px}
        .tl-vwrap .tl-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:7px 12px;border-radius:7px;border:1px solid #367895;background:#367895;color:#fff;text-decoration:none;cursor:pointer}
        .te-lessonframe{width:100%;height:300px;border:1px solid #E4E4E4;border-radius:9px;background:#fff;display:block}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>Course</div>
        <select
          style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', border: '1px solid #CBD2D8', borderRadius: 8, background: '#fff', color: '#1A1A1A', cursor: 'pointer' }}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          title="The Timeline is scoped to one course. Add courses in the Curriculum Composer."
        >
          {courses.length === 0 && <option value="">— loading —</option>}
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ fontSize: 12, color: '#8A8A8A' }}>this course's student timeline · every batch sees it</div>
        {board && <div style={{ fontSize: 12, color: '#8A8A8A', marginLeft: 'auto' }}><b style={{ color: '#1A1A1A' }}>{board.cards.length}</b> cards · <b style={{ color: '#3C7A26' }}>{publishedCount}</b> live</div>}
      </div>

      {error && <div style={{ background: '#FDECEC', color: '#C20E1E', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: '#8A8A8A', fontSize: 13 }}>Loading…</div>}

      {board && !loading && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {weeks.nums.map((w) => (
              <button key={w} className={`tl-wk ${week === w ? 'on' : ''}`} onClick={() => setWeek(w)}>{w === 0 ? 'Wk 0 · Free' : `Week ${w}`}</button>
            ))}
            {weeks.hasUnscheduled && <button className={`tl-wk ${week === null ? 'on' : ''}`} onClick={() => setWeek(null)}>Unscheduled</button>}
            {!weeks.nums.includes(0) && <button className="tl-wk" onClick={() => { setWeek(0); openAdd('learn', 0); }}>+ Free Preview (Wk 0)</button>}
            <button className="tl-wk" onClick={() => { const next = (weeks.nums[weeks.nums.length - 1] || 0) + 1; setWeek(next); openAdd('learn', next); }}>+ Week</button>
          </div>

          {BUCKETS.map((b) => (
            <BucketSection key={b} bucket={b} cards={laneCards(b)} bandOf={bandOf} labelOf={labelOf} onReorder={onReorder} onAdd={openAdd}
              cardActions={{ onEdit: openEdit, onClone, onDelete, onPublish }} />
          ))}
        </>
      )}

      {draft && (
        <EditDrawer draft={draft} types={board?.types || []} isNew={isNew} saving={saving}
          aiBusy={aiBusy} onAiFill={aiFill} genBusy={genBusy} onGenerate={genContent} bpContext={bpContext}
          onChange={onDraftChange} onSave={save} onClose={() => setDraft(null)} />
      )}
    </div>
  );
};

export default TimelineEditorTab;
