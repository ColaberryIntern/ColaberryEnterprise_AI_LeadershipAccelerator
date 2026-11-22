/**
 * The Explorer sign-up tag, and the gap it closes.
 *
 * GHL's "Contact Created" workflow routes every new contact with a phone number
 * into Cora's outbound AI calling, and it reads tags AT TRIGGER TIME. Measured by
 * Kes Delele on 2026-11-21 against 100 Explorer sign-ups with a phone number:
 * Cora had called all of them, first call within 11 hours of account creation for
 * the 87 with an account date, and 3 were ever reached.
 *
 * Before this change `createContact` sent an Explorer sign-up with NO `tags` key
 * at all, because it only set tags when an interest group was supplied and the
 * Explorer path supplies none. Every tag arrived in a separate follow-up request.
 * So the contact was bare at exactly the moment the workflow looked at it.
 *
 * The first test below is the one that matters: the tag has to be ON THE CREATE
 * PAYLOAD. A test that only asserted the tag eventually lands would pass against
 * the broken version.
 */
jest.mock('../settingsService', () => ({
  getSetting: jest.fn().mockResolvedValue('test-ghl-key'),
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false }),
}));
jest.mock('../activityService', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { createContact } from '../ghlService';
import {
  AI_EXPLORER_TAG,
  EXPLORER_SIGNUP_TAGS,
  tagsNeedingTheirOwnRequest,
} from '../leads/explorerSignupTag';
import { provenanceTagsFor } from '../leads/ghlProvenanceTags';

const PERSON = { name: 'Dana Okafor', email: 'dana@example.com', phone: '+15551234567' };

/** The body we actually sent to GHL, parsed. */
function sentPayload(mockFetch: jest.Mock): any {
  return JSON.parse(mockFetch.mock.calls[0][1].body);
}

function mockCreateOk(): jest.Mock {
  const m = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ contact: { id: 'ghl-contact-1' } }),
  });
  global.fetch = m as any;
  return m;
}

describe('an Explorer sign-up is tagged on the create call itself', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('puts ai-explorer on the CREATE payload, not in a later request', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, undefined, 'key', EXPLORER_SIGNUP_TAGS);

    // One request. The tag is in it. That is the whole point: there is no second
    // request for the workflow to race.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sentPayload(mockFetch).tags).toEqual([AI_EXPLORER_TAG]);
  });

  it('does NOT write a custom field for a classification tag', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, undefined, 'key', EXPLORER_SIGNUP_TAGS);

    // A GHL custom field must exist in the destination sub-account before anything
    // can be written to it, and writing to one that does not exist fails quietly.
    // Only an interest group may carry a custom field.
    expect(sentPayload(mockFetch).customField).toBeUndefined();
  });
});

describe('every other caller behaves exactly as it did before', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('no interest group and no tags sends no tags key at all', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, undefined, 'key');

    // Seven of the nine sync call sites are like this - Apollo, CSV import, admin
    // created leads. An empty array here instead of an absent key would be a
    // behaviour change smuggled in beside the one we meant.
    expect(sentPayload(mockFetch)).not.toHaveProperty('tags');
  });

  it('an interest group alone still sets both the tag and the custom field', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, 'voice_call', 'key');

    const body = sentPayload(mockFetch);
    expect(body.tags).toEqual(['voice_call']);
    expect(body.customField).toEqual({ interestgroup: 'voice_call' });
  });

  it('an interest group AND a classification tag send both, deduped, with one custom field', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, 'voice_call', 'key', EXPLORER_SIGNUP_TAGS);

    const body = sentPayload(mockFetch);
    expect(body.tags).toEqual(['voice_call', AI_EXPLORER_TAG]);
    expect(body.customField).toEqual({ interestgroup: 'voice_call' });
  });

  it('a repeated tag is sent once', async () => {
    const mockFetch = mockCreateOk();

    await createContact(PERSON, AI_EXPLORER_TAG, 'key', EXPLORER_SIGNUP_TAGS);

    expect(sentPayload(mockFetch).tags).toEqual([AI_EXPLORER_TAG]);
  });
});

describe('a returning person, whose contact already exists, is tagged too', () => {
  // This is the group Kes's request did not cover and the one most at risk. Both
  // sign-up doors use Lead.findOrCreate keyed on email, so someone already in the
  // system as an apollo or ccpp_winback lead keeps that old source when they sign
  // up for the free class. Their GHL contact already exists, so the create branch
  // never runs for them. They have also been in the dialer longest.

  it('applies the classification tag when the contact was MATCHED, not created', () => {
    const tags = tagsNeedingTheirOwnRequest(['src-apollo'], EXPLORER_SIGNUP_TAGS, false);
    expect(tags).toContain(AI_EXPLORER_TAG);
    expect(tags).toContain('src-apollo');
  });

  it('does NOT repeat the tag when the contact was just created', () => {
    // It is already on the create payload. A second request would be wasted and
    // would make the create-path test pass for the wrong reason.
    const tags = tagsNeedingTheirOwnRequest(['src-free_signup'], EXPLORER_SIGNUP_TAGS, true);
    expect(tags).not.toContain(AI_EXPLORER_TAG);
    expect(tags).toEqual(['src-free_signup']);
  });

  it('leaves every other caller untouched, created or matched', () => {
    expect(tagsNeedingTheirOwnRequest(['src-apollo'], undefined, false)).toEqual(['src-apollo']);
    expect(tagsNeedingTheirOwnRequest(['src-apollo'], undefined, true)).toEqual(['src-apollo']);
  });

  it('sends a tag once even when provenance and classification agree', () => {
    const tags = tagsNeedingTheirOwnRequest([AI_EXPLORER_TAG], EXPLORER_SIGNUP_TAGS, false);
    expect(tags).toEqual([AI_EXPLORER_TAG]);
  });
});

describe('the tag is one this codebase can actually write', () => {
  it('survives the provenance cleaner unchanged', () => {
    // Kes chose the hyphenated spelling because `clean()` maps every character
    // outside [a-z0-9._-] to a hyphen, so a space-separated tag is not
    // constructible here. This pins that the agreed string round-trips.
    // provenanceTagsFor returns brand first, then source, so pick the src- entry
    // rather than destructuring position 0.
    const tags = provenanceTagsFor({ source: AI_EXPLORER_TAG });
    expect(tags).toContain(`src-${AI_EXPLORER_TAG}`);
  });

  it('is lower case and carries no whitespace', () => {
    expect(AI_EXPLORER_TAG).toBe(AI_EXPLORER_TAG.toLowerCase());
    expect(AI_EXPLORER_TAG).not.toMatch(/\s/);
  });
});
