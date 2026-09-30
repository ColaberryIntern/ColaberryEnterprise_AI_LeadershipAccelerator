/**
 * videoDraftService — build a complete video card from just a title.
 *
 * "Creating a video should be as easy as adding a title, clicking Generate, and
 * Save." This finds a REAL video for the topic, then writes the subtitle,
 * description, poster, presenter, and the lesson content around it — all as a
 * draft (nothing is persisted here; the caller reviews, then saves).
 *
 * Finding a real video: the model proposes YouTube candidates for the title,
 * and each is validated through YouTube's free, keyless oEmbed endpoint — the
 * first that resolves gives the REAL title, channel (presenter), and thumbnail.
 * Hallucinated / dead links are filtered out; if oEmbed is unreachable we fall
 * back to the model's best guess and flag it unverified so the UI can hint.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { resolvePrompt } from '../components/promptTesterService';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';
import { getBlueprintContext } from './blueprintContext';
import { getVideoDurationSeconds } from '../composer/youtubeClient';

const VIDEO_BANDS = ['media', 'live_class', 'video_feedback'];

export interface VideoDraftInput {
  type: string;
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  program_id?: string | null;   // the card's course — pulls the week's Blueprint context
  week?: number | null;         // the card's week — pulls the week's Blueprint context
  video?: { url?: string | null; presenter?: string | null; poster?: string | null } | null;
  // Which field the author is anchoring on. The anchored field is PRESERVED and
  // every OTHER field is regenerated. 'title' (default) → keep the title, find a
  // video + fill the rest. 'video' → keep the URL, write the title + fill the rest.
  anchor?: 'title' | 'video';
}
export interface VideoDraft {
  title: string | null;               // only set when anchor='video' (generated from the video)
  subtitle: string | null;
  description: string | null;
  estimated_time: number | null;      // whole minutes — real duration when known, else the AI's best guess
  points: { learning: number; builder: number; community: number } | null; // AI-guessed XP
  video: { url: string; presenter: string | null; poster: string | null; duration_seconds: number | null } | null;
  content: { summary?: string; body_html?: string; questions?: string[]; reflection?: string };
  video_verified: boolean;
}

/** Clamp an AI-suggested integer into a sane range (junk → fallback). */
function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** PURE — pull the 11-char YouTube id out of the common URL shapes, or null. */
export function youtubeId(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const hqThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

/** Validate a YouTube video via the free keyless oEmbed endpoint (real title +
 *  channel + thumbnail), or null if it doesn't resolve / times out. */
async function youtubeOembed(url: string): Promise<{ title: string; author_name: string; thumbnail_url: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j: any = await res.json();
    return { title: String(j.title || ''), author_name: String(j.author_name || ''), thumbnail_url: String(j.thumbnail_url || '') };
  } catch {
    return null; // 404 (dead video), network error, or timeout — treat as "not found"
  } finally {
    clearTimeout(t);
  }
}

/** Ask the model for real YouTube video candidates for the topic. */
async function suggestVideos(title: string, model: string): Promise<Array<{ id: string; presenter: string }>> {
  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_video_suggest' });
  const res = await client.chat.completions.create({
    model, temperature: 0.4, max_tokens: 500, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You recommend well-known, real, currently-available public YouTube videos for a topic. Prefer reputable educational channels. Return STRICT json.' },
      { role: 'user', content: `Topic / title: "${title}".\nReturn json { "videos": [{ "id": string (the 11-char YouTube video id, NOT a URL), "presenter": string (the channel/creator name) }] } with 3-5 candidates, best first. Only include videos you are confident actually exist.` },
    ],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { parsed = {}; }
  const list = Array.isArray(parsed.videos) ? parsed.videos : [];
  return list
    .map((v: any) => ({ id: youtubeId(String(v?.id || '')) || (typeof v?.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.id) ? v.id : ''), presenter: typeof v?.presenter === 'string' ? v.presenter : '' }))
    .filter((v: { id: string }) => v.id);
}

