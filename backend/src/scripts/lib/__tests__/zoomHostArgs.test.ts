/**
 * What `zoomHosts.ts register` accepts, and what it refuses.
 *
 * THE POINT OF THESE TESTS IS THE REFUSALS. A host's purpose decides which allocator
 * may take it, and `any` — the default — is the one value that lets BOTH a room and a
 * student's rehearsal claim the same Zoom user. So every path that could silently
 * produce `any` when the operator asked for something else is a path that rebuilds the
 * collision the purpose exists to prevent. A mistyped flag is the obvious one.
 */

import { parseRegisterArgs, REGISTER_USAGE } from '../zoomHostArgs';
import { HOST_PURPOSES, isHostPurpose } from '../../../services/zoom/zoomHostRegistry';

/** Narrows to the success branch and fails loudly rather than returning undefined. */
function ok(argv: string[]) {
  const r = parseRegisterArgs(argv);
  if (!r.ok) throw new Error(`expected a parse, got error: ${r.error}`);
  return r.args;
}

function err(argv: string[]): string {
  const r = parseRegisterArgs(argv);
  if (r.ok) throw new Error(`expected an error, got args: ${JSON.stringify(r.args)}`);
  return r.error;
}

describe('isHostPurpose', () => {
  it.each(HOST_PURPOSES)('accepts the documented purpose %s', (p) => {
    expect(isHostPurpose(p)).toBe(true);
  });

  it('is exactly three purposes, so a new one cannot be added without a decision', () => {
    expect([...HOST_PURPOSES]).toEqual(['any', 'room', 'practice']);
  });

  it.each(['', 'ROOM', 'Room', 'rooms', 'both', 'null', 'undefined'])(
    'rejects %p', (v) => {
      expect(isHostPurpose(v)).toBe(false);
    },
  );

  it('rejects absent values rather than coercing them to a purpose', () => {
    expect(isHostPurpose(undefined)).toBe(false);
    expect(isHostPurpose(null)).toBe(false);
  });
});

describe('parseRegisterArgs — the email', () => {
  it('refuses no arguments, with the usage line', () => {
    expect(err([])).toBe(REGISTER_USAGE);
  });

  it('refuses a blank email rather than registering an empty host', () => {
    expect(err(['   '])).toBe(REGISTER_USAGE);
  });

  it('refuses a flag with no email, rather than treating the flag as the address', () => {
    expect(err(['--purpose=room'])).toBe(REGISTER_USAGE);
  });

  it('trims the email', () => {
    expect(ok(['  host@example.com  ']).email).toBe('host@example.com');
  });
});

describe('parseRegisterArgs — purpose', () => {
  it('defaults to any, which is what a single-host install genuinely has', () => {
    expect(ok(['host@example.com']).purpose).toBe('any');
  });

  it.each(HOST_PURPOSES)('reads --purpose=%s', (p) => {
    expect(ok(['host@example.com', `--purpose=${p}`]).purpose).toBe(p);
  });

  it('accepts the flag before the email', () => {
    expect(ok(['--purpose=room', 'host@example.com'])).toMatchObject({
      email: 'host@example.com', purpose: 'room',
    });
  });

  it('REFUSES an unknown purpose instead of falling back to any', () => {
    const message = err(['host@example.com', '--purpose=rooms']);
    expect(message).toContain('rooms');
    // The valid set must be in the message: the whole failure mode here is someone
    // guessing a value, and a bare "invalid" sends them guessing again.
    expect(message).toContain('any, room, practice');
  });

  it('REFUSES a mistyped flag name rather than ignoring it', () => {
    // The regression this file exists for. Dropping `--purpse=room` silently would
    // register the host as `any` and hand a room's host to a rehearsal.
    const message = err(['host@example.com', '--purpse=room']);
    expect(message).toContain('--purpse');
    expect(message).toContain('--purpose');
  });

  it('refuses a space-separated value, which would otherwise eat the email', () => {
    const message = err(['--purpose', 'room', 'host@example.com']);
    expect(message).toContain('--purpose=');
  });

  it('refuses a single-dash option', () => {
    expect(err(['host@example.com', '-purpose=room'])).toContain('long form');
  });

  it('refuses the same flag twice, rather than letting one win quietly', () => {
    expect(err(['host@example.com', '--purpose=room', '--purpose=practice']))
      .toContain('twice');
  });
});

describe('parseRegisterArgs — label and priority', () => {
  it('keeps the positional order that existed before flags, so nothing scripted breaks', () => {
    expect(ok(['host@example.com', 'Standup host', '10'])).toMatchObject({
      email: 'host@example.com', label: 'Standup host', priority: 10, purpose: 'any',
    });
  });

  it('reads them as flags too, which avoids quoting a label at a shell', () => {
    expect(ok(['host@example.com', '--label=Standup host', '--priority=5'])).toMatchObject({
      label: 'Standup host', priority: 5,
    });
  });

  it('leaves priority undefined when absent, so registerHost owns the default', () => {
    expect(ok(['host@example.com']).priority).toBeUndefined();
  });

  it('treats an empty label as absent rather than storing a blank string', () => {
    expect(ok(['host@example.com', '--label=']).label).toBeNull();
  });

  it('accepts priority zero, which is a real value and not a missing one', () => {
    expect(ok(['host@example.com', '--priority=0']).priority).toBe(0);
  });

  it.each(['high', '', 'ten', '1e3x'])('refuses a non-numeric priority %p', (v) => {
    // '' is the one exception: an empty flag value means "not given".
    if (v === '') {
      expect(ok(['host@example.com', '--priority=']).priority).toBeUndefined();
      return;
    }
    expect(err(['host@example.com', `--priority=${v}`])).toContain('whole number');
  });

  it('refuses a fractional priority, which ORDER BY would silently accept', () => {
    expect(err(['host@example.com', '--priority=2.5'])).toContain('whole number');
  });

  it('refuses a negative priority', () => {
    expect(err(['host@example.com', '--priority=-1'])).toContain('whole number');
  });

  it('refuses a label given both ways, rather than picking one', () => {
    expect(err(['host@example.com', 'Positional', '--label=Flag'])).toContain('Label given twice');
  });

  it('refuses a priority given both ways', () => {
    expect(err(['host@example.com', 'Label', '10', '--priority=20']))
      .toContain('Priority given twice');
  });

  it('refuses a fourth positional, which would be silently dropped', () => {
    expect(err(['host@example.com', 'Label', '10', 'extra'])).toContain('Too many arguments');
  });
});
