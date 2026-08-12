import {
  buildResumeExtractionPrompt, parseExtractionJson, mapExtractionToPrefill, mapExtractionToProfile,
  ingestBackground, getOnboardingProfile,
} from '../resumeIngestService';
import { OnboardingProfile } from '../../models';
import { persistResumeSkillClaims } from '../cape/capeResumeClaimService';
import { recomputeStudentArchitectureSkill } from '../cape/capeProficiencyService';
import { hasReferral } from '../friendReferralService';

jest.mock('../../models', () => ({
  OnboardingProfile: { findOne: jest.fn(), create: jest.fn() },
}));
// CAPE Phase 2 wiring: mocked at the module boundary so this file tests ONLY
// that resumeIngestService calls out correctly (non-fatally) — the actual
// persistence/scoring logic has its own dedicated test suites
// (capeResumeClaimService.test.ts, capeResumeClaimExtraction.test.ts).
jest.mock('../cape/capeResumeClaimService', () => ({ persistResumeSkillClaims: jest.fn() }));
jest.mock('../cape/capeProficiencyService', () => ({ recomputeStudentArchitectureSkill: jest.fn() }));
jest.mock('../friendReferralService', () => ({ hasReferral: jest.fn().mockResolvedValue(false) }));
// pointsService.award() is dynamically imported (unmocked, real module) by
// ingestBackground's pre-existing non-fatal points-award side effect. Mocking
// it here (it was previously exercised only by luck, via a fast real-DB
// connection failure caught by the non-fatal try/catch) makes the
// 'linkedin-only' test's real code path deterministic instead of
// timeout-prone — the added CAPE module-loading chain elsewhere in this file
// pushed that latent real-DB-connection-attempt over jest's 5s test timeout.
jest.mock('../pointsService', () => ({ award: jest.fn().mockResolvedValue(undefined) }));

const mockPersistClaims = persistResumeSkillClaims as unknown as jest.Mock;
const mockRecompute = recomputeStudentArchitectureSkill as unknown as jest.Mock;
jest.mock('../pointsService', () => ({ award: jest.fn().mockResolvedValue({ awarded: true, points: 25 }) }));

