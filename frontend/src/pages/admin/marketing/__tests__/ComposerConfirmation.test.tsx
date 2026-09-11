import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ComposerConfirmation from '../composer/ComposerConfirmation';
import type { ComposerAction, ConfirmationSummary } from '../../../../services/contentComposerApi';

/**
 * Spec 8.1 step 10: the final confirmation shows brand, accounts, local AND UTC time, copy,
 * assets, links and approval status. Each is located by its own block and asserted by the
 * VALUE inside it, because a block that renders with nothing in it is precisely the failure
 * a confirmation screen exists to prevent.
 *
 * The time assertion is the one that matters most: for a brand in America/Chicago the local
 * and UTC cells must show DIFFERENT clock readings of the same instant. A surface that printed
 * the UTC string twice under two labels would pass a "both labels exist" check and mislead
 * the operator about when the audience will see the post.
 */

let container: HTMLDivElement;
let root: Root;

const SUMMARY: ConfirmationSummary = {
  item: { id: 'ci-1', title: 'Free AI class - November', status: 'approved', contentType: 'image', revision: 3 },
  brand: { id: 'b-1', name: 'Colaberry', timezone: 'America/Chicago', timezoneSource: 'brand' },
  campaign: { id: 'c-1', name: 'Nov Open House', slug: 'colaberry-awareness-2026-11' },
  accounts: [
    { provider: 'linkedin_organization', displayName: 'LinkedIn Page', mode: 'direct', reasons: [], account: null },
    { provider: 'meta_instagram', displayName: 'Instagram', mode: 'handoff', reasons: ['Instagram app review is pending.'], account: null },
  ],
  schedule: {
    utc: '2026-11-03T15:00:00.000Z',
    utcLabel: '2026-11-03 15:00 UTC',
    local: { day: '2026-11-03', time: '9:00 AM', zone: 'CST', offset: '-06:00', dayLabel: 'Tue, Nov 3' },
    timezone: 'America/Chicago',
    differsFromUtc: true,
  },
  copy: [
    { provider: 'linkedin_organization', text: 'Join us Thursday.', source: 'edited', stale: false, chars: 17 },
    { provider: 'meta_instagram', text: 'Join us Thursday. Link in bio.', source: 'generated', stale: true, chars: 30 },
  ],
  assets: [{ id: 'm-1', filename: 'class.jpg', mimeType: 'image/jpeg', altText: 'Students at a whiteboard', position: 0 }],
  links: [{ provider: 'linkedin_organization', shortUrl: 'https://enterprise.colaberry.ai/r/ABCD2345', finalUrl: 'https://learn.colaberry.com/free?utm_source=linkedin', utm: { utm_source: 'linkedin' } }],
  linkGaps: ['meta_instagram'],
  approval: { label: 'Approved', itemStatus: 'approved', humanApproved: true, request: { status: 'approved', requested_by: 'sohail@colaberry.com', requested_at: '2026-10-30T12:00:00.000Z', decided_by: 'ali@colaberry.com', decided_at: '2026-10-30T14:00:00.000Z', decision_note: null } },
  validation: { ran: true, ok: true, blockerCount: 0, blockers: [] },
  readiness: { canSaveDraft: true, canSendForApproval: false, canSchedule: true, canPublishNow: true, reasons: [] },
};

function render(summary: ConfirmationSummary, onAction: (a: ComposerAction) => void = () => undefined, busy = false) {
  act(() => { root.render(<ComposerConfirmation summary={summary} busy={busy} onAction={onAction} />); });
}

