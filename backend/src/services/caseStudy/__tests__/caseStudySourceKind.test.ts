import {
  classifyCaseStudySource, isOutsideSourceType, INSIDE_SOURCE_TYPES, OUTSIDE_SOURCE_TYPES,
} from '../caseStudySourceKind';

describe('caseStudySourceKind', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => warn.mockRestore());

  it('maps project and repo_collection to inside, silently', () => {
    expect(classifyCaseStudySource('project')).toBe('inside');
    expect(classifyCaseStudySource('repo_collection')).toBe('inside');
    for (const t of INSIDE_SOURCE_TYPES) expect(classifyCaseStudySource(t)).toBe('inside');
    expect(warn).not.toHaveBeenCalled();
  });

  it('maps the two outside values to outside', () => {
    expect(classifyCaseStudySource('external_document')).toBe('outside');
    expect(classifyCaseStudySource('external_drive')).toBe('outside');
    expect(OUTSIDE_SOURCE_TYPES).toEqual(['external_document', 'external_drive']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('defaults unknown, empty, null and non-string values to inside with one structured warning each, never throwing', () => {
    const inputs: unknown[] = ['spreadsheet', '', null, undefined, 42, { a: 1 }, 'EXTERNAL_DOCUMENT'];
    for (const v of inputs) expect(classifyCaseStudySource(v)).toBe('inside');
    expect(warn).toHaveBeenCalledTimes(inputs.length);
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({ level: 'warn', event: 'case_study_source_kind_unknown', error_class: 'UnknownSourceType' });
    expect(line.context).toEqual({ source_type: 'spreadsheet', defaulted_to: 'inside' });
  });

  it('caps an absurdly long unknown value in the log line', () => {
    classifyCaseStudySource('x'.repeat(500));
    expect(JSON.parse(String(warn.mock.calls[0][0])).context.source_type).toHaveLength(60);
  });

  it('does not treat prototype keys as known types', () => {
    expect(classifyCaseStudySource('toString')).toBe('inside');
    expect(classifyCaseStudySource('__proto__')).toBe('inside');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('isOutsideSourceType is true only for the explicit outside values', () => {
    expect(isOutsideSourceType('external_drive')).toBe(true);
    expect(isOutsideSourceType('project')).toBe(false);
    expect(isOutsideSourceType(null)).toBe(false);
    expect(isOutsideSourceType('external')).toBe(false);
  });
});
