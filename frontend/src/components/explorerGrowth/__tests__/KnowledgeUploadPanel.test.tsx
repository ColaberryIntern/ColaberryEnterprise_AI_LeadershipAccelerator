import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import KnowledgeUploadPanel, { UploadResultNote } from '../KnowledgeUploadPanel';
import type { KnowledgeUploadResult } from '../../../services/explorerKnowledgeApi';

/**
 * "Uploaded" reads as "in use". It is not.
 *
 * A stored document lands unquotable and stays that way until a human marks it grounded. A
 * panel that said "Uploaded ✓" and nothing else would leave someone believing the composer
 * can now answer from their policy PDF, and the symptom of that belief shows up much later,
 * as a reviewer wondering why the copy never mentions it.
 *
 * So these assertions are about what the message SAYS, and about DISTINGUISHABILITY — a
 * refusal must not be readable as a success. That is the same failure mode this subtree has
 * shipped before, where an outage and an empty result rendered identically and the calm
 * reading was the one that stuck.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

function stored(over: Partial<KnowledgeUploadResult> = {}): KnowledgeUploadResult {
  return {
    status: 'stored',
    document_id: 'doc-1',
    sha256: 'a'.repeat(64),
    chunk_count: 12,
    hard_cut_count: 0,
    truncated: false,
    extracted_chars: 8000,
    quotable: false,
    review_required:
      'Stored. Nothing from this document can be quoted until it is marked grounded.',
    ...over,
  } as KnowledgeUploadResult;
}

describe('a successful upload does not claim the document is in use', () => {
  it('says the document is not in use yet', () => {
    const markup = html(<UploadResultNote result={stored()} />);

    expect(markup).toContain('not in use yet');
    expect(markup).toContain('marked grounded');
  });

  it('reports how many passages it became', () => {
    expect(html(<UploadResultNote result={stored({ chunk_count: 12 })} />)).toContain(
      '12 passages',
    );
  });

  it('gets the singular right, because "1 passages" reads as a bug in the thing itself', () => {
    const markup = html(<UploadResultNote result={stored({ chunk_count: 1 })} />);

    expect(markup).toContain('1 passage.');
    expect(markup).not.toContain('1 passages');
  });

  it('never prints the word "Done" or a bare success tick', () => {
    const markup = html(<UploadResultNote result={stored()} />);

    expect(markup).not.toMatch(/\bDone\b/);
    expect(markup).not.toContain('✓');
  });
});

describe('a truncated document is called out, not footnoted', () => {
  it('says the rest of the document cannot answer anything', () => {
    const markup = html(
      <UploadResultNote result={stored({ truncated: true, extracted_chars: 400000 })} />,
    );

    // Without this, the dropped half simply never answers a question and retrieval reads as
    // unhelpful rather than incomplete.
    expect(markup).toContain('cannot answer anything');
    expect(markup).toContain('text-danger');
  });

  it('says nothing about truncation when the document was read whole', () => {
    expect(html(<UploadResultNote result={stored({ truncated: false })} />)).not.toContain(
      'cannot answer anything',
    );
  });

  it('flags hard cuts as worth reading before approving', () => {
    const markup = html(<UploadResultNote result={stored({ hard_cut_count: 3 })} />);

    expect(markup).toContain('without a sentence break');
    expect(markup).toContain('before approving');
  });

  it('says nothing about hard cuts when there were none', () => {
    expect(html(<UploadResultNote result={stored({ hard_cut_count: 0 })} />)).not.toContain(
      'without a sentence break',
    );
  });
});

describe('a duplicate is reported as held, not as an error', () => {
  const duplicate = stored({ status: 'duplicate', chunk_count: 7 }) as KnowledgeUploadResult;

  it('says the file is already a source and nothing was stored twice', () => {
    const markup = html(<UploadResultNote result={duplicate} />);

    expect(markup).toContain('Already held');
    expect(markup).toContain('Nothing was stored twice');
  });

  it('does not render as a warning or a failure', () => {
    const markup = html(<UploadResultNote result={duplicate} />);

    // The end state is exactly what they asked for.
    expect(markup).not.toContain('alert-warning');
    expect(markup).not.toContain('alert-danger');
  });

  it('does not claim a truncation or a hard cut it has no figures for', () => {
    const markup = html(<UploadResultNote result={duplicate} />);

    expect(markup).not.toContain('without a sentence break');
  });
});

describe('a refusal cannot be mistaken for a success', () => {
  const refused: KnowledgeUploadResult = {
    status: 'refused',
    reason: 'no_text',
    message: 'the file was read but contains no text.',
  };

  it('says it was not stored', () => {
    expect(html(<UploadResultNote result={refused} />)).toContain('Not stored');
  });

  it('names the action that fixes it', () => {
    // "Could not read the file" sends someone back to try the same file again. "It needs
    // OCR" is the thing they can actually do.
    expect(html(<UploadResultNote result={refused} />)).toContain('OCR');
  });

  it('renders differently from a success, not merely with different words', () => {
    const refusedMarkup = html(<UploadResultNote result={refused} />);
    const storedMarkup = html(<UploadResultNote result={stored()} />);

    expect(refusedMarkup).toContain('alert-warning');
    expect(storedMarkup).not.toContain('alert-warning');
    expect(refusedMarkup).not.toContain('not in use yet');
  });

  it('gives advice for every refusal reason it can receive', () => {
    const reasons = ['empty_source', 'too_large', 'extraction_failed', 'no_text', 'unknown'];

    for (const reason of reasons) {
      const markup = html(
        <UploadResultNote
          result={{ status: 'refused', reason, message: 'x' } as KnowledgeUploadResult}
        />,
      );
      // An unmapped reason would render an empty advice line, which reads as the panel
      // having nothing to say about a file it just rejected.
      expect(markup).toMatch(/text-muted mt-1">[^<]+</);
    }
  });
});

describe('the panel at rest', () => {
  it('says an upload is safe before anyone has clicked anything', () => {
    const markup = html(<KnowledgeUploadPanel />);

    // The reassurance belongs BEFORE the upload, not only after it: the hesitation this
    // answers is "what happens if I put the wrong thing in".
    expect(markup).toContain('Nothing is quotable until');
    expect(markup).toContain('always safe');
  });

  it('offers a file input and a disabled upload button', () => {
    const markup = html(<KnowledgeUploadPanel />);

    expect(markup).toContain('type="file"');
    // Nothing chosen yet, so the action is not offered as available.
    expect(markup).toContain('disabled');
  });

  it('shows no result note before an upload has run', () => {
    const markup = html(<KnowledgeUploadPanel />);

    expect(markup).not.toContain('Not stored');
    expect(markup).not.toContain('not in use yet');
  });
});