/** PURE — real duration wins (rounded to whole minutes) when known; the LLM's guess
 *  is only ever a last resort for videos we couldn't verify a real duration for. */
export function deriveEstimatedTime(durationSeconds: number | null, llmGuessMinutes: number): number {
  return durationSeconds != null ? Math.max(1, Math.round(durationSeconds / 60)) : llmGuessMinutes;
}

/** Resolve the video: use the provided URL, else find + validate one. Always tries to
 *  attach the REAL provider duration (YouTube Data API) alongside oEmbed's title/
 *  thumbnail — oEmbed has no duration field, so this is a separate, additive lookup
 *  that degrades to null (never blocks card creation) when the id can't be resolved
 *  or the API is unavailable. */
export async function resolveVideo(title: string, providedUrl: string | null | undefined, model: string): Promise<{ url: string; presenter: string | null; poster: string | null; videoTitle: string; verified: boolean; duration_seconds: number | null }> {
  const provided = (providedUrl || '').trim();
  if (provided) {
    const id = youtubeId(provided);
    const [meta, duration_seconds] = await Promise.all([
      youtubeOembed(provided),
      id ? getVideoDurationSeconds(id) : Promise.resolve(null),
    ]);
    return {
      url: provided,
      presenter: meta?.author_name || null,
      poster: meta?.thumbnail_url || (id ? hqThumb(id) : null),
      videoTitle: meta?.title || '',
      verified: !!meta,
      duration_seconds,
    };
  }
  const candidates = await suggestVideos(title, model);
  for (const c of candidates) {
    const url = watchUrl(c.id);
    const meta = await youtubeOembed(url);
    if (meta) {
      const duration_seconds = await getVideoDurationSeconds(c.id);
      return { url, presenter: meta.author_name || c.presenter || null, poster: meta.thumbnail_url || hqThumb(c.id), videoTitle: meta.title, verified: true, duration_seconds };
    }
  }
  // None validated (or oEmbed unreachable) — best-effort first candidate, flagged unverified.
  if (candidates[0]) {
    return { url: watchUrl(candidates[0].id), presenter: candidates[0].presenter || null, poster: hqThumb(candidates[0].id), videoTitle: '', verified: false, duration_seconds: null };
  }
  return { url: '', presenter: null, poster: null, videoTitle: '', verified: false, duration_seconds: null };
}

/** Write the card copy + lesson content around the (real) video. When
 *  video-anchored, also writes a concise card title (there's no author title). */