describe('resumeIngestService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersistClaims.mockResolvedValue({ resume_version: 1, touched_skill_ids: [], claims_written: 0 });
    mockRecompute.mockResolvedValue({});
    (hasReferral as unknown as jest.Mock).mockResolvedValue(false);
  });

  describe('buildResumeExtractionPrompt (pure)', () => {
    it('includes the source text and asks for JSON only', () => {
      const p = buildResumeExtractionPrompt('Senior data engineer at Acme, healthcare.');
      expect(p).toContain('Senior data engineer at Acme');
      expect(p).toMatch(/JSON/i);
    });
    it('truncates the SOURCE TEXT portion to MAX_SOURCE_CHARS regardless of input length', () => {
      const p = buildResumeExtractionPrompt('x'.repeat(20000));
      // The source text is always appended LAST, after the fixed marker —
      // splitting on it isolates exactly the truncated portion, regardless of
      // how much fixed instructional text (which legitimately contains
      // stray "x" characters, e.g. "text", "context") precedes it. This
      // avoids a brittle total-length budget while still proving truncation.
      const sourceTextPortion = p.split('--- BACKGROUND TEXT ---\n')[1] || '';
      expect(sourceTextPortion.length).toBe(8000);
      expect(sourceTextPortion).toBe('x'.repeat(8000));
      expect(p.length).toBeLessThan(20000); // still far shorter than the raw input
    });
  });

  describe('parseExtractionJson (pure)', () => {
    it('parses plain JSON', () => {
      expect(parseExtractionJson('{"industry":"Healthcare"}')).toEqual({ industry: 'Healthcare' });
    });
    it('parses fenced ```json blocks', () => {
      expect(parseExtractionJson('```json\n{"role":"CTO"}\n```')).toEqual({ role: 'CTO' });
    });
    it('recovers a {...} block embedded in prose', () => {
      expect(parseExtractionJson('Sure! {"industry":"Fintech"} hope that helps')).toEqual({ industry: 'Fintech' });
    });
    it('returns null on garbage', () => {
      expect(parseExtractionJson('not json at all')).toBeNull();
      expect(parseExtractionJson('')).toBeNull();
    });
  });

  describe('mapExtractionToPrefill (pure)', () => {
    it('maps present fields into projectDna + variables, omitting absent ones', () => {
      const { projectDna, variables } = mapExtractionToPrefill({
        industry: 'Healthcare', industry_track: 'health', target_user: 'Nurses',
        business_problem: 'Manual triage', role: 'Data Lead', company_name: 'Acme',
        ai_maturity_level: 2, skills: ['Python', 'MCP'],
      });
      expect(projectDna).toEqual({
        industry: 'Healthcare', industryTrack: 'health', targetUser: 'Nurses', businessProblem: 'Manual triage',
      });
      expect(variables).toEqual({
        industry: 'Healthcare', role: 'Data Lead', company_name: 'Acme', ai_maturity_level: '2', skills: 'Python, MCP',
      });
    });
    it('is empty for null / empty extraction', () => {
      expect(mapExtractionToPrefill(null)).toEqual({ projectDna: {}, variables: {} });
      expect(mapExtractionToPrefill({})).toEqual({ projectDna: {}, variables: {} });
    });
  });

  describe('mapExtractionToProfile (pure)', () => {
    it('maps profile fields + personalization, title falls back to role', () => {
      const { profile, personalization } = mapExtractionToProfile({
        full_name: 'Ada Lovelace', company_name: 'Acme', company_size: '51-200', phone: '555',
        role: 'Data Lead', industry: 'Retail', seniority: 'Senior', years_experience: '8',
        skills: ['Python', 'MCP'], goals: 'Ship agents', location: 'Austin',
      });
      expect(profile).toEqual({ full_name: 'Ada Lovelace', title: 'Data Lead', company: 'Acme', company_size: '51-200', phone: '555' });
      expect(personalization).toEqual({
        industry: 'Retail', role: 'Data Lead', seniority: 'Senior', years_experience: '8',
        skills: 'Python, MCP', goals: 'Ship agents', location: 'Austin',
      });
    });
    it('prefers explicit title over role', () => {
      expect(mapExtractionToProfile({ title: 'CTO', role: 'Engineer' }).profile.title).toBe('CTO');
    });
    it('is empty for null extraction', () => {
      expect(mapExtractionToProfile(null)).toEqual({ profile: {}, personalization: {} });
    });
  });

  describe('ingestBackground', () => {
    it('rejects when neither resume nor linkedin is provided', async () => {
      const res = await ingestBackground('enr-1', {});
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('no_input');
      expect(OnboardingProfile.findOne).not.toHaveBeenCalled();
    });

    it('extracts, maps, and persists a prefill (injected extractor)', async () => {
      (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
      (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
      const extract = jest.fn().mockResolvedValue('{"industry":"Retail","role":"COO"}');

      const res = await ingestBackground('enr-1', { resumeText: 'resume text' }, { extract });

      expect(extract).toHaveBeenCalledTimes(1);
      expect(res.ok).toBe(true);
      expect(res.parsed).toBe(true);
      expect(res.prefill).toEqual({ industry: 'Retail' });
      expect(res.variables).toEqual({ industry: 'Retail', role: 'COO' });
      expect(res.profile).toEqual({ title: 'COO' });                          // role → title
      expect(res.personalization).toEqual({ industry: 'Retail', role: 'COO' });
      const created = (OnboardingProfile.create as jest.Mock).mock.calls[0][0];
      expect(created.enrollment_id).toBe('enr-1');
      // Saved prefill now bundles ProjectDNA + the profile + personalization prefills.
      expect(created.prefill).toEqual({
        industry: 'Retail',
        profile: { title: 'COO' },
        personalization: { industry: 'Retail', role: 'COO' },
      });
    });

    it('is non-fatal when the extractor throws: still saves, empty prefill, parsed=false', async () => {
      (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
      (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
      const extract = jest.fn().mockRejectedValue(new Error('OpenAI down'));

      const res = await ingestBackground('enr-1', { resumeText: 'resume text' }, { extract });

      expect(res.ok).toBe(true);
      expect(res.parsed).toBe(false);
      expect(res.prefill).toEqual({});
      expect(OnboardingProfile.create).toHaveBeenCalledTimes(1); // profile still persisted
    });

    it('linkedin-only: stores the url, no extractor call', async () => {
      (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
      (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
      const extract = jest.fn();

      const res = await ingestBackground('enr-1', { linkedinUrl: 'https://linkedin.com/in/maya' }, { extract });

      expect(extract).not.toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(res.linkedin_url).toBe('https://linkedin.com/in/maya');
      const created = (OnboardingProfile.create as jest.Mock).mock.calls[0][0];
      expect(created.linkedin_url).toBe('https://linkedin.com/in/maya');
    });

    describe('CAPE Phase 2 wiring (design doc §5)', () => {
      it('happy path: a successful extraction persists skill claims and recomputes each touched skill', async () => {
        (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
        (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
        mockPersistClaims.mockResolvedValue({ resume_version: 1, touched_skill_ids: ['agents_mcp', 'rag'], claims_written: 2 });
        const extract = jest.fn().mockResolvedValue('{"industry":"Retail"}');

        await ingestBackground('enr-1', { resumeText: 'resume text' }, { extract });

        expect(mockPersistClaims).toHaveBeenCalledTimes(1);
        expect(mockPersistClaims.mock.calls[0][0]).toBe('enr-1');
        expect(mockRecompute).toHaveBeenCalledTimes(2);
        expect(mockRecompute).toHaveBeenCalledWith('enr-1', 'agents_mcp');
        expect(mockRecompute).toHaveBeenCalledWith('enr-1', 'rag');
      });

      it('failure path: a CAPE persistence failure is non-fatal — ingest still succeeds', async () => {
        (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
        (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
        mockPersistClaims.mockRejectedValue(new Error('DB unavailable'));
        const extract = jest.fn().mockResolvedValue('{"industry":"Retail"}');

        const res = await ingestBackground('enr-1', { resumeText: 'resume text' }, { extract });

        expect(res.ok).toBe(true);
        expect(mockRecompute).not.toHaveBeenCalled(); // never reached — persistence threw first
      });

      it('boundary: a failed/absent extraction never calls CAPE persistence at all (resume_version must not advance on garbage)', async () => {
        (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
        (OnboardingProfile.create as jest.Mock).mockResolvedValue({});
        const extract = jest.fn().mockResolvedValue('not valid json');

        const res = await ingestBackground('enr-1', { resumeText: 'resume text' }, { extract });

        expect(res.parsed).toBe(false);
        expect(mockPersistClaims).not.toHaveBeenCalled();
      });
    });
  });

  describe('getOnboardingProfile', () => {
    it('boundary: no OnboardingProfile row -> resume_version 0, extractor_version null, no throw', async () => {
      (OnboardingProfile.findOne as jest.Mock).mockResolvedValue(null);
      const profile = await getOnboardingProfile('enr-1');
      expect(profile.resume_version).toBe(0);
      expect(profile.extractor_version).toBeNull();
      expect(profile.has_resume).toBe(false);
    });

    it('happy path: surfaces resume_version and extractor_version from the stored row', async () => {
      (OnboardingProfile.findOne as jest.Mock).mockResolvedValue({
        prefill: {}, linkedin_url: null, resume_text: 'x', resume_version: 3, extractor_version: 'resume-skill-claims-v1',
      });
      const profile = await getOnboardingProfile('enr-1');
      expect(profile.resume_version).toBe(3);
      expect(profile.extractor_version).toBe('resume-skill-claims-v1');
    });
  });
});
