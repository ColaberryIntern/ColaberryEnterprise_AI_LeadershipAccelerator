import React from 'react';
import type { MessageView } from '../../../../services/commsHubApi';

/**
 * CH10.3 How the message looks in a WhatsApp group: one plain-text bubble (with the banner above it
 * when the event's thumbnail is included, as it is sent as an image with this text as its caption),
 * and the character count against WhatsApp's 1,000-character limit here.
 */
export const WHATSAPP_MAX_CHARS = 1000;

export function charCount(n: number): string {
  return `${n.toLocaleString('en-US')} of ${WHATSAPP_MAX_CHARS.toLocaleString('en-US')} characters`;
}

export default function WhatsAppPreview({ m }: { m: MessageView }): React.ReactElement {
  const d = m.drafts.whatsapp;
  const banner = m.include.thumbnail && m.event?.thumbnail_id ? `/api/comms-hub/thumbnails/${m.event.id}/3x1.png?v=${m.event.thumbnail_id}` : null;
  const groups = m.destinations.filter((x) => x.channel === 'whatsapp').map((x) => x.label ?? 'a WhatsApp group');
  const over = (d?.body.length ?? 0) > WHATSAPP_MAX_CHARS;
  return (
    <>
      <figure className="ch-prev-wa" aria-label="How it looks in a WhatsApp group">
        {banner && <img className="ch-prev-banner" src={banner} alt="" />}
        <p className="ch-prev-body mb-1" style={{ whiteSpace: 'pre-wrap' }}>{d ? d.body : 'No WhatsApp message yet. Use Shorter, Warmer or More detail to draft one.'}</p>
        <span className="ch-prev-time">now</span>
      </figure>
      {d && <p className={`small mb-1 ${over ? 'text-danger fw-bold' : 'text-muted'}`} data-testid="ch-wa-count">{charCount(d.body.length)}{over ? '. Too long for WhatsApp.' : '.'}</p>}
      <p className="small text-muted mb-0">{groups.length ? `Goes to: ${groups.join(', ')}.` : 'No WhatsApp group chosen yet.'}</p>
    </>
  );
}
