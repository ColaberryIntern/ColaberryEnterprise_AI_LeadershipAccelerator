import fs from 'fs';
import path from 'path';

/**
 * `public/v1/welcome-back.js` (C105): the "Welcome back" bar every hosted landing page loads. A browser IIFE, so it is
 * run the way a browser runs it: evaluate the source against the page. The assertions are about WHEN it appears: only
 * for a live, real (not view-as) session; never otherwise; and that it never sends the token anywhere.
 */
const SOURCE = fs.readFileSync(path.resolve(__dirname, '..', '..', 'public', 'v1', 'welcome-back.js'), 'utf8');

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: object) => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;
const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

function run() {
  document.body.innerHTML = '<main id="page">Start for $0</main>';
  // eslint-disable-next-line no-eval
  eval(SOURCE);
  return document.getElementById('cb-welcome-back');
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('welcome-back.js', () => {
  it('a live session shows the bar first in the page, with one link to Today', () => {
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    const bar = run();
    expect(bar).not.toBeNull();
    expect(document.body.firstChild).toBe(bar);
    expect(bar!.textContent).toContain("Welcome back. You're already signed in.");
    const links = bar!.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/portal/today');
    expect(document.getElementById('page')!.textContent).toBe('Start for $0'); // the page itself is untouched
    // Tap targets: both controls are at least 44px tall (phones are where the re-clicks happen: 14 of 16 people).
    expect(links[0].style.minHeight).toBe('44px');
    const close = bar!.querySelector('button') as HTMLButtonElement;
    expect(close.style.width).toBe('44px');
    expect(close.style.height).toBe('44px');
  });

  it.each([
    ['no token', null],
    ['an expired token', jwt({ sub: 'e1', exp: inSeconds(-10) })],
    ['a token expiring within the minute', jwt({ sub: 'e1', exp: inSeconds(30) })],
    ['a token with no exp', jwt({ sub: 'e1' })],
    ['a malformed token', 'not-a-jwt'],
    ['a read-only view-as token', jwt({ sub: 'e1', exp: inSeconds(3600), read_only: true })],
  ])('%s: no bar, page unchanged', (_label, token) => {
    if (token) localStorage.setItem('participant_token', token);
    expect(run()).toBeNull();
    expect(document.body.innerHTML).toBe('<main id="page">Start for $0</main>');
  });

  it('ignores the sessionStorage view-as token (an admin preview is not a returning Explorer)', () => {
    sessionStorage.setItem('view_as_participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    expect(run()).toBeNull();
  });

  it('dismiss removes it and keeps it away for the rest of this browser session', () => {
    localStorage.setItem('participant_token', jwt({ sub: 'e1', exp: inSeconds(3600) }));
    const bar = run()!;
    (bar.querySelector('button') as HTMLButtonElement).click();
    expect(document.getElementById('cb-welcome-back')).toBeNull();
    expect(run()).toBeNull();
  });

  it('never makes a network call and never writes the token into the page', () => {
    const fetchSpy = jest.fn();
    (window as any).fetch = fetchSpy;
    const token = jwt({ sub: 'e1', exp: inSeconds(3600) });
    localStorage.setItem('participant_token', token);
    run();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toContain(token.split('.')[1]);
    expect(SOURCE).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|innerHTML/);
  });
});
