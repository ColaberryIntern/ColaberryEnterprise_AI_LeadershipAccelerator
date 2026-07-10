import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../../utils/api';
import VideoEmbed from '../../../components/timeline/VideoEmbed';
import { parseVideoUrl } from '../../../utils/videoEmbed';

/**
 * TimelineEditorTab — the AUTHOR side of the Classroom. Staff build the ONE
 * shared curriculum every batch/cohort sees: add cards from the type registry,
 * drag to reorder within a bucket, edit/clone/delete, publish. Writes to the
 * global timeline_cards; publishing a card makes it appear in every student's
 * /portal/classroom. Vertical, full-width layout — no horizontal scrolling.
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
}
interface Board { scope: string; buckets: Bucket[]; cards: Card[]; types: TypeDef[] }

const pts = (p: Card['points']) => (p?.learning || 0) + (p?.builder || 0) + (p?.community || 0);

// ── one full-width draggable card row ────────────────────────────────────────
const SortableCard: React.FC<{
  card: Card; band?: string; onEdit: (c: Card) => void; onClone: (c: Card) => void;
  onDelete: (c: Card) => void; onPublish: (c: Card) => void;
}> = ({ card, band, onEdit, onClone, onDelete, onPublish }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const published = card.visibility === 'published';
  const hasVideo = VIDEO_BANDS.includes(band || '') && !!card.metadata?.video?.url;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1,
    background: '#fff', border: '1px solid #E4E4E4', borderLeft: `3px solid ${BUCKET_COLOR[card.bucket]}`,
    borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <span {...attributes} {...listeners} title="Drag to reorder"
        style={{ cursor: 'grab', color: '#B8B8B8', fontSize: 15, userSelect: 'none', flex: 'none' }}>⋮⋮</span>
      <TypeThumb band={band} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.title}</div>
        <div style={{ fontSize: 11.5, color: '#8A8A8A', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {card.subtitle ? `${card.subtitle} · ` : ''}{card.type.replace(/_/g, ' ')} · {pts(card.points)} pts{card.estimated_time ? ` · ${card.estimated_time}m` : ''}
          {VIDEO_BANDS.includes(band || '') && (hasVideo
            ? <span style={{ color: '#3C7A26', fontWeight: 600 }}> · ▶ video linked</span>
            : <span style={{ color: '#C29A0A', fontWeight: 600 }}> · ⚠ no video yet</span>)}
        </div>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, flex: 'none',
        background: published ? '#E7F5E9' : '#F0F0F0', color: published ? '#3C7A26' : '#8A8A8A',
      }}>{published ? 'LIVE' : card.visibility.toUpperCase()}</span>
      <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
        <button className="tl-mini" onClick={() => onEdit(card)}>Edit</button>
        <button className="tl-mini" onClick={() => onPublish(card)}>{published ? 'Unpublish' : 'Publish'}</button>
        <button className="tl-mini" onClick={() => onClone(card)}>Clone</button>
        <button className="tl-mini" style={{ color: '#C20E1E' }} onClick={() => onDelete(card)}>Delete</button>
      </div>
    </div>
  );
};

// ── one bucket section (full width, vertical) ────────────────────────────────
const BucketSection: React.FC<{
  bucket: Bucket; cards: Card[]; bandOf: (type: string) => string; onReorder: (bucket: Bucket, ids: string[]) => void; onAdd: (bucket: Bucket) => void;
  cardActions: Omit<React.ComponentProps<typeof SortableCard>, 'card' | 'band'>;
}> = ({ bucket, cards, bandOf, onReorder, onAdd, cardActions }) => {
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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
            : cards.map((c) => <SortableCard key={c.id} card={c} band={bandOf(c.type)} {...cardActions} />)}
        </SortableContext>
      </DndContext>
    </div>
  );
};

// ── create / edit modal ──────────────────────────────────────────────────────
const CardModal: React.FC<{
  draft: Partial<Card> & { type?: string; video?: CardVideo }; types: TypeDef[]; isNew: boolean; saving: boolean;
  aiBusy: boolean; onAiFill: () => void;
  onChange: (patch: Partial<Card> & { type?: string; video?: CardVideo }) => void; onSave: () => void; onClose: () => void;
}> = ({ draft, types, isNew, saving, aiBusy, onAiFill, onChange, onSave, onClose }) => {
  const typeDef = types.find((t) => t.slug === draft.type);
  const band = typeDef?.render_band || guessBand(draft.type || '');
  const isVideo = VIDEO_BANDS.includes(band);
  const setVideo = (patch: Partial<CardVideo>) => onChange({ video: { ...(draft.video || {}), ...patch } });
  const videoSource = draft.video?.url ? parseVideoUrl(draft.video.url) : null;
  return (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 460, maxHeight: '86vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>{isNew ? 'Add card' : 'Edit card'}</h3>
      {isNew && (
        <label style={lbl}>Type
          <select style={inp} value={draft.type || ''} onChange={(e) => onChange({ type: e.target.value })}>
            <option value="" disabled>Choose a type…</option>
            {types.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
          </select>
        </label>
      )}
      {draft.type && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 14px', padding: '8px 10px', border: '1px solid #EEE', borderRadius: 9, background: '#FAFAFA' }}>
          <TypeThumb band={band} size={30} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>{typeDef?.label || draft.type.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 11, color: '#8A8A8A' }}>Experience Studio type · {(band || 'card').replace(/_/g, ' ')}</div>
          </div>
          <button type="button" className="tl-btn-ghost" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
            disabled={aiBusy || !draft.title} title={!draft.title ? 'Give it a title first' : 'Let AI write the subtitle, description, points, and suggest a video'}
            onClick={onAiFill}>{aiBusy ? '✦ Filling…' : '✦ Fill with AI'}</button>
        </div>
      )}
      <label style={lbl}>Title
        <input style={inp} value={draft.title || ''} onChange={(e) => onChange({ title: e.target.value })} placeholder="Card title" />
      </label>
      <label style={lbl}>Subtitle
        <input style={inp} value={draft.subtitle || ''} onChange={(e) => onChange({ subtitle: e.target.value })} placeholder="(optional)" />
      </label>
      <label style={lbl}>Description
        <textarea style={{ ...inp, minHeight: 60 }} value={draft.description || ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="(optional)" />
      </label>

      {isVideo && (
        <div style={{ border: '1px solid #D4E3E8', borderRadius: 9, padding: '10px 12px', marginBottom: 12, background: '#F5FAFB' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#367895', marginBottom: 8 }}>
            ▶ Video &amp; playback <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: '#8A8A8A' }}>· the link this specific card plays in-app</span>
          </div>
          <label style={lbl}>Video URL
            <input style={inp} value={draft.video?.url || ''} onChange={(e) => setVideo({ url: e.target.value })} placeholder="YouTube, Vimeo, Loom, Wistia, or .mp4 link" />
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
      <label style={lbl}>Visibility
        <select style={inp} value={draft.visibility || 'draft'} onChange={(e) => onChange({ visibility: e.target.value })}>
          {['draft', 'scheduled', 'published', 'archived'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>

      {draft.type && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: '#8A8A8A', marginBottom: 8 }}>Finished product · what the student sees</div>
          <div style={{ border: '1px solid #E4E4E4', borderRadius: 10, padding: 12, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isVideo || draft.description ? 10 : 0 }}>
              <TypeThumb band={band} size={28} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1A1A' }}>{draft.title || typeDef?.label || 'Untitled'}</div>
                {draft.subtitle && <div style={{ fontSize: 11.5, color: '#8A8A8A' }}>{draft.subtitle}</div>}
              </div>
            </div>
            {isVideo && (videoSource
              ? <div className="tl-vwrap"><VideoEmbed source={videoSource} title={draft.title || ''} poster={draft.video?.poster || null} /></div>
              : <div style={{ fontSize: 12, color: '#C29A0A', background: '#FEF7E6', border: '1px solid #F5E4B8', borderRadius: 8, padding: '8px 10px' }}>⚠ No video linked yet — add a Video URL above (or Fill with AI) so students can play it.</div>)}
            {draft.description && <p style={{ fontSize: 13, color: '#4A4A4A', lineHeight: 1.5, margin: '10px 0 0' }}>{draft.description}</p>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="tl-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="tl-btn-primary" disabled={saving || (isNew && !draft.type) || !draft.title} onClick={onSave}>
          {saving ? 'Saving…' : isNew ? 'Add card' : 'Save'}
        </button>
      </div>
    </div>
  </div>
  );
};

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', fontSize: 12, fontWeight: 600, color: '#4A4A4A', marginBottom: 10, gap: 4 };
const inp: React.CSSProperties = { padding: '7px 9px', border: '1px solid #D8D8D8', borderRadius: 7, fontSize: 13, fontWeight: 400 };

// ── main tab ─────────────────────────────────────────────────────────────────
const TimelineEditorTab: React.FC = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<(Partial<Card> & { type?: string; video?: CardVideo }) | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const loadBoard = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api.get('/api/admin/orchestration/timeline');
      setBoard(r.data as Board);
    } catch { setError('Failed to load the curriculum'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBoard(); }, [loadBoard]);

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

  const openAdd = (bucket: Bucket) => {
    const def = board?.types.find((t) => t.bucket === bucket) || board?.types[0];
    setIsNew(true);
    setDraft({ type: def?.slug, title: '', bucket, week, difficulty: def?.difficulty || 'core',
      points: { learning: def?.learning_xp, builder: def?.builder_xp, community: def?.community_xp }, visibility: 'draft' });
  };
  const openEdit = (c: Card) => { setIsNew(false); setDraft({ ...c, video: c.metadata?.video || undefined }); };

  const onDraftChange = (patch: Partial<Card> & { type?: string; video?: CardVideo }) => {
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
      if (isNew) {
        await api.post('/api/admin/orchestration/timeline/cards', {
          type: draft.type, title: draft.title, subtitle: draft.subtitle || null,
          description: draft.description || null, week: draft.week ?? null, bucket: draft.bucket,
          difficulty: draft.difficulty, estimated_time: draft.estimated_time ?? null,
          points: draft.points, visibility: draft.visibility, video: videoPayload,
        });
      } else if (draft.id) {
        await api.put(`/api/admin/orchestration/timeline/cards/${draft.id}`, {
          title: draft.title, subtitle: draft.subtitle || null, description: draft.description || null,
          week: draft.week ?? null, bucket: draft.bucket, difficulty: draft.difficulty,
          estimated_time: draft.estimated_time ?? null, points: draft.points, visibility: draft.visibility,
          video: videoPayload,
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
    <div style={{ maxWidth: 860 }}>
      <style>{`
        .tl-mini{font-size:11px;font-weight:600;padding:3px 9px;border:1px solid #DADADA;background:#fff;border-radius:6px;cursor:pointer;color:#4A4A4A;white-space:nowrap}
        .tl-mini:hover{background:#F2F2F2}
        .tl-btn-primary{font-size:13px;font-weight:600;padding:8px 16px;border:none;background:#367895;color:#fff;border-radius:8px;cursor:pointer}
        .tl-btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .tl-btn-ghost{font-size:13px;font-weight:600;padding:8px 16px;border:1px solid #D8D8D8;background:#fff;border-radius:8px;cursor:pointer}
        .tl-wk{font-size:13px;font-weight:600;padding:6px 14px;border:1px solid #DADADA;background:#fff;border-radius:999px;cursor:pointer;color:#4A4A4A}
        .tl-wk.on{background:#1A1A1A;color:#fff;border-color:#1A1A1A}
        .tl-vwrap .tlv-frame{position:relative;width:100%;aspect-ratio:16/9;border-radius:9px;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center}
        .tl-vwrap .tlv-media{position:absolute;inset:0;width:100%;height:100%;border:none;display:block;background:#000}
        .tl-vwrap .tlv-poster{cursor:pointer;padding:0;border:none}
        .tl-vwrap .tlv-posterimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
        .tl-vwrap .tlv-postergrad{position:absolute;inset:0;background:linear-gradient(135deg,rgba(54,120,149,.55),rgba(20,24,27,.78));z-index:1}
        .tl-vwrap .tlv-bigplay{position:relative;z-index:2;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.96);display:flex;align-items:center;justify-content:center}
        .tl-vwrap .tlv-bigplay svg{width:24px;height:24px;color:#FB2832;margin-left:3px}
        .tl-vwrap .tlv-postertitle{position:absolute;left:12px;bottom:10px;z-index:2;color:#fff;font-weight:700;font-size:13px;text-shadow:0 1px 3px rgba(0,0,0,.5)}
        .tl-vwrap .tlv-link,.tl-vwrap .tlv-none{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;text-align:center;background:#F5F5F5;border:1px solid #E4E4E4;border-radius:9px;color:#8A8A8A;padding:14px;font-size:12px}
        .tl-vwrap .tl-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:6px 11px;border-radius:7px;border:1px solid #367895;background:#367895;color:#fff;text-decoration:none;cursor:pointer}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>Class curriculum</div>
        <div style={{ fontSize: 12, color: '#8A8A8A' }}>one shared timeline · every batch sees it</div>
        {board && <div style={{ fontSize: 12, color: '#8A8A8A', marginLeft: 'auto' }}><b style={{ color: '#1A1A1A' }}>{board.cards.length}</b> cards · <b style={{ color: '#3C7A26' }}>{publishedCount}</b> live</div>}
      </div>

      {error && <div style={{ background: '#FDECEC', color: '#C20E1E', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ color: '#8A8A8A', fontSize: 13 }}>Loading…</div>}

      {board && !loading && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {weeks.nums.map((w) => (
              <button key={w} className={`tl-wk ${week === w ? 'on' : ''}`} onClick={() => setWeek(w)}>Week {w}</button>
            ))}
            {weeks.hasUnscheduled && <button className={`tl-wk ${week === null ? 'on' : ''}`} onClick={() => setWeek(null)}>Unscheduled</button>}
            <button className="tl-wk" onClick={() => { const next = (weeks.nums[weeks.nums.length - 1] || 0) + 1; setWeek(next); openAdd('learn'); }}>+ Week</button>
          </div>

          {BUCKETS.map((b) => (
            <BucketSection key={b} bucket={b} cards={laneCards(b)} bandOf={bandOf} onReorder={onReorder} onAdd={openAdd}
              cardActions={{ onEdit: openEdit, onClone, onDelete, onPublish }} />
          ))}
        </>
      )}

      {draft && (
        <CardModal draft={draft} types={board?.types || []} isNew={isNew} saving={saving}
          aiBusy={aiBusy} onAiFill={aiFill}
          onChange={onDraftChange} onSave={save} onClose={() => setDraft(null)} />
      )}
    </div>
  );
};

export default TimelineEditorTab;
