import type { DeckSlide, SessionBlueprint } from '../deckBlueprint';

/**
 * A complete, valid session blueprint (15 slides, 60 minutes) for the deck tests. A fresh copy every
 * call, so a test can break one rule without touching the others. Not a test file itself.
 */
const base = (kind: DeckSlide['kind'], min: number, title: string, over: Partial<DeckSlide> = {}): DeckSlide => ({
  kind, min, title, kicker: '', headline: title, highlight: '', body: '', bullets: [], do: '', say: [`Say something about ${title.toLowerCase()}.`],
  read: '', clip: '', follow: { step: '', icon: '👀', heading: `Now: ${title}`, body: 'Watch the screen.', bullets: [] },
  prompt: null, poll: null, pair: null, steps: [], ...over,
});
const prompt = (label: string) => ({ label, text: `You are checking a practice orders file.\nRows: A-100 shipped 12 units, A-101 shipped 0 units, A-101 shipped 0 units.\nList every problem, then say GO or STOP.`, expect: 'A list of problems and a GO or STOP' });

export function sampleBlueprint(): SessionBlueprint {
  return {
    promise: 'Your overnight work runs while you sleep, and you check it with coffee.',
    slides: [
      base('title', 2, 'Stop Doing It Nightly', { headline: 'Stop doing it nightly.', highlight: 'Let it run without you.', body: 'Tonight you set up one job that runs on its own and leaves you a note.', say: ['Welcome in. Grab your phone or open the link in the chat.'] }),
      base('lobby', 3, 'Get connected', { headline: 'Follow along on your phone or your computer.', kicker: 'Before we start' }),
      base('agenda', 1, 'The plan', { headline: "Here's the plan.", kicker: 'The next hour' }),
      base('story', 4, 'The night shift', { kicker: 'Illustrative scenario', headline: 'Six in the morning.', highlight: 'Nobody ran the report.', bullets: ['The report runs by hand every night', 'The person who runs it is on vacation', 'The boss asks where it is'], clip: 'The work that only happens when you remember is the work that breaks first.' }),
      base('teach', 5, 'What a scheduled job is', { headline: 'A scheduled job is a promise.', highlight: 'It shows up without you.', body: 'You write the steps once. A schedule runs them. A note tells you how it went.', bullets: ['The steps', 'The schedule', 'The note it leaves you'] }),
      base('poll', 2, 'Quick vote', { poll: { key: 'night-task', kind: 'poll', q: 'What do you do by hand every night?', options: ['A report', 'A check', 'An email', 'Nothing yet'], answer: null, reveal: 'Most of us have one. Tonight we move it.' } }),
      base('handson', 8, 'Write the steps', { headline: 'Write the steps down.', body: 'Never practice on real company data. Made-up data is safe to get wrong.', prompt: prompt('Write the steps'), follow: { step: 'Hands-on 1 of 3', icon: '✋', heading: 'Copy the prompt into Claude', body: 'Paste it into a new chat and send it.', bullets: [] } }),
      base('handson', 8, 'Add the note', { headline: 'Make it leave you a note.', prompt: prompt('Add the note'), clip: 'A job that runs quietly and tells you nothing is just a new way to be surprised.' }),
      base('mistake', 4, 'The number one mistake', { headline: 'It ran. Did it work?', pair: { no: 'It said success, so it is fine.', yes: 'It shows me what it found before I trust it.' } }),
      base('chain', 3, 'Run it, check it, tell people', { headline: 'Every job needs three things.', steps: [{ icon: '⏰', label: 'Run it', text: 'On a schedule' }, { icon: '🔍', label: 'Check it', text: 'Against what you expect' }, { icon: '📨', label: 'Tell people', text: 'A short note' }] }),
      base('poll', 2, 'Trivia', { poll: { key: 'which-first', kind: 'trivia', q: 'What should a nightly job do first?', options: ['Send the email', 'Check its own input', 'Delete old files'], answer: 1, reveal: 'Check the input first. Bad data in means a confident wrong answer out.' } }),
      base('handson', 5, 'Read the note', { headline: 'Read the note like a manager.', prompt: prompt('Read the note') }),
      base('hotseat', 7, 'Your turn', { headline: 'What do you do every night?', highlight: 'Move it tonight.', body: 'Two volunteers describe the shape of a nightly task. Everyone else runs the prompt for their own job.', prompt: prompt('Your own job'), clip: 'If you do it every night, you already wrote the job. You just never saved it.' }),
      base('recap', 3, 'Recap', { headline: 'What you can do now.', bullets: ['Write the steps once', 'Let a schedule run them', 'Read the note before you trust it'] }),
      base('next', 3, 'Next Monday', { headline: 'What if it could fix what it finds?' }),
    ],
    soundBites: [
      'The work that only happens when you remember is the work that breaks first.',
      'A job that runs quietly and tells you nothing is just a new way to be surprised.',
      'If you do it every night, you already wrote the job. You just never saved it.',
      'Success on the screen means it finished, not that it was right.',
      'Write the steps the way you would explain them to a new hire on day one.',
      'Your best checklist is the one you never have to remember to run.',
      'Check the input first, because bad data in gives you a confident wrong answer.',
      'A note you can read in ten seconds beats a dashboard you never open.',
      'Never practice on real company data when made up data teaches the same lesson.',
      'The goal is coffee in the morning, not a fire drill at six.',
    ].map((text, k) => ({ text, slide: [3, 7, 12, 8, 6, 4, 10, 11, 6, 3][k] })),
    nextWeek: { question: 'What if it could fix what it finds?', promise: 'Next Monday the job does not just report the problem. It drafts the fix.' },
  };
}
