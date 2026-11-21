/**
 * Career Prep v27, CP5.8: the lines the read-aloud warm-up rotates through. Each is an original line a candidate could
 * say in an interview, 14 to 22 words, plain words, no names, no numbers to stumble on. They ROTATE (the student's
 * count of earlier read-aloud attempts picks the next one), so nobody can raise a score by memorizing one line.
 * An id never changes meaning: retire a line by removing it, never by editing its text, because scored attempts
 * store the id they were read from.
 */
export interface ReadAloudLine { readonly id: string; readonly text: string }

export const READ_ALOUD_LINES: readonly ReadAloudLine[] = [
  { id: 'ra-01', text: 'Thank you for having me today. I am glad to walk you through one project I built from start to finish.' },
  { id: 'ra-02', text: 'The problem was simple to describe and hard to solve, so I started by talking to the people who lived with it.' },
  { id: 'ra-03', text: 'I chose a small first version, put it in front of real users, and changed it based on what they actually did.' },
  { id: 'ra-04', text: 'When the data did not match what we expected, I checked my own assumptions before I questioned anyone else.' },
  { id: 'ra-05', text: 'My role was to design the pipeline, test it end to end, and explain the tradeoffs to the team every week.' },
  { id: 'ra-06', text: 'The result saved the team several hours each week, and the process is still running without me today.' },
  { id: 'ra-07', text: 'If I did it again, I would write the tests first and share a rough draft with the client much earlier.' },
  { id: 'ra-08', text: 'I learn fastest by building something small, showing it to someone who will be honest, and fixing what they find.' },
];

/** The line for a student who has already done `count` read-aloud attempts. */
export function lineFor(count: number): ReadAloudLine {
  const n = READ_ALOUD_LINES.length;
  return READ_ALOUD_LINES[((Math.floor(count) % n) + n) % n];
}

export function lineById(id: string): ReadAloudLine | undefined {
  return READ_ALOUD_LINES.find((l) => l.id === id);
}
