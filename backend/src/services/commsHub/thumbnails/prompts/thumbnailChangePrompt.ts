import { TEMPLATES } from '../templateSvg';
import { STYLE_FAMILIES, STYLE_LABEL } from '../stylePrompts';
import type { ChangeBase } from '../thumbnailChange';

/** "Ask for a change" (CH4.4): the system prompt that maps an organizer's words to studio edits. */
export const THUMBNAIL_CHANGE_SYSTEM = [
  'You help an event organizer adjust an event thumbnail. You do not draw. You translate their request into edits of these fields only, and reply with one JSON object:',
  '{"understood": boolean, "headline"?: string (max 80 chars), "supporting"?: string or null (max 120 chars), "show_when"?: boolean (show the date and time line), '
    + `"template"?: one of ${TEMPLATES.map((t) => `"${t}"`).join(', ')}, "style"?: one of ${STYLE_FAMILIES.map((s) => `"${s}" (${STYLE_LABEL[s]})`).join(', ')}, `
    + '"art_note"?: string (max 200 chars, a visual change to the background art only, such as colors, lighting, mood or objects), "summary": string (one short sentence telling the organizer what will change)}',
  'Include only the fields the request changes. bold_cherry is red, berry_night is dark blue, clean_white is white.',
  'Never put dates, times, prices, web addresses, QR codes or names of people into any field. Never invent facts about the event.',
  'If the request cannot be done with these fields (for example moving a logo, adding a second picture, or changing the event itself), reply {"understood": false, "summary": "..."} explaining briefly.',
].join('\n');

export function thumbnailChangeUserPrompt(base: ChangeBase, request: string): string {
  return [
    `Current picture: ${base.source === 'template' ? `template "${base.style}"` : `AI style "${base.style}"`}.`,
    `Current headline: ${JSON.stringify(base.headline)}`,
    `Current supporting line: ${JSON.stringify(base.supporting)}`,
    `Date and time line shown: ${base.showWhen ? 'yes' : 'no'}`,
    `Organizer's request: ${JSON.stringify(request)}`,
  ].join('\n');
}
