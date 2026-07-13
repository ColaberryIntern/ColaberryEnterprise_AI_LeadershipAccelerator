/**
 * courseDraftService — build a complete Anthropic Skills Course (skills_jar)
 * card from just its SkillsJar link. The one input is the URL; Generate fills
 * everything else (class name, description, XP, minutes, lesson content).
 *
 * It reads the course page's Open-Graph metadata (title/description/image) for
 * accuracy, then the model cleans it up + enriches. Falls back to inferring from
 * the URL when the page can't be fetched — nothing is persisted here.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { DEFAULT_MODEL } from '../components/costEstimationService';

export interface CourseDraftInput { type: string; url: string }
export interface CourseDraft {
  title: string;
  subtitle: string | null;
  description: string | null;
  course: { name: string; url: string };
  poster: string | null;
  estimated_time: number | null;
  points: { learning: number; builder: number; community: number };
  content: { summary?: string; body_html?: string; questions?: string[]; reflection?: string };
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

/** Best-effort Open-Graph scrape of a course page (title/description/image). */
async function fetchOg(url: string): Promise<{ title: string | null; description: string | null; image: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ColaberryBot/1.0)' } });
    if (!res.ok) return { title: null, description: null, image: null };
    const html = (await res.text()).slice(0, 400_000);
    const grab = (prop: string): string | null => {
      const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      const b = a ? null : html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      const m = a || b;
      return m ? decodeEntities(m[1]) : null;
    };
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      title: grab('og:title') || (titleTag ? decodeEntities(titleTag[1]) : null),
      description: grab('og:description') || grab('description'),
      image: grab('og:image'),
    };
  } catch {
    return { title: null, description: null, image: null };
  } finally {
    clearTimeout(t);
  }
}

/** Build a full Skills Course draft from its link. Nothing is persisted. */
export async function generateCourseDraft(input: CourseDraftInput, model = DEFAULT_MODEL): Promise<CourseDraft> {
  const url = (input.url || '').trim();
  if (!url) throw Object.assign(new Error('A course link is required to generate the course.'), { status: 400 });

  const def = await CurriculumTypeDefinition.findOne({ where: { slug: input.type } });
  const og = await fetchOg(url);

  const client = getInstrumentedOpenAI({ workflow_id: 'timeline_course_draft' });
  const res = await client.chat.completions.create({
    model, temperature: 0.5, max_tokens: 1400, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You set up an external "Anthropic Skills Course" (delivered on SkillsJar) card for an AI Systems Architect student, from the course link and its page metadata. Return STRICT json.' },
      { role: 'user', content: `Course URL: ${url}\n${og.title ? `Page title: "${og.title}"\n` : ''}${og.description ? `Page description: "${og.description}"\n` : ''}` +
        `Return json with keys: class_name (string — the clean course name, e.g. "Introduction to MCP"), subtitle (string, short), description (string, 1-2 sentences telling the student to complete this course on SkillsJar then upload their completion certificate here to earn credit), estimated_time (integer minutes — best estimate), points (object { "learning": int, "builder": int, "community": int } — XP, learning-heavy for a course), summary (string), body_html (clean self-contained HTML overview of what the course covers + why it matters, no scripts), questions (string[]), reflection (string).` },
    ],
  });
  let p: any = {};
  try { p = JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { p = {}; }

  const className = (typeof p.class_name === 'string' && p.class_name.trim()) ? p.class_name.trim() : (og.title || 'Anthropic Skills Course');
  const pts = p.points && typeof p.points === 'object' ? p.points : {};
  return {
    title: className,
    subtitle: typeof p.subtitle === 'string' && p.subtitle.trim() ? p.subtitle.trim() : null,
    description: typeof p.description === 'string' && p.description.trim() ? p.description.trim() : null,
    course: { name: className, url },
    poster: og.image || null,
    estimated_time: clampInt(p.estimated_time, 1, 600, 30),
    points: {
      learning: clampInt(pts.learning, 0, 100, 25),
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
