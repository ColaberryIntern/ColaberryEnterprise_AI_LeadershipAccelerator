/**
 * C128 My work shaping, against the real content shapes of every stored kind (production, read-only, 10 Nov 2026):
 * case_study / prompt_library / architecture_doc carry `sections`, architecture_decision an `adr` and `receipt`,
 * field_guide `body_html`, claude_studio `artifact_url` + `reflection`, build_artifact an upload, presentation a recording.
 */
import { groupFor, linkBodyFor, recordingBodyFor, skillsFor, splitTitle, stateFor, toWorkItem, writtenBodyFor } from '../myWorkModel';

const row = (kind: string, title: string, content: Record<string, unknown>, competencies: unknown = []) =>
  ({ id: 'id-1', kind, title, created_at: '2026-08-24T15:00:00Z', content, competencies });

describe('groupFor: what the piece IS picks its viewer', () => {
  it.each([
    ['case_study', {}, 'written'], ['prompt_library', {}, 'written'], ['architecture_doc', {}, 'written'],
    ['architecture_decision', {}, 'written'], ['field_guide', { body_html: '<html/>' }, 'guide'],
    ['claude_studio', { artifact_url: 'https://claude.ai/x' }, 'link'], ['presentation', { recordingRef: 'recording:x' }, 'recording'],
  ])('%s -> %s', (kind, content, group) => expect(groupFor(kind, content)).toBe(group));

  it.each([
    ['report.pdf', 'application/pdf', 'pdf'], ['inventory.csv', 'application/octet-stream', 'sheet'], ['plan.xlsx', '', 'sheet'],
    ['data-flow-diagram.docx', '', 'word'], ['deck.pptx', '', 'slides'], ['demo-script.md', 'text/markdown', 'notes'],
    ['notes.txt', 'text/plain', 'notes'], ['shot.png', 'image/png', 'image'], ['bundle.zip', 'application/zip', 'file'],
  ])('a build file %s is grouped by its file type', (filename, mimetype, group) => {
    expect(groupFor('build_artifact', { stored_path: '/app/uploads/x', filename, mimetype })).toBe(group);
  });

  it('a row with no sections and no file still lands somewhere readable', () => expect(groupFor('mystery', {})).toBe('written'));
});

describe('splitTitle: clean titles, the lesson moved out', () => {
  it.each([
    ['build_artifact', 'Build — Your Expo Presentation — demo-script.md', 'demo-script.md', 'Your Expo Presentation'],
    ['field_guide', 'Field Guide — Deep Dive - Business Analyst', 'Deep Dive - Business Analyst', 'Field guide'],
    ['claude_studio', 'Claude Studio — Capstone Defense and Launch Studio — claude.ai', 'Capstone Defense and Launch Studio', 'Claude Studio'],
    ['architecture_decision', "ADR — You Don't Become an Architect by Learning More Tools", "You Don't Become an Architect by Learning More Tools", 'Decision record'],
    ['case_study', 'Week 2 Evaluation Case Study', 'Week 2 Evaluation Case Study', 'Case study'],
    ['prompt_library', 'Capstone Project Prompt Lab', 'Capstone Project Prompt Lab', 'Prompt lab'],
  ])('%s: %s', (kind, raw, title, from) => expect(splitTitle(kind, raw)).toEqual({ title, from }));

  it('keeps a dash that is part of the name, and an empty title stays empty rather than throwing', () => {
    expect(splitTitle('build_artifact', 'Build — Lesson — a — b.md').title).toBe('a — b.md');
    expect(splitTitle('case_study', '')).toEqual({ title: '', from: 'Case study' });
  });
});

describe('skills and state', () => {
  it('uses the competencies column, else skills_demonstrated, deduplicated case-insensitively', () => {
    expect(skillsFor(['architecture', 'Architecture', ' mcp '], {})).toEqual(['architecture', 'mcp']);
    expect(skillsFor([], { skills_demonstrated: ['Critical Thinking', 'Problem Solving'] })).toEqual(['Critical Thinking', 'Problem Solving']);
    expect(skillsFor(null, { competencies: ['communication', 7] })).toEqual(['communication']);
    expect(skillsFor(undefined, {})).toEqual([]);
  });

  it('never claims a review or verification that did not happen', () => {
    expect(stateFor('claude_studio', { verification: 'unverified_link' })).toBe('Link format-checked, not reviewed yet');
    expect(stateFor('build_artifact', {})).toBe('Submitted, not reviewed yet');
    expect(stateFor('case_study', {})).toBe('Written by the platform from your completed lesson');
    for (const k of ['claude_studio', 'build_artifact', 'field_guide', 'case_study', 'architecture_decision', 'presentation']) {
      expect(stateFor(k, {})).not.toMatch(/\bverified\b|\bapproved\b|\bfree\b/i);
    }
  });
});

