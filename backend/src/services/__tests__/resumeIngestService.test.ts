import {
  buildResumeExtractionPrompt, parseExtractionJson, mapExtractionToPrefill, mapExtractionToProfile, ingestBackground,
} from '../resumeIngestService';
import { OnboardingProfile } from '../../models';

jest.mock('../../models', () => ({
  OnboardingProfile: { findOne: jest.fn(), create: jest.fn() },
}));

describe('resumeIngestService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('buildResumeExtractionPrompt (pure)', () => {
    it('includes the source text and asks for JSON only', () => {
      const p = buildResumeExtractionPrompt('Senior data engineer at Acme, healthcare.');
      expect(p).toContain('Senior data engineer at Acme');
      expect(p).toMatch(/JSON/i);
    });
    it('truncates very long input', () => {
      const p = buildResumeExtractionPrompt('x'.repeat(20000));
      expect(p.length).toBeLessThan(9000);
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
  });
});
