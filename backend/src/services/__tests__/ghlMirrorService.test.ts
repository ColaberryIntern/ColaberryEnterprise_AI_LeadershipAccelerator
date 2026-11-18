/**
 * OH1l (T6): GHL mirror notes behind ghl_mirror_enabled (default false).
 * Every GHL call is injected; nothing reaches GHL.
 */
import {
  mirrorToGhl,
  mirrorToGhlInBackground,
  resolveGhlContactId,
  formatMirrorNote,
  MAX_NOTE_BODY_CHARS,
  GhlMirrorDeps,
} from '../ghlMirrorService';

function makeDeps(overrides: Partial<GhlMirrorDeps> = {}, enabled: any = true) {
  const deps: GhlMirrorDeps = {
    getSetting: jest.fn().mockResolvedValue(enabled),
    findLead: jest.fn().mockResolvedValue({ id: 7, source: 'open_house', ghl_contact_id: 'ghl-7' }),
    syncLeadToGhl: jest.fn().mockResolvedValue({ contactId: 'ghl-new' }),
    addContactNote: jest.fn().mockResolvedValue(undefined),
    resolveApiKey: jest.fn().mockResolvedValue('key-school'),
    ...overrides,
  };
  return deps;
}

const ghlCalls = (d: GhlMirrorDeps) =>
  (d.findLead as jest.Mock).mock.calls.length
  + (d.syncLeadToGhl as jest.Mock).mock.calls.length
  + (d.addContactNote as jest.Mock).mock.calls.length
  + (d.resolveApiKey as jest.Mock).mock.calls.length;

describe('mirrorToGhl: the switch', () => {
  it.each([false, 'false', null, undefined, 'yes'])('setting %p: no GHL call at all', async (value) => {
    const d = makeDeps({ getSetting: jest.fn().mockResolvedValue(value) });
    const res = await mirrorToGhl({ event: 'email_sent', leadId: 7, subject: 'Hi', body: 'Body' }, d);
    expect(res).toEqual({ mirrored: false, reason: 'disabled' });
    expect(ghlCalls(d)).toBe(0);
  });

  it('an unreadable setting is off (fail closed)', async () => {
    const d = makeDeps({ getSetting: jest.fn().mockRejectedValue(new Error('db down')) });
    const res = await mirrorToGhl({ event: 'email_sent', leadId: 7 }, d);
    expect(res).toEqual({ mirrored: false, reason: 'disabled' });
    expect(ghlCalls(d)).toBe(0);
  });

  it('the shipped default is false', async () => {
    // Read the DEFAULTS without a database: getSetting falls back to them when no row exists.
    let getSetting!: (k: string) => Promise<any>;
    jest.isolateModules(() => {
      jest.doMock('../../models/SystemSetting', () => ({ __esModule: true, default: { findOne: jest.fn().mockResolvedValue(null) } }));
      jest.doMock('../ledgerService', () => ({ logEvent: jest.fn() }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      getSetting = require('../settingsService').getSetting;
    });
    await expect(getSetting('ghl_mirror_enabled')).resolves.toBe(false);
  });
});

describe('mirrorToGhl: on', () => {
  it.each(['email_sent', 'reply_received', 'call_finished'] as const)('%s: exactly one note on the contact on file', async (event) => {
    const d = makeDeps({}, 'true');
    const res = await mirrorToGhl({ event, leadId: 7, subject: 'Subj', body: 'Hello there' }, d);
    expect(res).toEqual({ mirrored: true, contactId: 'ghl-7' });
    expect(d.addContactNote).toHaveBeenCalledTimes(1);
    const [contactId, note, apiKey] = (d.addContactNote as jest.Mock).mock.calls[0];
    expect(contactId).toBe('ghl-7');
    expect(apiKey).toBe('key-school');
    expect(note).toContain('Subject: Subj');
    expect(note).toContain('Hello there');
    expect(d.syncLeadToGhl).not.toHaveBeenCalled();
  });

  it('a lead passed in is used without a lookup', async () => {
    const d = makeDeps();
    await mirrorToGhl({ event: 'reply_received', lead: { id: 9, ghl_contact_id: 'ghl-9' } as any, body: 'x' }, d);
    expect(d.findLead).not.toHaveBeenCalled();
    expect((d.addContactNote as jest.Mock).mock.calls[0][0]).toBe('ghl-9');
  });

  it('no contact on file: syncs once without an interest group, then notes', async () => {
    const d = makeDeps({ findLead: jest.fn().mockResolvedValue({ id: 7, ghl_contact_id: null }) });
    const res = await mirrorToGhl({ event: 'email_sent', leadId: 7, body: 'b' }, d);
    expect(res).toEqual({ mirrored: true, contactId: 'ghl-new' });
    expect(d.syncLeadToGhl).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), undefined, false, true);
  });

  it('unrouted account: no sync, no note', async () => {
    const d = makeDeps({ resolveApiKey: jest.fn().mockResolvedValue(null) });
    expect(await mirrorToGhl({ event: 'email_sent', leadId: 7 }, d)).toEqual({ mirrored: false, reason: 'no_account' });
    expect(d.addContactNote).not.toHaveBeenCalled();
    expect(d.syncLeadToGhl).not.toHaveBeenCalled();
  });

  it('no lead: nothing written', async () => {
    const d = makeDeps({ findLead: jest.fn().mockResolvedValue(null) });
    expect(await mirrorToGhl({ event: 'email_sent', leadId: 7 }, d)).toEqual({ mirrored: false, reason: 'no_lead' });
    expect(d.addContactNote).not.toHaveBeenCalled();
  });

  it('a GHL failure is swallowed, never thrown', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = makeDeps({ addContactNote: jest.fn().mockRejectedValue(new Error('GHL 500')) });
    await expect(mirrorToGhl({ event: 'call_finished', leadId: 7 }, d)).resolves.toEqual({ mirrored: false, reason: 'error' });
  });

  it('background form returns immediately and never rejects', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const d = makeDeps({ addContactNote: jest.fn().mockImplementation(async () => { await gate; throw new Error('GHL down'); }) });
    expect(mirrorToGhlInBackground({ event: 'email_sent', leadId: 7 }, d)).toBeUndefined();
    release();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(d.addContactNote).toHaveBeenCalledTimes(1);
  });
});

