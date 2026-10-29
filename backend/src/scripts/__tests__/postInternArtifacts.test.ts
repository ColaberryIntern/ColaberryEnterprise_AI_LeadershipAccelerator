const { parseArgs, fromDist, BUCKET, AGENT_GROUP } = require('../postInternArtifacts');

/**
 * AF10.7 runner. The property worth the most here is the DEFAULT.
 *
 * A Basecamp comment cannot be unposted by this code: nothing in this repo edits or deletes one,
 * so recovery from a bad run is a human deleting comments by hand across seven intern tickets.
 * That makes a bug in argument parsing the single defect here that reaches real people, and
 * CLAUDE.md's intern-safety rule ("no production writes without explicit environment checks")
 * makes a test on it mandatory rather than nice to have.
 *
 * So: every form that is not exactly `--send` must come back dry.
 */

describe('parseArgs defaults to a dry run', () => {
  it('no arguments is DRY', () => {
    expect(parseArgs([]).send).toBe(false);
  });

  it('undefined is DRY, not a crash', () => {
    expect(parseArgs(undefined).send).toBe(false);
  });

  it('an unrelated flag is DRY', () => {
    expect(parseArgs(['--verbose']).send).toBe(false);
  });

  it('a NEAR MISS is DRY, which is the whole point of testing this', () => {
    // Every one of these is a plausible typo, and every one must fail safe.
    for (const typo of ['--sends', '--Send', '-send', 'send', '--send=true', '--no-send']) {
      expect(parseArgs([typo]).send).toBe(false);
    }
  });

  it('only the exact flag sends', () => {
    expect(parseArgs(['--send']).send).toBe(true);
    expect(parseArgs(['--only', 'platform', '--send']).send).toBe(true);
  });
});

describe('parseArgs --only', () => {
  it('is null when absent, meaning every domain', () => {
    expect(parseArgs([]).only).toBeNull();
    expect(parseArgs(['--send']).only).toBeNull();
  });

  it('reads the next argument as the domain', () => {
    expect(parseArgs(['--only', 'curriculum']).only).toBe('curriculum');
  });

  it('refuses to treat a following FLAG as a domain value', () => {
    // `--only --send` must not silently narrow to a domain called "--send" and must not consume
    // the send flag either.
    const r = parseArgs(['--only', '--send']);
    expect(r.only).toBeNull();
    expect(r.send).toBe(true);
  });

  it('is null when --only is the last argument with nothing after it', () => {
    expect(parseArgs(['--only']).only).toBeNull();
  });
});

describe('fromDist', () => {
  it('fails with a sentence naming the module and the registry-mode cause, not a bare stack', () => {
    // Production is registry-mode, so a running container can lag main. A module-resolution stack
    // would say nothing about why the run stopped.
    let message = '';
    try {
      fromDist('services/does/not/exist.js', 'a module that is not there');
    } catch (err: any) {
      message = String(err.message);
    }
    expect(message).toContain('a module that is not there');
    expect(message).toContain('/app/dist/services/does/not/exist.js');
    expect(message).toContain('registry-mode');
  });
});

describe('the targets are the Agent Factory ticket list', () => {
  it('points at the Agent Builds group in the right bucket', () => {
    expect(BUCKET).toBe(7463955);
    expect(AGENT_GROUP).toBe(10424311358);
  });
});
