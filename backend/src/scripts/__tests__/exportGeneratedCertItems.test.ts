import { emitModule } from '../exportGeneratedCertItems';

/**
 * The export must round-trip: what it prints, evaluated as JavaScript, is the
 * rows it was given. Quotes, backslashes and newlines in question text are the
 * cases that break a hand-rolled emitter, so they are the fixture.
 */
const row = (key: string, stem: string) => ({
  question_key: key,
  track_id: 'ccar-f',
  blueprint_version: '1.0-2026-07',
  domain_id: 'D1',
  objective_id: 'D1.2',
  scenario_family: 'S3',
  difficulty: 'medium',
  stem,
  options: [
    { key: 'A', text: 'one "quoted" option' },
    { key: 'B', text: 'a back\slash' },
    { key: 'C', text: 'two\nlines' },
    { key: 'D', text: "it's" },
  ],
  correct_keys: ['C'],
  select_count: 1,
  rationale: 'because',
  distractor_rationales: { A: 'no', B: 'no', D: 'no' },
});

/** Evaluate the emitted array literal. */
function evaluate(moduleText: string): any[] {
  const start = moduleText.indexOf('= [');
  const body = moduleText.slice(start + 2).replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${body}`)();
}

describe('exportGeneratedCertItems', () => {
  it('round-trips awkward text and sorts by key', () => {
    const rows = [row('CCARF-D1-40', 'Logs show "x" failed\twice\nand again'), row('CCARF-D1-31', 'plain')];
    const out = emitModule(rows as any, '2026-09-11');
    expect(out).toContain('export const GENERATED_ITEMS: DraftRevisionInput[]');
    expect(out).toContain("import type { DraftRevisionInput }");
    const back = evaluate(out);
    expect(back.map((r) => r.question_key)).toEqual(['CCARF-D1-31', 'CCARF-D1-40']);
    const first = back.find((r) => r.question_key === 'CCARF-D1-40');
    expect(first.stem).toBe('Logs show "x" failed\twice\nand again');
    expect(first.options).toEqual(rows[0].options);
    expect(first.distractor_rationales).toEqual(rows[0].distractor_rationales);
    expect(first.correct_keys).toEqual(['C']);
    expect(first.author).toBe('colaberry');
  });

  it('defaults select_count to the number of correct keys', () => {
    const r = { ...row('CCARF-D2-33', 's'), select_count: null, correct_keys: ['A', 'B'] };
    const back = evaluate(emitModule([r] as any, '2026-09-11'));
    expect(back[0].select_count).toBe(2);
  });
});
