const {
  validateBeforeSend,
  countSignatureBlocks,
  hasBrandedSignature,
  findInformalSignoff,
} = require('../mandrillPreflight');

/**
 * There were no tests on this module, which is how a false positive here managed to
 * silently block three scheduled jobs for weeks. These lock in both halves of the
 * contract: the guard still catches a genuinely duplicated signature, and it no longer
 * fires on an email that merely mentions Ali more than once.
 */

// The real branded signature, so the fixtures fail the way production would.
const SIG_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="font-family: arial, sans-serif; font-size: 14px; color: #2d3748; border-left: 3px solid #1a365d; padding-left: 14px; margin-top: 24px;">
<tr><td>
<div style="font-weight: 700; font-size: 16px; color: #1a365d;">Ali Muwwakkil</div>
<div style="color: #2b6cb0; font-weight: 600;">Managing Director / AI Systems Architect</div>
<div style="color: #718096;">Colaberry Inc.</div>
<div style="margin-top: 10px; color: #2d3748;">200 Chisholm Place, Suite 200 &middot; Plano, TX 75075</div>
</td></tr>
</table>`;

const SIG_TEXT = `Ali Muwwakkil
Managing Director / AI Systems Architect
Colaberry Inc.

200 Chisholm Place, Suite 200, Plano, TX 75075
ali@colaberry.com  |  enterprise.colaberry.ai`;

describe('countSignatureBlocks', () => {
  it('counts one for a single branded signature', () => {
    expect(countSignatureBlocks(SIG_HTML)).toBe(1);
    expect(countSignatureBlocks(SIG_TEXT)).toBe(1);
  });

  it('counts two when the signature is genuinely pasted twice', () => {
    expect(countSignatureBlocks(SIG_HTML + SIG_HTML)).toBe(2);
    expect(countSignatureBlocks(`${SIG_TEXT}\n\n${SIG_TEXT}`)).toBe(2);
  });

  it('does not count a bare mention of the name', () => {
    expect(countSignatureBlocks('<p>Assigned to Ali Muwwakkil for review.</p>')).toBe(0);
  });

  it('counts only the signature when quoted content also names him', () => {
    const body =
      '<p>Ali Muwwakkil opened this ticket.</p>' +
      '<p>Ali Muwwakkil is the approver.</p>' +
      '<p>Waiting on Ali Muwwakkil.</p>' +
      SIG_HTML;
    expect(countSignatureBlocks(body)).toBe(1);
  });

  it('handles empty and null bodies without throwing', () => {
    expect(countSignatureBlocks('')).toBe(0);
    expect(countSignatureBlocks(null)).toBe(0);
    expect(countSignatureBlocks(undefined)).toBe(0);
  });
});

describe('validateBeforeSend — the duplicate-signature guard still works', () => {
  it('rejects a signature pasted twice in the HTML body', () => {
    expect(() => validateBeforeSend(`<p>Hello.</p>${SIG_HTML}${SIG_HTML}`, 'Hello.')).toThrow(
      /2 branded signature blocks/,
    );
  });

  it('rejects a signature pasted twice in the text body', () => {
    expect(() =>
      validateBeforeSend(`<p>Hello.</p>${SIG_HTML}`, `Hello.\n${SIG_TEXT}\n\n${SIG_TEXT}`),
    ).toThrow(/TEXT has 2 branded signature blocks/);
  });

  it('accepts exactly one signature', () => {
    expect(() => validateBeforeSend(`<p>Hello.</p>${SIG_HTML}`, `Hello.\n\n${SIG_TEXT}`)).not.toThrow();
  });
});

describe('validateBeforeSend — the false positive that blocked three jobs', () => {
  /**
   * Each of these reproduces a real production failure. The counts are the ones the
   * logs actually recorded.
   */

  it('Task Prompt Worker: a digest quoting four of Ali’s tasks now sends', () => {
    const tasks = [
      'Ali Muwwakkil to approve the Q3 curriculum',
      'Follow up with Ali Muwwakkil on the Anthropic thread',
      'Ali Muwwakkil: sign the Essnova teaming agreement',
      'Waiting on Ali Muwwakkil for the PaySimple decision',
    ];
    const html =
      '<div>Ready-to-run prompts</div>' +
      tasks.map((t) => `<div style="padding:10px">${t}</div>`).join('') +
      SIG_HTML;
    const text = `READY TO RUN\n${tasks.join('\n')}\n\n${SIG_TEXT}`;

    // Before the fix this threw: 'HTML has "Ali Muwwakkil" 4 times'.
    expect(() => validateBeforeSend(html, text)).not.toThrow();
  });

  it('David ad escalation: two mentions plus a signature now sends', () => {
    const html = `<p>David replied. Ali Muwwakkil needs to review before Thursday.</p>
      <blockquote>Original request from Ali Muwwakkil.</blockquote>${SIG_HTML}`;
    const text = `David replied. Ali Muwwakkil needs to review.\nOriginal from Ali Muwwakkil.\n\n${SIG_TEXT}`;

    expect(() => validateBeforeSend(html, text)).not.toThrow();
  });

  it('Family Command Center: five mentions plus a signature now sends', () => {
    const rows = Array.from(
      { length: 5 },
      (_, i) => `<tr><td>Task ${i + 1}</td><td>Ali Muwwakkil</td></tr>`,
    ).join('');
    const html = `<table>${rows}</table>${SIG_HTML}`;

    expect(() => validateBeforeSend(html, `Assigned to Ali Muwwakkil\n\n${SIG_TEXT}`)).not.toThrow();
  });
});

describe('validateBeforeSend — the other rules are untouched', () => {
  it('still rejects an em-dash in the HTML body', () => {
    expect(() => validateBeforeSend('<p>One thing — then another.</p>', 'ok')).toThrow(
      /Em-dash/,
    );
  });

  it('still rejects an em-dash in the text body', () => {
    expect(() => validateBeforeSend('<p>ok</p>', 'One thing — then another.')).toThrow(
      /Em-dash/,
    );
  });

  it('still rejects a branded signature alongside an informal closer', () => {
    const html = `<p>Thanks for the update.</p><p>Best,<br/>Ali</p>${SIG_HTML}`;
    expect(() => validateBeforeSend(html, 'ok')).toThrow(/branded signature AND informal signoff/);
  });

  it('reports every violation at once rather than only the first', () => {
    const html = `<p>One — two.</p>${SIG_HTML}${SIG_HTML}`;
    let message = '';
    try {
      validateBeforeSend(html, 'ok');
    } catch (err) {
      message = err.message;
    }
    expect(message).toMatch(/Em-dash/);
    expect(message).toMatch(/branded signature blocks/);
  });

  it('accepts an ordinary email with no signature at all', () => {
    expect(() => validateBeforeSend('<p>Short internal note.</p>', 'Short internal note.')).not.toThrow();
  });
});

describe('exported helpers keep their existing behaviour', () => {
  it('hasBrandedSignature detects the block', () => {
    expect(hasBrandedSignature(SIG_HTML)).toBe(true);
    expect(hasBrandedSignature('<p>nothing here</p>')).toBe(false);
  });

  it('findInformalSignoff detects a closer', () => {
    expect(findInformalSignoff('<p>Best,<br/>Ali</p>')).toBeTruthy();
    expect(findInformalSignoff('<p>nothing here</p>')).toBeNull();
  });
});