describe('formatMirrorNote', () => {
  it('strips HTML and trims the body to 500 characters', () => {
    const note = formatMirrorNote('email_sent', 'Subject line', `<p>${'a'.repeat(2000)}</p>`);
    const [label, subj, body] = note.split('\n');
    expect(label).toBe('Maya email sent');
    expect(subj).toBe('Subject: Subject line');
    expect(body.length).toBe(MAX_NOTE_BODY_CHARS);
    expect(body.endsWith('...')).toBe(true);
    expect(note).not.toContain('<p>');
  });
  it('a short body is kept whole; empty subject and body leave only the label', () => {
    expect(formatMirrorNote('reply_received', null, 'Thanks &amp; see you')).toBe('Email reply received\nThanks & see you');
    expect(formatMirrorNote('call_finished', '', '')).toBe('Maya call finished');
  });
});

describe('resolveGhlContactId', () => {
  it('returns the id on file without syncing', async () => {
    const sync = jest.fn();
    expect(await resolveGhlContactId({ id: 1, ghl_contact_id: 'c1' }, 'voice_call', { syncLeadToGhl: sync })).toBe('c1');
    expect(sync).not.toHaveBeenCalled();
  });
  it('syncs with the given interest group when none is on file', async () => {
    const sync = jest.fn().mockResolvedValue({ contactId: 'c2' });
    expect(await resolveGhlContactId({ id: 1 }, 'voice_call', { syncLeadToGhl: sync })).toBe('c2');
    expect(sync).toHaveBeenCalledWith({ id: 1 }, 'voice_call', false, true);
  });
  it('a sync failure returns null instead of throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = jest.fn().mockRejectedValue(new Error('boom'));
    expect(await resolveGhlContactId({ id: 1 }, 'voice_call', { syncLeadToGhl: sync })).toBeNull();
  });
});
