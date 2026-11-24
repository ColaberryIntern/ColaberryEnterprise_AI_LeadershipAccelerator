/**
 * What the build-artifact upload will and will not take.
 *
 * Reported by the QA tester 2026-11-24: the Week 4 Prompt Library lab tells a
 * student to produce `eval.jsonl` test cases and a Python scorer, and the
 * upload step then refused both. The lab asked for work it would not accept.
 *
 * Until now the rule lived inside a multer callback, unexported, so no test
 * could reach it and the accepted list could drift from what the labs ask for
 * without anything going red. That is the real reason this went unnoticed, so
 * the predicate is pure and exported and this file pins it.
 */
import { isAcceptedBuildArtifact, BUILD_ARTIFACT_ACCEPTED_LABEL } from '../upload';

describe('the files the labs ask students to produce', () => {
  it('takes the Week 4 lab\'s own output: eval.jsonl and a Python scorer', () => {
    // Browsers have no registered type for either, and usually send nothing
    // useful, so these must pass on the extension alone.
    expect(isAcceptedBuildArtifact('application/octet-stream', 'eval.jsonl')).toBe(true);
    expect(isAcceptedBuildArtifact('', 'eval.jsonl')).toBe(true);
    expect(isAcceptedBuildArtifact('application/octet-stream', 'gate_library.py')).toBe(true);
    expect(isAcceptedBuildArtifact('text/x-python', 'eval_prompt.py')).toBe(true);
  });

  it('takes the config shapes the same labs generate', () => {
    expect(isAcceptedBuildArtifact('application/json', 'blueprint.json')).toBe(true);
    expect(isAcceptedBuildArtifact('', 'prompts.yaml')).toBe(true);
    expect(isAcceptedBuildArtifact('', 'prompts.yml')).toBe(true);
  });
});

describe('ZIP, including the type Windows actually sends', () => {
  it('takes a zip by its registered type, by the Windows type, and by extension', () => {
    expect(isAcceptedBuildArtifact('application/zip', 'library.zip')).toBe(true);
    // Chrome and Edge on Windows send this one; it is not the registered type.
    expect(isAcceptedBuildArtifact('application/x-zip-compressed', 'library.zip')).toBe(true);
    expect(isAcceptedBuildArtifact('application/octet-stream', 'library.zip')).toBe(true);
  });
});

describe('what it still refuses', () => {
  it('refuses the extensions that become script when served inline', () => {
    // Deliberate: the Deep Dive field guide takes .html through its own config,
    // which stores it in the database and renders it on purpose.
    expect(isAcceptedBuildArtifact('text/html', 'report.html')).toBe(false);
    expect(isAcceptedBuildArtifact('image/svg+xml', 'diagram.svg')).toBe(false);
    expect(isAcceptedBuildArtifact('text/javascript', 'bundle.js')).toBe(false);
  });

  it('refuses an executable and a file with no extension and no usable type', () => {
    expect(isAcceptedBuildArtifact('application/octet-stream', 'setup.exe')).toBe(false);
    expect(isAcceptedBuildArtifact('application/octet-stream', 'noextension')).toBe(false);
    expect(isAcceptedBuildArtifact(undefined, '')).toBe(false);
  });
});

describe('the advertised list and the enforced list agree', () => {
  /** Every type named in the student-facing label, with a file that proves it. */
  const CLAIMS: ReadonlyArray<readonly [string, string]> = [
    ['PDF', 'a.pdf'], ['Word', 'a.docx'], ['PowerPoint', 'a.pptx'], ['Excel', 'a.xlsx'],
    ['RTF', 'a.rtf'], ['Text', 'a.txt'], ['Markdown', 'a.md'], ['CSV', 'a.csv'],
    ['JSON', 'a.json'], ['JSONL', 'a.jsonl'], ['YAML', 'a.yaml'], ['Python', 'a.py'],
    ['images', 'a.png'], ['MP4', 'a.mp4'], ['MOV', 'a.mov'], ['WEBM', 'a.webm'],
    ['MP3', 'a.mp3'], ['M4A', 'a.m4a'], ['WAV', 'a.wav'], ['ZIP', 'a.zip'],
  ];

  it.each(CLAIMS)('the label promises %s, and %s is accepted', (claim, filename) => {
    expect(BUILD_ARTIFACT_ACCEPTED_LABEL).toContain(claim);
    expect(isAcceptedBuildArtifact('application/octet-stream', filename)).toBe(true);
  });
});
