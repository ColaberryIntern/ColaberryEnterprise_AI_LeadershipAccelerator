import { TimelineFeedCard } from '../components/timeline/TimelineCard';

/**
 * adaptToFeedCard — build a synthetic TimelineFeedCard from an Experience Studio
 * component (or a Timeline editor draft) + the generated experience + inputs, so
 * the admin previews can render the REAL <CardDetailBody> and never diverge from
 * the student view.
 */

export interface AdaptInput {
  slug?: string;
  label?: string;
  student_label?: string;
  render_band?: string;
  description?: string | null;
  subtitle?: string | null;
  difficulty?: string;
  estimated_time?: number | null;
  week?: number | null;
  learning_xp?: number;
  builder_xp?: number;
  community_xp?: number;
  points?: { learning?: number; builder?: number; community?: number };
  video?: { url?: string | null; presenter?: string | null; poster?: string | null } | null;
  videoUrl?: string;
  image?: string | null;   // the item's OWN image (blog cover etc.) — overrides the generic type visual
  experience?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  course?: { name?: string | null; url?: string | null } | null;   // Skills Course (skills_jar)
  capabilities?: string[] | null;   // the type's Parts — carried so the preview gates sections like the live render
  thumbnail_url?: string | null;    // the type's banner — carried so previews show the card's default image
}

export function adaptToFeedCard(input: AdaptInput): TimelineFeedCard {
  const exp = input.experience || {};
  const url = (input.videoUrl || input.video?.url || '').trim();
  const points = input.points || { learning: input.learning_xp || 0, builder: input.builder_xp || 0, community: input.community_xp || 0 };
  const hasContent = !!(exp.summary || exp.body_html || (exp.questions && exp.questions.length) || exp.reflection);
  return {
    id: input.slug || 'preview',
    type: input.slug || 'preview',
    student_label: input.student_label || input.label || 'Activity',
    render_band: input.render_band || 'overview',
    title: exp.title || input.label || 'Untitled',
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    week: input.week ?? null,
    bucket: 'learn',
    order: 0,
    difficulty: input.difficulty || 'core',
    estimated_time: input.estimated_time ?? null,
    points,
    competencies: [],
    status: 'available',
    quiz_score: null,
    completed_at: null,
    video: url ? { url, presenter: input.video?.presenter || null, poster: input.video?.poster || null } : null,
    image: typeof input.image === 'string' && input.image.trim() ? input.image.trim() : null,
    content: hasContent ? { summary: exp.summary, body_html: exp.body_html, questions: exp.questions, reflection: exp.reflection } : null,
    course: input.course && (input.course.name || input.course.url)
      ? { name: input.course.name || null, url: input.course.url || null } : null,
    capabilities: Array.isArray(input.capabilities) ? input.capabilities.filter((c) => typeof c === 'string') : [],
    type_thumbnail_url: input.thumbnail_url || null,
  };
}