describe('toWorkItem', () => {
  it('shapes a real build artifact row', () => {
    const item = toWorkItem(row('build_artifact', 'Build — Your Expo Presentation — coreops_program_inventory.csv', {
      week: 12, filename: 'coreops_program_inventory.csv', mimetype: 'text/csv', stored_path: '/app/uploads/strategy-prep/x.csv', project_label: 'GoalKick',
    }, ['architecture', 'decision_making']));
    expect(item).toEqual({
      id: 'id-1', kind: 'build_artifact', group: 'sheet', title: 'coreops_program_inventory.csv', from: 'Your Expo Presentation',
      createdAt: '2026-08-24T15:00:00.000Z', week: 12, project: 'GoalKick', skills: ['architecture', 'decision_making'], state: 'Submitted, not reviewed yet',
    });
  });

  it('tolerates a null content and a non-number week', () => {
    const item = toWorkItem(row('case_study', 'X', null as never));
    expect(item.week).toBeNull();
    expect(item.project).toBeNull();
    expect(toWorkItem(row('case_study', 'X', { week: '3' })).week).toBeNull();
  });
});

describe('the in-app reader body', () => {
  it('sections: drops empty ones, keeps order', () => {
    expect(writtenBodyFor('case_study', { sections: [{ heading: 'Evaluation Overview', body: 'The Week 2 Evaluation assessed...' }, { heading: '', body: '' }, { body: 'Tail' }] }))
      .toEqual({ form: 'sections', sections: [{ heading: 'Evaluation Overview', body: 'The Week 2 Evaluation assessed...' }, { heading: '', body: 'Tail' }] });
    expect(writtenBodyFor('case_study', { sections: [] })).toBeNull();
  });

  it('a decision record: known fields in reading order, null fields dropped, the receipt with its qualification', () => {
    const body = writtenBodyFor('architecture_decision', {
      adr: { owner: null, context: 'Build an AI assistant...', decision: 'Ask who will use it', tradeoff: null, assumption: null, commitment: 'Ask first', risk_named: 'Scope creep' },
      receipt: { counts: [{ label: 'kinds of users', value: '4' }, { label: 'bad', value: null }], minutes: 5, qualification: 'Illustrative and scenario-based.' },
    });
    expect(body).toEqual({
      form: 'decision',
      fields: [{ label: 'The situation', value: 'Build an AI assistant...' }, { label: 'The decision', value: 'Ask who will use it' },
        { label: 'The commitment', value: 'Ask first' }, { label: 'Risk named', value: 'Scope creep' }],
      receipt: { counts: [{ label: 'kinds of users', value: '4' }], note: 'Illustrative and scenario-based.' },
    });
  });

  it('a decision record with nothing written is no body, not an empty card', () => {
    expect(writtenBodyFor('architecture_decision', { adr: { owner: null } })).toBeNull();
  });

  it('a link: only https links survive; the reflection and stages are kept', () => {
    expect(linkBodyFor({ artifact_url: 'https://claude.ai/artifact/U#case', reflection: 'I built it twice', stages_completed: ['explore', 3, 'prove'], project_proof_url: 'javascript:alert(1)' }))
      .toEqual({ url: 'https://claude.ai/artifact/U#case', reflection: 'I built it twice', stages: ['explore', 'prove'], aiDisclosure: null, projectProofUrl: null });
  });

  it('a recording: what it was', () => {
    expect(recordingBodyFor({ durationSeconds: 1037, projectName: 'Travel Platform', mode: 'practice_solo' }))
      .toEqual({ durationSeconds: 1037, projectName: 'Travel Platform', mode: 'practice_solo' });
  });
});
