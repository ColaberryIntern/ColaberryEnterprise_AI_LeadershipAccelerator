/**
 * writeFailureDiagnosis — the rule that decides what a student is told.
 *
 * This exists because of a real production run: 12 of 13 repos failed and every
 * one was reported as "we'll retry on your next upload", for a permissions
 * condition that never resolves on its own. The wrong message is worse than
 * none — it tells someone to wait instead of act.
 */
import {
  WriteFailureFacts,
  diagnoseWriteFailure,
  messageForCause,
  probeRepoReadable,
  statusFromMessage,
} from '../writeFailureDiagnosis';

const facts = (over: Partial<WriteFailureFacts> = {}): WriteFailureFacts => ({
  errorClass: 'UpstreamError',
  status: 404,
  repoReadable: null,
  ...over,
});

describe('statusFromMessage', () => {
  it('extracts the status repoWriter embeds in its message', () => {
    expect(statusFromMessage('GitHub /repos/a/b/git/trees failed (404): {"message":"Not Found"}')).toBe(404);
    expect(statusFromMessage('GitHub /x failed (503): upstream')).toBe(503);
  });

  it('returns null when there is no status to find', () => {
    expect(statusFromMessage('something went wrong')).toBeNull();
    expect(statusFromMessage(null)).toBeNull();
    expect(statusFromMessage(undefined)).toBeNull();
  });

  it('does not mistake a longer number for a status', () => {
    expect(statusFromMessage('took (1234) ms')).toBeNull();
  });
});

describe('diagnoseWriteFailure', () => {
  describe('the production case: read 200, write 404', () => {
    it('concludes no_push_access when the repo is still readable', () => {
      // Exactly what 12 student repos returned on 2026-08-21.
      expect(diagnoseWriteFailure(facts({ status: 404, repoReadable: true }))).toBe('no_push_access');
    });

    it('concludes repo_missing when the repo cannot be read either', () => {
      expect(diagnoseWriteFailure(facts({ status: 404, repoReadable: false }))).toBe('repo_missing');
    });

    it('refuses to guess when the probe could not establish either way', () => {
      // Falling back to the retry message is right here: being unsure is
      // acceptable, asserting a wrong cause and sending someone to fix the
      // wrong thing is not.
      expect(diagnoseWriteFailure(facts({ status: 404, repoReadable: null }))).toBe('transient');
    });
  });

  describe('trusting repoWriter when it already decided', () => {
    it('believes an explicit NoPushAccess without needing a probe', () => {
      expect(diagnoseWriteFailure(facts({ errorClass: 'NoPushAccess', status: 403, repoReadable: null })))
        .toBe('no_push_access');
    });

    it('believes it even if the probe says the repo is unreadable', () => {
      expect(diagnoseWriteFailure(facts({ errorClass: 'NoPushAccess', repoReadable: false })))
        .toBe('no_push_access');
    });
  });

  describe('genuinely transient — the only cases where "we will retry" is true', () => {
    it.each([500, 502, 503])('treats %s as transient', (status) => {
      expect(diagnoseWriteFailure(facts({ status }))).toBe('transient');
    });

    it('treats rate limiting as transient', () => {
      expect(diagnoseWriteFailure(facts({ status: 429 }))).toBe('transient');
    });

    it('treats a timeout as transient regardless of status', () => {
      expect(diagnoseWriteFailure(facts({ errorClass: 'UpstreamTimeout', status: null }))).toBe('transient');
    });

    it('treats an unknown failure with no status as transient', () => {
      expect(diagnoseWriteFailure(facts({ status: null }))).toBe('transient');
    });
  });

  it('does not treat a 5xx as a permissions problem even when readable', () => {
    expect(diagnoseWriteFailure(facts({ status: 503, repoReadable: true }))).toBe('transient');
  });
});

describe('messageForCause', () => {
  it('tells a student to reconnect when it is permissions — never to wait', () => {
    const msg = messageForCause('no_push_access');
    expect(msg).toMatch(/permission/i);
    expect(msg).toMatch(/reconnect|invitation/i);
    expect(msg).not.toMatch(/retry/i);
  });

  it('tells a student the repo is missing rather than blaming permissions', () => {
    const msg = messageForCause('repo_missing');
    expect(msg).toMatch(/could not find|renamed|deleted/i);
    expect(msg).not.toMatch(/permission/i);
  });

  it('only promises a retry when a retry can actually help', () => {
    expect(messageForCause('transient')).toMatch(/retry/i);
  });

  it('always reassures that the artifact itself is safe', () => {
    for (const cause of ['no_push_access', 'repo_missing', 'transient'] as const) {
      expect(messageForCause(cause)).toMatch(/saved/i);
    }
  });
});

describe('probeRepoReadable', () => {
  const fetchWith = (status: number) => jest.fn().mockResolvedValue({ status } as Response);

  it('reports readable on 200', async () => {
    await expect(probeRepoReadable('o', 'r', 't', fetchWith(200) as any)).resolves.toBe(true);
  });

  it('reports unreadable on 404', async () => {
    await expect(probeRepoReadable('o', 'r', 't', fetchWith(404) as any)).resolves.toBe(false);
  });

  it('returns null on any other status rather than pretending to know', async () => {
    await expect(probeRepoReadable('o', 'r', 't', fetchWith(500) as any)).resolves.toBeNull();
    await expect(probeRepoReadable('o', 'r', 't', fetchWith(403) as any)).resolves.toBeNull();
  });

  it('never throws when the probe itself fails', async () => {
    const boom = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(probeRepoReadable('o', 'r', 't', boom as any)).resolves.toBeNull();
  });

  it('sends the token and asks the right repo', async () => {
    const f = fetchWith(200);
    await probeRepoReadable('acme', 'thing', 'secret', f as any);
    expect(f).toHaveBeenCalledWith(
      'https://api.github.com/repos/acme/thing',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret' }) }),
    );
  });
});
