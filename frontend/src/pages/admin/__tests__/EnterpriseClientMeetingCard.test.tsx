import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EnterpriseClientMeetingCard, { ClientPlan } from '../EnterpriseClientMeetingCard';

const PLAN: ClientPlan = {
  interviewMode: 'later',
  interviewScheduledFor: '2026-11-22T20:00:00Z',
  meeting: { start: '2026-11-23T15:00:00Z', end: '2026-11-23T15:30:00Z', link: 'https://meet.google.com/x' },
  files: [{ name: 'Q3 plan.pdf', size: 2.5 * 1024 * 1024, chars: 900, uploadedAt: '2026-11-21T15:00:00Z' }, { name: 'scan.pdf', size: 4096, chars: 0, uploadedAt: '' }],
  aliBriefSentAt: null,
};

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('EnterpriseClientMeetingCard', () => {
  it('shows the meeting in Central, the interview plan, the files and the brief status', () => {
    const t = text(renderToStaticMarkup(<EnterpriseClientMeetingCard plan={PLAN} interviewed={false} />));
    expect(t).toContain('Monday, November 23');
    expect(t).toContain('9:00 AM Central, 30 minutes');
    expect(t).toContain('Scheduled');
    expect(t).toContain('Sun, Nov 22, 2:00 PM CT');
    expect(t).toContain('Q3 plan.pdf (2.5 MB)');
    expect(t).toContain('scan.pdf (4 KB, no text read)');
    expect(t).toContain('not sent yet');
  });

  it('says when nothing is booked, and renders nothing without a plan', () => {
    expect(text(renderToStaticMarkup(<EnterpriseClientMeetingCard plan={{ ...PLAN, meeting: null, files: [] }} interviewed />))).toContain('No meeting booked yet');
    expect(renderToStaticMarkup(<EnterpriseClientMeetingCard plan={null} interviewed={false} />)).toBe('');
  });
});
