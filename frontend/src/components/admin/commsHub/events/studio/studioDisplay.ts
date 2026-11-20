import type { AiStyle, StudioStyle, ThumbSize } from '../../../../../services/commsHubApi';

/** Words for the studio (CH4.4, design 02). Labels match backend STYLE_LABEL and the template names. */
export const AI_STYLES: AiStyle[] = ['A_dark_tech', 'B_staged_headshot', 'C_open_house', 'D_weekly_live', 'E_infographic'];
export const isAiStyle = (s: StudioStyle | string | null): s is AiStyle => (AI_STYLES as string[]).includes(s ?? '');

export const STYLE_OPTIONS: Array<{ value: StudioStyle; label: string; group: 'Branded templates' | 'AI pictures' }> = [
  { value: 'templates', label: 'All three branded templates', group: 'Branded templates' },
  { value: 'bold_cherry', label: 'Bold cherry template', group: 'Branded templates' },
  { value: 'berry_night', label: 'Berry night template', group: 'Branded templates' },
  { value: 'clean_white', label: 'Clean white template', group: 'Branded templates' },
  { value: 'A_dark_tech', label: 'Dark tech poster', group: 'AI pictures' },
  { value: 'B_staged_headshot', label: 'Presenter portrait (needs a photo)', group: 'AI pictures' },
  { value: 'C_open_house', label: 'Team photo overlay', group: 'AI pictures' },
  { value: 'D_weekly_live', label: 'Video-style thumbnail (needs a photo)', group: 'AI pictures' },
  { value: 'E_infographic', label: 'Infographic poster', group: 'AI pictures' },
];

export const SIZE_OPTIONS: Array<{ value: ThumbSize; label: string; use: string }> = [
  { value: '16x9', label: 'Video thumbnail, 16:9', use: 'recording and Live Studio' },
  { value: '1x1', label: 'Square flyer, 1:1', use: 'WhatsApp groups' },
  { value: '3x1', label: 'Wide banner, 3:1', use: 'community feed and campus rail' },
];

export const sourceWord = (source: 'template' | 'upload' | 'ai'): string => (source === 'ai' ? 'AI' : source === 'upload' ? 'Upload' : 'Template');

export function costWord(cost: number | null): string | null {
  if (cost === null || cost === 0) return null;
  return `about $${cost.toFixed(2)}`;
}
