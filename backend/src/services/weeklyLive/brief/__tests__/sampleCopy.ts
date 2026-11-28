import type { BriefCopy } from '../briefSchema';

/** A complete, valid brief copy for the brief tests, with posts for the given slot ids. Not a test file. */
export function sampleCopy(slotIds: string[] = ['announce', 'day1', 'day2', 'day3', 'day4', 'tomorrow', 'noon', 'hour']): BriefCopy {
  return {
    eventName: 'Stop Doing It Nightly',
    fullTitle: 'Stop Doing It Nightly: Set Up a Job That Runs While You Sleep',
    summary: 'Set up one job that starts on a schedule and leaves you a draft to check with your coffee. Live Monday, 6:30 PM CT.',
    description: [
      'Six in the morning. The report that runs by hand every night did not run, and the person who runs it is on vacation.',
      'This week we stop doing it nightly.',
      'You leave with one job you could hand to a schedule at your own work, and a way to check it before you trust it.',
      'No coding background needed. Bring your phone: scan the QR code on screen to check in, follow along and ask questions live.',
    ],
    bullets: ['The steps: written once, in plain words', 'The schedule: starts the job without you', 'The note: tells you what it found'],
    whoFor: 'Working professionals who repeat the same task every night or every morning, and anyone learning to build with AI.',
    whatToBring: 'One task you do by hand every night or every morning at your job.',
    tags: ['AI', 'AI automation', 'Claude', 'productivity', 'AI at work', 'live workshop', 'Colaberry'],
    thumbnails: [
      { theme: 'night', kicker: 'Weekly Live', bigWord: 'NIGHT', accent: 'SHIFT', line: 'Stop Doing It Nightly', name: 'NIGHT SHIFT', why: 'It reads in one second and carries the whole idea.', bestFor: 'the event page' },
      { theme: 'clock', kicker: 'Weekly Live', bigWord: '6:00 AM', accent: '', line: 'Did the report run?', name: '6 AM', why: 'A bedside alarm with a question that creates tension.', bestFor: 'the Short cover' },
      { theme: 'event', kicker: 'Live Monday', bigWord: 'Let it run', accent: 'without you', line: 'Stop Doing It Nightly', name: 'LIVE MONDAY', why: 'Feels like an event, not a lecture.', bestFor: 'weekend posts' },
      { theme: 'dawn', kicker: 'Weekly Live', bigWord: 'Sleep in.', accent: 'It ran.', line: 'Set up a job that runs while you sleep', name: 'SLEEP IN', why: 'Night to sunrise shows the before and after.', bestFor: 'LinkedIn' },
    ],
    posts: slotIds.map((slot) => ({ slot, text: `Monday at 6:30 PM CT we set up a job that runs while you sleep. [Eventbrite link] (${slot})` })),
  };
}
