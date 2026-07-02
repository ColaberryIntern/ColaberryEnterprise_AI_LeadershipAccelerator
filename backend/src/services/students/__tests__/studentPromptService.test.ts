import { generateStudentPrompt, type RequirementForPrompt } from '../studentPromptService';

const BASE: RequirementForPrompt = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  requirement_key: 'REQ-001',
  requirement_text: 'Implement user authentication with JWT',
  status: 'unmatched',
  category: 'build',
  urgency_score: 75,
  github_file_paths: ['src/auth.ts', 'src/middleware.ts'],
  github_repo_url: 'https://github.com/testuser/my-ai-project',
  project_name: 'My AI Project',
  organization_name: 'Test Corp',
};

describe('generateStudentPrompt()', () => {

  describe('happy path — project with GitHub repo', () => {
    it('includes the github_repo_url in the output', () => {
      expect(generateStudentPrompt(BASE)).toContain('https://github.com/testuser/my-ai-project');
    });

    it('includes all three curriculum doc references', () => {
      const prompt = generateStudentPrompt(BASE);
      expect(prompt).toContain('STUDENT_PLATFORM_BUILD_SPEC.md');
      expect(prompt).toContain('STUDENT_PLATFORM_STRATEGY.md');
      expect(prompt).toContain('STUDENT_PLATFORM_BLUEPRINT.html');
    });

    it('includes the requirement_key and requirement_text', () => {
      const prompt = generateStudentPrompt(BASE);
      expect(prompt).toContain('REQ-001');
      expect(prompt).toContain('Implement user authentication with JWT');
    });

    it('includes github_file_paths when present', () => {
      const prompt = generateStudentPrompt(BASE);
      expect(prompt).toContain('src/auth.ts');
      expect(prompt).toContain('src/middleware.ts');
    });

    it('includes organization_name and project_name', () => {
      const prompt = generateStudentPrompt(BASE);
      expect(prompt).toContain('Test Corp');
      expect(prompt).toContain('My AI Project');
    });

    it('includes urgency_score', () => {
      expect(generateStudentPrompt(BASE)).toContain('75/100');
    });

    it('ends with "Start now."', () => {
      expect(generateStudentPrompt(BASE).trimEnd()).toMatch(/Start now\.$/)
    });
  });

  describe('BC tool exclusion (AC2) — none of these may appear in any prompt', () => {
    const FORBIDDEN = ['sendWithBcAttach', 'bc-context-walker', 'Gmail MCP', 'ticketId', 'BC Vault'];

    const categories: Array<RequirementForPrompt['category']> = [
      'build', 'integrate', 'deploy', 'test', 'design', 'default',
    ];

    for (const cat of categories) {
      for (const term of FORBIDDEN) {
        it(`category=${cat} does not contain "${term}"`, () => {
          const prompt = generateStudentPrompt({ ...BASE, category: cat });
          expect(prompt).not.toContain(term);
        });
      }
    }
  });

  describe('null github_repo_url fallback (AC3)', () => {
    const noRepo = { ...BASE, github_repo_url: null };

    it('does not throw when github_repo_url is null', () => {
      expect(() => generateStudentPrompt(noRepo)).not.toThrow();
    });

    it('uses fallback text "your project GitHub repo"', () => {
      expect(generateStudentPrompt(noRepo)).toContain('your project GitHub repo');
    });

    it('still includes curriculum docs when repo is null', () => {
      const prompt = generateStudentPrompt(noRepo);
      expect(prompt).toContain('STUDENT_PLATFORM_BUILD_SPEC.md');
      expect(prompt).toContain('STUDENT_PLATFORM_STRATEGY.md');
    });

    it('includes the connect hint when repo is null', () => {
      expect(generateStudentPrompt(noRepo)).toContain('advisor.colaberry.ai');
    });
  });

  describe('boundary cases', () => {
    it('escapes double-quotes in requirement_text', () => {
      const req = { ...BASE, requirement_text: 'Build a "smart" API endpoint' };
      const prompt = generateStudentPrompt(req);
      expect(prompt).toContain('\\"smart\\"');
    });

    it('handles empty github_file_paths without crashing', () => {
      expect(() => generateStudentPrompt({ ...BASE, github_file_paths: [] })).not.toThrow();
    });

    it('handles null organization_name and project_name without crashing', () => {
      expect(() =>
        generateStudentPrompt({ ...BASE, organization_name: null, project_name: null }),
      ).not.toThrow();
    });

    it('generates a non-empty prompt for every category', () => {
      const categories: Array<RequirementForPrompt['category']> = [
        'build', 'integrate', 'deploy', 'test', 'design', 'default',
      ];
      for (const category of categories) {
        const prompt = generateStudentPrompt({ ...BASE, category });
        expect(prompt.length).toBeGreaterThan(200);
      }
    });

    it('handles very long requirement_text without truncating', () => {
      const longText = 'Implement '.repeat(100).trim();
      const prompt = generateStudentPrompt({ ...BASE, requirement_text: longText });
      expect(prompt.length).toBeGreaterThan(longText.length);
    });
  });

});
