import type { Tone } from '../shell/StatusBadge';

// Agent Detail V2 (2026-09-11) — maps the shared admin Tone union (used by
// getTicketTypeTone/getTicketStatusTone in ticketTypeMeta.ts) onto this
// page's adv2-pill color classes, so ticket type/status badges stay as
// visually distinct here as they are everywhere else in the admin portal
// (the original ask this coloring shipped for).

const TONE_CLASS: Record<Tone, string> = {
  success: 'adv2-ok',
  danger: 'adv2-bad',
  warning: 'adv2-warn',
  info: 'adv2-info',
  neutral: 'adv2-neutral',
  primary: 'adv2-trust',
  violet: 'adv2-violet',
  teal: 'adv2-teal',
};

export function adv2PillClass(tone: Tone): string {
  return `adv2-pill ${TONE_CLASS[tone]}`;
}