function block(testId: string): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing block ${testId}`);
  return el as HTMLElement;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the confirmation surface renders every field the spec names', () => {
  it('brand, with its timezone', () => {
    render(SUMMARY);
    const b = block('confirm-brand').textContent ?? '';
    expect(b).toContain('Colaberry');
    expect(b).toContain('America/Chicago');
    expect(b).toContain('Nov Open House');
  });

  it('accounts, with the publish mode and the fact that none is connected', () => {
    render(SUMMARY);
    const li = block('confirm-account-linkedin_organization').textContent ?? '';
    expect(li).toContain('LinkedIn Page');
    expect(li).toContain('Direct publish');
    expect(li).toContain('Account: not connected');
    const ig = block('confirm-account-meta_instagram').textContent ?? '';
    expect(ig).toContain('Handoff required');
    expect(ig).toContain('Instagram app review is pending.');
  });

  it('local and UTC time, as two cells with DIFFERENT readings for a Chicago brand', () => {
    render(SUMMARY);
    const local = block('confirm-time-local').textContent ?? '';
    const utc = block('confirm-time-utc').textContent ?? '';
    expect(local).toContain('Tue, Nov 3, 9:00 AM CST');
    expect(local).toContain('-06:00');
    expect(local).toContain('America/Chicago');
    expect(utc).toContain('2026-11-03 15:00 UTC');
    // The two cells must not carry the same clock reading.
    expect(local).not.toContain('15:00');
    expect(utc).not.toContain('9:00 AM');
  });

  it('copy per provider, with provenance and staleness', () => {
    render(SUMMARY);
    const li = block('confirm-copy-linkedin_organization').textContent ?? '';
    expect(li).toContain('Join us Thursday.');
    expect(li).toContain('Edited by hand');
    expect(li).toContain('17 chars');
    const ig = block('confirm-copy-meta_instagram').textContent ?? '';
    expect(ig).toContain('Generated');
    expect(ig).toContain('Stale');
  });

  it('assets, with alt text', () => {
    render(SUMMARY);
    const a = block('confirm-assets').textContent ?? '';
    expect(a).toContain('class.jpg');
    expect(a).toContain('image/jpeg');
    expect(a).toContain('Students at a whiteboard');
  });

  it('links, and which provider has none', () => {
    render(SUMMARY);
    const l = block('confirm-links').textContent ?? '';
    expect(l).toContain('https://enterprise.colaberry.ai/r/ABCD2345');
    expect(l).toContain('learn.colaberry.com/free');
    expect(l).toContain('No link for: meta_instagram');
  });

  it('approval status, with who decided', () => {
    render(SUMMARY);
    const a = block('confirm-approval').textContent ?? '';
    expect(a).toContain('Approved');
    expect(a).toContain('ali@colaberry.com');
  });
});

describe('absence is stated, never blank', () => {
  it('no links reads as a warning, not an empty list', () => {
    render({ ...SUMMARY, links: [], linkGaps: ['linkedin_organization', 'meta_instagram'] });
    expect(block('confirm-links').textContent).toContain('No tracked links');
  });

  it('no schedule says so rather than inventing a time', () => {
    render({ ...SUMMARY, schedule: null });
    const t = block('confirm-time').textContent ?? '';
    expect(t).toContain('No time set');
    expect(container.querySelector('[data-testid="confirm-time-utc"]')).toBeNull();
  });

  it('a UTC brand shows matching readings and explains it', () => {
    render({
      ...SUMMARY,
      brand: { id: 'b-2', name: 'UTC brand', timezone: 'UTC', timezoneSource: 'brand' },
      schedule: { ...SUMMARY.schedule!, local: { day: '2026-11-03', time: '3:00 PM', zone: 'UTC', offset: '+00:00', dayLabel: 'Tue, Nov 3' }, timezone: 'UTC', differsFromUtc: false },
    });
    expect(block('confirm-time').textContent).toContain('This brand publishes in UTC.');
  });

  it('a validation that has not run is labelled as not run, not as passed', () => {
    render({ ...SUMMARY, validation: { ran: false, ok: false, blockerCount: 0, blockers: [] } });
    expect(block('confirm-validation').textContent).toContain('Not run for this revision');
  });
});

describe('actions follow the server readiness verdict', () => {
  function buttons(): Record<string, HTMLButtonElement> {
    const out: Record<string, HTMLButtonElement> = {};
    for (const b of Array.from(block('confirm-actions').querySelectorAll('button'))) out[b.textContent ?? ''] = b;
    return out;
  }

  it('enabled exactly as readiness says, and clicking sends the action', () => {
    const seen: ComposerAction[] = [];
    render(SUMMARY, (a) => seen.push(a));
    const b = buttons();
    expect(b['Save draft'].disabled).toBe(false);
    expect(b['Send for approval'].disabled).toBe(true);
    expect(b['Schedule'].disabled).toBe(false);
    expect(b['Publish now'].disabled).toBe(false);
    act(() => { b['Publish now'].click(); });
    expect(seen).toEqual(['publish_now']);
  });

  it('a refusal prints its reasons next to the buttons', () => {
    render({
      ...SUMMARY,
      readiness: { canSaveDraft: true, canSendForApproval: true, canSchedule: false, canPublishNow: false, reasons: ['Publishing needs an approved item; this one is draft.'] },
    });
    expect(buttons()['Publish now'].disabled).toBe(true);
    expect(block('confirm-reasons').textContent).toContain('Publishing needs an approved item; this one is draft.');
  });

  it('busy disables everything regardless of readiness', () => {
    render(SUMMARY, () => undefined, true);
    for (const b of Object.values(buttons())) expect(b.disabled).toBe(true);
  });
});
