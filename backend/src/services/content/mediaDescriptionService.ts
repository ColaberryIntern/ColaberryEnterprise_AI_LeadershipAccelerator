import { getInstrumentedOpenAI } from '../openaiInstrumented';
import { listItemMedia, type ItemMediaView } from '../media/mediaAssetService';

/**
 * What is actually IN the file the operator uploaded, in words the copy generator can use.
 *
 * WHY. Ali, after the first real run: "when creating the variant, you need to analyze the
 * uploaded content and create the variants with the information in them." The draft service
 * had no idea an upload existed - its whole input was a topic string, a brand and a campaign.
 * An operator who attached a photo of forty people in a workshop and typed "open house recap"
 * got copy written from four words, while the thing that actually described the event sat
 * unread beside it.
 *
 * ── WHAT THIS IS AND IS NOT ──
 *
 * It is a DESCRIPTION, not a caption and not copy. It says what can be seen, flatly, so the
 * generator has material. It never writes marketing language, because copy written here would
 * bypass the brand rules, the banned-phrase scanner and the approval path that the real draft
 * goes through.
 *
 * VIDEO IS NOT WATCHED, and says so. A vision model reads a still image; it cannot watch an
 * mp4. Claiming otherwise would be the worst outcome here - confident copy about footage
 * nobody looked at. For video the description is assembled from what is actually known
 * (duration, dimensions, the operator's own alt text and filename) and labelled as such, so
 * the generator writes about a video it has not seen rather than inventing its contents.
 *
 * ── THE FACT-INVENTION RULE STILL APPLIES, AND THIS WIDENS IT RATHER THAN BREAKING IT ──
 *
 * `composerDraftService.findInventedSpecifics` compares the draft against its source and
 * reports numbers, dates and prices that nothing supports. A description is a legitimate new
 * SOURCE of such facts - if the image plainly shows a room of people, "a room of people" is
 * observed, not invented. So the description is appended to that source text. What it must not
 * do is let the model launder a guess through a description, which is why the prompt below
 * forbids inference: no counting beyond what is legible, no reading of mood or intent, no
 * naming of people or places it cannot actually read in the frame.
 */

const VISION_MODEL = 'gpt-4o';
const TIMEOUT_MS = 25_000;
const MAX_IMAGES = 3;

export type DescriptionBasis = 'vision' | 'metadata' | 'none';

export interface MediaDescription {
  /** Plain description for the prompt, or '' when there is nothing to say. */
  text: string;
  /** How it was produced, so a caller can be honest about it in the UI. */
  basis: DescriptionBasis;
  /** How many attachments were considered. */
  mediaCount: number;
}

const EMPTY: MediaDescription = { text: '', basis: 'none', mediaCount: 0 };

/** What we can state about a file without looking inside it. */
function metadataLine(m: ItemMediaView): string {
  const bits: string[] = [];
  const kind = m.mimeType.startsWith('video/') ? 'A video'
    : m.mimeType.startsWith('image/') ? 'An image' : 'A file';
  bits.push(kind);
  if (m.durationMs && m.durationMs > 0) bits.push(`${Math.round(m.durationMs / 1000)} seconds long`);
  if (m.width && m.height) {
    const shape = m.height > m.width ? 'vertical' : m.height === m.width ? 'square' : 'landscape';
    bits.push(`${shape}, ${m.width}x${m.height}`);
  }
  // The operator's own words about the file are the most trustworthy thing here.
  if (m.altText) bits.push(`described by the uploader as "${m.altText}"`);
  else if (m.originalFilename) bits.push(`filename "${m.originalFilename}"`);
  return bits.join(', ') + '.';
}

/**
 * Describe the media attached to a content item.
 *
 * Never throws and never blocks a draft: an upload we cannot describe must cost the generator
 * some context, not the operator their post. Every failure path returns a usable result.
 */
export async function describeItemMedia(contentItemId: string): Promise<MediaDescription> {
  let media: Awaited<ReturnType<typeof listItemMedia>>;
  try {
    media = await listItemMedia(contentItemId);
  } catch {
    return EMPTY;
  }
  if (!media.length) return EMPTY;

  const metadataText = media.map(metadataLine).join(' ');

  // Only images can actually be looked at, and only those with a live signed URL.
  const images = media
    .filter((m) => m.mimeType.startsWith('image/') && m.url)
    .slice(0, MAX_IMAGES);

  if (!images.length) {
    return { text: metadataText, basis: 'metadata', mediaCount: media.length };
  }

  try {
    const openai = getInstrumentedOpenAI();
    const res = await openai.chat.completions.create(
      {
        model: VISION_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: [
              'You describe images so a marketer can write about them. Describe only what is',
              'plainly visible. Do NOT write marketing copy, a caption, or a headline.',
              'Do NOT infer mood, intent, or what an event was for.',
              'Do NOT count people beyond a rough "a few" / "a dozen or so" unless the number is',
              'unmistakable. Do NOT name people, companies or places unless the name is legible',
              'in the image. If text is legible, quote it exactly.',
              'Two or three sentences, plain and factual.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe what is in these images.' },
              ...images.map((m) => ({
                type: 'image_url' as const,
                image_url: { url: m.url as string },
              })),
            ] as never,
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );

    const described = (res.choices?.[0]?.message?.content ?? '').trim();
    if (!described) return { text: metadataText, basis: 'metadata', mediaCount: media.length };

    // Both: what is in the frame, AND the facts only metadata knows (duration, shape), which
    // matter for a video attached beside an image.
    return {
      text: `${described} ${metadataText}`.trim(),
      basis: 'vision',
      mediaCount: media.length,
    };
  } catch {
    // Vision unavailable, timed out, or the signed URL expired before it was fetched. The
    // metadata description is still better than nothing and is never wrong.
    return { text: metadataText, basis: 'metadata', mediaCount: media.length };
  }
}
