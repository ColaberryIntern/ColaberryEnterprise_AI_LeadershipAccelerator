import { resumeParseProblem } from '../portalSettingsApi';

/**
 * The words a learner sees after a resume upload the server could not read. Until 2026-11-10
 * every upload said "Resume uploaded" even when nothing was read (Obi's LinkedIn PDF).
 */
describe('resumeParseProblem', () => {
  it('says nothing when the file was read, or when an older server sent no outcome', () => {
    expect(resumeParseProblem({ resume_parse: { status: 'parsed', attempts: 1, error_class: null } })).toBeNull();
    expect(resumeParseProblem({})).toBeNull();
    expect(resumeParseProblem(null)).toBeNull();
    expect(resumeParseProblem(undefined)).toBeNull();
  });

  it('tells the learner what to do when the file had no readable text', () => {
    const msg = resumeParseProblem({ resume_parse: { status: 'unreadable', attempts: 0, error_class: 'TooLittleText' } });
    expect(msg).toMatch(/could not read any text/);
    expect(msg).toMatch(/Resume saved/);
  });

  it('tells the learner to retry when reading failed', () => {
    const msg = resumeParseProblem({ resume_parse: { status: 'failed', attempts: 2, error_class: 'ExtractionEmpty' } });
    expect(msg).toMatch(/could not read it just now/);
  });
});
