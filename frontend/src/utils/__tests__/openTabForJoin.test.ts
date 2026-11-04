import { openTabForJoin } from '../openTabForJoin';

/**
 * AF12.x — a blocked meeting tab must be DETECTED, and the tab must be reserved inside the tap.
 *
 * Kalkidan Bezabeh, 2 Nov 2026: "I can access the meeting room, but the join button is hidden and
 * unclickable." Four layout explanations were measured at her phone width against the real
 * stylesheets and every one was wrong. What survived is this: the application could not tell a
 * refused tab from an opened one, so the button went dead and said nothing.
 *
 * THE TEST THAT CARRIES THE WEIGHT is `reserves the tab BEFORE awaiting`. Everything else here
 * still passes if the open is moved back after the await, which is the exact regression this
 * exists to stop, and the shape both join paths shipped with.
 */

type FakeWindow = {
  location: { replace: jest.Mock };
  close: jest.Mock;
  opener: unknown;
};

function fakeTab(): FakeWindow {
  return { location: { replace: jest.fn() }, close: jest.fn(), opener: {} };
}

let openSpy: jest.SpyInstance;

afterEach(() => {
  openSpy?.mockRestore();
});

/** The browser allows the tab. */
function allowPopups(tab: FakeWindow) {
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
}

/** The browser refuses it, which is what a phone does. */
function blockPopups() {
  openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
}

describe('the tab is reserved inside the tap, which is the whole point', () => {
  it('reserves the tab BEFORE awaiting the join call', async () => {
    // A `window.open` issued after a network round trip has left the user gesture behind, which is
    // the shape a popup blocker exists to refuse. Order is therefore the contract, and it is
    // asserted directly rather than inferred from a passing happy path.
    const tab = fakeTab();
    allowPopups(tab);
    const order: string[] = [];
    openSpy.mockImplementation(() => { order.push('open'); return tab as unknown as Window; });

    await openTabForJoin(async () => {
      order.push('resolve');
      return 'https://meet.example.test/abc';
    });

    expect(order).toEqual(['open', 'resolve']);
  });

  it('opens a BLANK tab first and navigates it afterwards, rather than opening the url directly', () => {
    const tab = fakeTab();
    allowPopups(tab);
    return openTabForJoin(async () => 'https://meet.example.test/abc').then(() => {
      expect(openSpy).toHaveBeenCalledWith('', '_blank');
      expect(tab.location.replace).toHaveBeenCalledWith('https://meet.example.test/abc');
    });
  });

  it('does NOT pass noopener, because that is what made a refusal undetectable', () => {
    // `window.open(url, '_blank', 'noopener')` returns null BY SPECIFICATION, not because anything
    // failed. The old code could not branch on that, so it never did.
    const tab = fakeTab();
    allowPopups(tab);
    return openTabForJoin(async () => 'https://meet.example.test/abc').then(() => {
      const args = openSpy.mock.calls[0];
      expect(args.join(' ')).not.toContain('noopener');
    });
  });

  it('drops the opener link, so dropping noopener costs nothing in safety', () => {
    const tab = fakeTab();
    allowPopups(tab);
    return openTabForJoin(async () => 'https://meet.example.test/abc').then(() => {
      expect(tab.opener).toBeNull();
    });
  });

  it('replaces rather than assigns, so the blank page is not a back-button stop', () => {
    const tab = fakeTab();
    allowPopups(tab);
    return openTabForJoin(async () => 'https://x.test/y').then(() => {
      expect(tab.location.replace).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a refusal is REPORTED, which is the defect being fixed', () => {
  it('returns blocked, with the url, when the browser refuses the tab', async () => {
    blockPopups();
    const outcome = await openTabForJoin(async () => 'https://meet.example.test/abc');
    expect(outcome).toEqual({ status: 'blocked', url: 'https://meet.example.test/abc' });
  });

  it('carries the url back so the caller can offer it as a real link', async () => {
    // An anchor the person taps directly is never popup-blocked, whatever their settings are, so
    // the url is the escape hatch and losing it would make the report useless.
    blockPopups();
    const outcome = await openTabForJoin(async () => 'https://meet.example.test/abc');
    expect(outcome.status === 'blocked' && outcome.url).toBe('https://meet.example.test/abc');
  });

  it('reports blocked when the handle is revoked between opening and navigating', async () => {
    const tab = fakeTab();
    tab.location.replace = jest.fn(() => { throw new Error('revoked'); });
    allowPopups(tab);
    const outcome = await openTabForJoin(async () => 'https://meet.example.test/abc');
    // From the person's side a revoked handle and a refused tab are the same thing, so they are
    // reported the same way rather than as a success nobody can see.
    expect(outcome.status).toBe('blocked');
  });

  it('reports blocked rather than throwing when window.open itself throws', async () => {
    openSpy = jest.spyOn(window, 'open').mockImplementation(() => { throw new Error('nope'); });
    const outcome = await openTabForJoin(async () => 'https://meet.example.test/abc');
    expect(outcome.status).toBe('blocked');
  });
});

describe('the other two outcomes, and no stray tab left behind', () => {
  it('returns no_url and CLOSES the tab when the host has not posted a link', async () => {
    const tab = fakeTab();
    allowPopups(tab);
    const outcome = await openTabForJoin(async () => null);
    expect(outcome).toEqual({ status: 'no_url' });
    expect(tab.close).toHaveBeenCalled();
  });

  it('treats an empty or whitespace url as no_url rather than navigating to nothing', async () => {
    const tab = fakeTab();
    allowPopups(tab);
    expect((await openTabForJoin(async () => '   ')).status).toBe('no_url');
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('returns failed and CLOSES the tab when the join call rejects', async () => {
    const tab = fakeTab();
    allowPopups(tab);
    const boom = new Error('not eligible');
    const outcome = await openTabForJoin(async () => { throw boom; });
    expect(outcome).toEqual({ status: 'failed', error: boom });
    expect(tab.close).toHaveBeenCalled();
  });

  it('keeps the original error, so a caller can tell 403 from a network drop', async () => {
    const tab = fakeTab();
    allowPopups(tab);
    const err = { response: { status: 403 } };
    const outcome = await openTabForJoin(async () => { throw err; });
    expect(outcome.status === 'failed' && outcome.error).toBe(err);
  });

  it('does not try to close a tab it never got', async () => {
    blockPopups();
    await expect(openTabForJoin(async () => null)).resolves.toEqual({ status: 'no_url' });
  });

  it('trims the url before using it', async () => {
    const tab = fakeTab();
    allowPopups(tab);
    await openTabForJoin(async () => '  https://x.test/y  ');
    expect(tab.location.replace).toHaveBeenCalledWith('https://x.test/y');
  });
});