async function generateText(
  def: CurriculumTypeDefinition | null, type: string,
  args: { title: string; videoTitle: string; anchor: 'title' | 'video' }, model: string,
  blueprintText?: string | null,
) {
  const gen = def ? ((def as any).generation_prompt as string | null) : null;
  // What to anchor the writing on: the author's title, else the real video's title.
  const anchorText = args.anchor === 'video' ? (args.videoTitle || args.title) : (args.title || args.videoTitle);
  const vars: Record<string, string> = {
    topic: anchorText, title: args.title || args.videoTitle, subject: anchorText,
    description: args.videoTitle || '', content: anchorText, video_title: args.videoTitle || '',
  };
  const resolved = gen
    ? resolvePrompt(gen, vars)
    : `Write the student-facing content for a "${type.replace(/_/g, ' ')}" about "${anchorText}".`;
  const wantTitle = args.anchor === 'video'; // no author title → generate one

  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_video_draft_text' });
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens: 1600, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${blueprintText ? blueprintText + '\n\n' : ''}You write a course video card for an AI Systems Architect student. Return STRICT json.` },
      { role: 'user', content: `${args.title ? `Card title: "${args.title}". ` : ''}${args.videoTitle ? `The chosen video is "${args.videoTitle}". ` : ''}\n${resolved}\n\nReturn json with keys: ${wantTitle ? 'title (a concise, specific card title for this video, e.g. "Video: <topic>"), ' : ''}subtitle (string, short), description (string, 1-2 sentences on what the video covers), estimated_time (integer: your best estimate of the video length in whole MINUTES), points (object { "learning": int, "builder": int, "community": int } — XP to award: learning is the main driver for a watch-and-learn video (typically 10-25), builder is 0 unless it prompts hands-on building, community is 0 unless it sparks discussion), summary (string), body_html (clean self-contained HTML lesson notes, no scripts), questions (string[]), reflection (string).` },
    ],
  });
  let p: any = {};
  try { p = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { p = {}; }
  const pts = p.points && typeof p.points === 'object' ? p.points : {};
  return {
    title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : null,
    subtitle: typeof p.subtitle === 'string' && p.subtitle.trim() ? p.subtitle.trim() : null,
    description: typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null,
    estimated_time: clampInt(p.estimated_time, 1, 180, 12),
    points: {
      learning: clampInt(pts.learning, 0, 100, 15),
      builder: clampInt(pts.builder, 0, 100, 0),
      community: clampInt(pts.community, 0, 50, 0),
    },
    content: {
      summary: typeof p.summary === 'string' ? p.summary : undefined,
      body_html: typeof p.body_html === 'string' ? p.body_html : undefined,
      questions: Array.isArray(p.questions) ? p.questions.map(String) : undefined,
      reflection: typeof p.reflection === 'string' ? p.reflection : undefined,
    },
  };
}

/**
 * Build a complete video-card draft, PRESERVING the anchored field and
 * regenerating every other field. Nothing is persisted — the caller merges this
 * into the draft and saves.
 *   anchor='title' (default): keep the title, find a fresh video + fill the rest.
 *   anchor='video':           keep the URL, write the title + fill the rest.
 */
export async function generateVideoDraft(input: VideoDraftInput, model = DEFAULT_MODEL): Promise<VideoDraft> {
  const anchor: 'title' | 'video' = input.anchor === 'video' ? 'video' : 'title';
  const title = (input.title || '').trim();
  const providedUrl = (input.video?.url || '').trim();
  if (anchor === 'title' && !title) throw Object.assign(new Error('A title is required to generate from a title.'), { status: 400 });
  if (anchor === 'video' && !providedUrl) throw Object.assign(new Error('A video URL is required to generate from a video.'), { status: 400 });

  const def = await CurriculumTypeDefinition.findOne({ where: { slug: input.type } });
  const band = def ? (def as any).render_band : null;
  const isVideo = VIDEO_BANDS.includes(band);

  let video: VideoDraft['video'] = null;
  let verified = false;
  let videoTitle = '';
  let durationSeconds: number | null = null;
  if (isVideo) {
    // title-anchor finds a FRESH video (ignores any pasted URL); video-anchor
    // keeps the pasted URL and reads its real metadata.
    const rv = await resolveVideo(title, anchor === 'video' ? providedUrl : undefined, model);
    videoTitle = rv.videoTitle;
    verified = rv.verified;
    durationSeconds = rv.duration_seconds;
    video = rv.url ? { url: rv.url, presenter: rv.presenter, poster: rv.poster, duration_seconds: rv.duration_seconds } : null;
  }

  const bp = await getBlueprintContext(input.program_id, input.week);
  const text = await generateText(def, input.type, { title: anchor === 'video' ? '' : title, videoTitle, anchor }, model, bp?.prompt_text);

  return {
    // The anchored field is preserved by the caller; every other field is
    // regenerated here (title only when video-anchored).
    title: anchor === 'video' ? (text.title || videoTitle || null) : null,
    subtitle: text.subtitle,
    description: text.description,
    estimated_time: deriveEstimatedTime(durationSeconds, text.estimated_time),
    points: text.points,                   // AI-guessed learning/builder/community XP
    video,
    content: text.content,
    video_verified: verified,
  };
}
