import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  diffLines,
  hasChanges,
  SourcesList,
  BrandVoiceBadge,
} from '../DraftRevisionPanel';
import type { ExplorerWhyMessage } from '../../../services/explorerGrowthApi';

/**
 * The revision surface's pure parts.
 *
 * `diffLines` gets the most attention because it is the piece most likely to be subtly
 * wrong in a way that looks fine: the naive implementation — zip the two line arrays and
 * compare by index — is correct for a replacement and WRONG for an insertion, reporting
 * every line after it as changed. On a four-paragraph email that means the diff says
 * "everything changed" exactly when a reviewer most needs to see that only the opening did.
 * So there is a test for that specific case, and it fails against the naive version.
 *
 * The rest assert the stated negatives, which are this page's established pattern: an empty
 * source list must say WHICH empty it is, because "the corpus could not be read" and "it was
 * read and offered nothing" are a deployment problem and a content problem.
 */

function message(over: Partial<ExplorerWhyMessage> = {}): ExplorerWhyMessage {
  return {
    scheduled_email_id: 'se-1',
    subject: 'S',
    body: '<p>B</p>',
    status: 'explorer_draft',
    passed_quality_gate: true,
    issues: [],
    auto_fixed: [],
    fact_set_present: true,
    step_index: 0,
    model: 'gpt-x',
    created_at: null,
    cited: [],
    knowledge_available: true,
    brand_voice: null,
    ...over,
  };
}

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('diffLines', () => {
  it('reports identical text as entirely unchanged', () => {
    const lines = diffLines('one\ntwo', 'one\ntwo');

    expect(lines.map((l) => l.kind)).toEqual(['same', 'same']);
    expect(hasChanges(lines)).toBe(false);
  });

  it('reads an INSERTION as one added line, not as everything after it changing', () => {
    // THE CASE A NAIVE INDEX-ZIP GETS WRONG. Zipping by index would report line 2 as
    // changed (two -> NEW), line 3 as changed (three -> two) and line 3 as added — three
    // changes for one insertion.
    const lines = diffLines('one\ntwo\nthree', 'one\nNEW\ntwo\nthree');

    expect(lines).toEqual([
      { kind: 'same', text: 'one' },
      { kind: 'added', text: 'NEW' },
      { kind: 'same', text: 'two' },
      { kind: 'same', text: 'three' },
    ]);
  });

  it('reads a deletion as one removed line', () => {
    const lines = diffLines('one\ntwo\nthree', 'one\nthree');

    expect(lines).toEqual([
      { kind: 'same', text: 'one' },
      { kind: 'removed', text: 'two' },
      { kind: 'same', text: 'three' },
    ]);
  });

  it('reads a replacement as a removal and an addition of the same line', () => {
    const lines = diffLines('one\nold\nthree', 'one\nnew\nthree');

    expect(lines.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['old']);
    expect(lines.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['new']);
    expect(lines.filter((l) => l.kind === 'same').map((l) => l.text)).toEqual(['one', 'three']);
  });

  it('handles a first version with no previous text', () => {
    const lines = diffLines('', 'one\ntwo');
    // The empty string splits to one empty line, which is removed; both real lines are added.
    expect(lines.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['one', 'two']);
  });

  it('handles the body being emptied entirely', () => {
    const lines = diffLines('one\ntwo', '');
    expect(lines.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['one', 'two']);
  });

  it('preserves every line of both inputs, so nothing is silently dropped', () => {
    const previous = 'a\nb\nc\nd';
    const current = 'a\nx\nc\ny\nd';
    const lines = diffLines(previous, current);

    const keptOrRemoved = lines.filter((l) => l.kind !== 'added').map((l) => l.text);
    const keptOrAdded = lines.filter((l) => l.kind !== 'removed').map((l) => l.text);

    expect(keptOrRemoved).toEqual(previous.split('\n'));
    expect(keptOrAdded).toEqual(current.split('\n'));
  });
});

describe('SourcesList', () => {
  it('lists each cited entry with a link into the hub', () => {
    const markup = html(
      <SourcesList
        m={message({
          cited: [
            {
              domain: 'sales',
              question: 'Do I need a coding background?',
              reference: 'sales/index.html#cat-program-basics',
              referenceLabel: 'Program basics',
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('Do I need a coding background?');
    expect(markup).toContain('sales');
    // The link is the point: a reviewer checks a sentence against the entry it came from.
    expect(markup).toContain('href="/knowledge/sales/index.html#cat-program-basics"');
    expect(markup).toContain('Program basics');
  });

  it('renders no link for an entry whose reference is empty', () => {
    const markup = html(
      <SourcesList
        m={message({
          cited: [{ domain: 'sales', question: 'Q?', reference: '', referenceLabel: '' }],
        })}
      />,
    );

    expect(markup).toContain('Q?');
    expect(markup).not.toContain('<a');
  });

  it('distinguishes "could not be read" from "read and offered nothing"', () => {
    const unavailable = html(<SourcesList m={message({ cited: [], knowledge_available: false })} />);
    const nothingQuotable = html(<SourcesList m={message({ cited: [], knowledge_available: true })} />);

    expect(unavailable).toContain('could not be read');
    expect(nothingQuotable).toContain('offered nothing');
    // The assertion that matters: the two empty states must not render the same words.
    expect(unavailable).not.toBe(nothingQuotable);
  });

  it('names the content problem rather than suggesting the gate be loosened', () => {
    const markup = html(<SourcesList m={message({ cited: [], knowledge_available: true })} />);
    expect(markup).toContain('not a gate to loosen');
  });
});

describe('BrandVoiceBadge', () => {
  it('names the brand and its published rule-set version', () => {
    const markup = html(
      <BrandVoiceBadge
        m={message({ brand_voice: { name: 'AI Flotation', rules_version: 4, published: true } })}
      />,
    );

    expect(markup).toContain('Written as AI Flotation');
    expect(markup).toContain('Voice v4');
    expect(markup).not.toContain('No published voice');
  });

  it('says UNGOVERNED out loud at version 0, rather than omitting the badge', () => {
    // An absent badge is indistinguishable from a panel that forgot to check. Version 0
    // means nobody has written a voice down — not that this brand's voice says nothing.
    const markup = html(
      <BrandVoiceBadge
        m={message({
          brand_voice: { name: 'Colaberry Enterprise AI Division', rules_version: 0, published: false },
        })}
      />,
    );

    expect(markup).toContain('No published voice');
    expect(markup).toContain('Written as Colaberry Enterprise AI Division');
  });

  it('states that the voice was not recorded for a draft that predates it', () => {
    const markup = html(<BrandVoiceBadge m={message({ brand_voice: null })} />);
    expect(markup).toContain('Brand voice not recorded');
  });
});
