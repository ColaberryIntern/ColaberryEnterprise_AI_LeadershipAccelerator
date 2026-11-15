import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The studio records the Hire intro video in the browser, and nginx sends a Permissions-Policy on
 * every page. `camera=()` shipped there and refused the camera before the browser ever asked the
 * candidate: recording failed on production with "We could not use your camera and microphone"
 * however the browser was set. Every unit test passed, because jsdom has no Permissions-Policy.
 *
 * So this reads the nginx config as text: the site's own pages must be allowed the camera and the
 * microphone, and nothing wider than the site itself.
 */

const CONF = join(__dirname, '..', '..', '..', '..', '..', 'nginx', 'security-headers.conf');

function permissionsPolicy(): string {
  const line = readFileSync(CONF, 'utf8')
    .split('\n')
    .find((l) => !l.trimStart().startsWith('#') && l.includes('add_header Permissions-Policy'));
  if (!line) throw new Error('no Permissions-Policy add_header in the nginx config');
  const m = /Permissions-Policy "([^"]*)"/.exec(line);
  if (!m) throw new Error('Permissions-Policy value is not quoted');
  return m[1];
}

function allowList(feature: string): string | null {
  const m = new RegExp(`(?:^|,)\\s*${feature}=\\(([^)]*)\\)`).exec(permissionsPolicy());
  return m ? m[1].trim() : null;
}

describe('the studio can record the intro video', () => {
  it.each(['camera', 'microphone'])('%s is allowed for the site itself', (feature) => {
    expect(allowList(feature)).toBe('self');
  });

  it('allows nothing wider than self', () => {
    expect(permissionsPolicy()).not.toMatch(/\*/);
  });
});
