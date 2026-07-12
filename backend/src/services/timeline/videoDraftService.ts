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

const VIDEO_BANDS = ['media', 'live_class', 'video_feedback'];

export interface VideoDraftInput {
  type: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  video?: { url?: string | null; presenter?: string | null; poster?: string | null } | null;
}
export interface VideoDraft {
  subtitle: string | null;
  description: string | null;
  video: { url: string; presenter: string | null; poster: string | null } | null;
  content: { summary?: string; body_html?: string; questions?: string[]; reflection?: string };
  video_verified: boolean;
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

/** Resolve the video: use the provided URL, else find + validate one. */
async function resolveVideo(title: string, providedUrl: string | null | undefined, model: string): Promise<{ url: string; presenter: string | null; poster: string | null; videoTitle: string; verified: boolean }> {
  const provided = (providedUrl || '').trim();
  if (provided) {
    const id = youtubeId(provided);
    const meta = await youtubeOembed(provided);
    return {
      url: provided,
      presenter: meta?.author_name || null,
      poster: meta?.thumbnail_url || (id ? hqThumb(id) : null),
      videoTitle: meta?.title || '',
      verified: !!meta,
    };
  }
  const candidates = await suggestVideos(title, model);
  for (const c of candidates) {
    const url = watchUrl(c.id);
    const meta = await youtubeOembed(url);
    if (meta) {
      return { url, presenter: meta.author_name || c.presenter || null, poster: meta.thumbnail_url || hqThumb(c.id), videoTitle: meta.title, verified: true };
    }
  }
  // None validated (or oEmbed unreachable) — best-effort first candidate, flagged unverified.
  if (candidates[0]) {
    return { url: watchUrl(candidates[0].id), presenter: candidates[0].presenter || null, poster: hqThumb(candidates[0].id), videoTitle: '', verified: false };
  }
  return { url: '', presenter: null, poster: null, videoTitle: '', verified: false };
}

/** Write the subtitle, description, and lesson content around the (real) video. */
async function generateText(def: CurriculumTypeDefinition | null, type: string, title: string, videoTitle: string, model: string) {
  const gen = def ? ((def as any).generation_prompt as string | null) : null;
  const anchor = videoTitle || title;
  const vars: Record<string, string> = { topic: title, title, subject: title, description: videoTitle || '', content: anchor, video_title: videoTitle || '' };
  const resolved = gen
    ? resolvePrompt(gen, vars)
    : `Write the student-facing content for a "${type.replace(/_/g, ' ')}" titled "${title}".`;

  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_video_draft_text' });
  const res = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens: 1600, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `You write a course video card for an AI Systems Architect student. Return STRICT json.` },
      { role: 'user', content: `Card title: "${title}".${videoTitle ? ` The chosen video is "${videoTitle}".` : ''}\n${resolved}\n\nReturn json with keys: subtitle (string, short), description (string, 1-2 sentences on what the video covers), summary (string), body_html (clean self-contained HTML lesson notes, no scripts), questions (string[]), reflection (string).` },
    ],
  });
  let p: any = {};
  try { p = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { p = {}; }
  return {
    subtitle: typeof p.subtitle === 'string' && p.subtitle.trim() ? p.subtitle.trim() : null,
    description: typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null,
    content: {
      summary: typeof p.summary === 'string' ? p.summary : undefined,
      body_html: typeof p.body_html === 'string' ? p.body_html : undefined,
      questions: Array.isArray(p.questions) ? p.questions.map(String) : undefined,
      reflection: typeof p.reflection === 'string' ? p.reflection : undefined,
    },
  };
}

/**
 * Build a complete video-card draft from a title (+ optional overrides). Nothing
 * is persisted — the caller merges this into the draft and saves. Video
 * resolution only runs for video render_bands; other types just get text.
 */
export async function generateVideoDraft(input: VideoDraftInput, model = DEFAULT_MODEL): Promise<VideoDraft> {
  const title = (input.title || '').trim();
  if (!title) throw Object.assign(new Error('A title is required to generate a card.'), { status: 400 });

  const def = await CurriculumTypeDefinition.findOne({ where: { slug: input.type } });
  const band = def ? (def as any).render_band : null;
  const isVideo = VIDEO_BANDS.includes(band);

  let video: VideoDraft['video'] = null;
  let verified = false;
  let videoTitle = '';
  if (isVideo) {
    const rv = await resolveVideo(title, input.video?.url, model);
    videoTitle = rv.videoTitle;
    verified = rv.verified;
    video = rv.url ? { url: rv.url, presenter: rv.presenter, poster: rv.poster } : null;
  }

  const text = await generateText(def, input.type, title, videoTitle, model);

  return {
    // Fill-empty for copy the author may have typed; the video + content always
    // come from this run (that's the point of pressing Generate).
    subtitle: (input.subtitle && input.subtitle.trim()) || text.subtitle,
    description: (input.description && input.description.trim()) || text.description,
    video,
    content: text.content,
    video_verified: verified,
  };
}
