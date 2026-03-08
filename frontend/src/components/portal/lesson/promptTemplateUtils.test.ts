import {
  Placeholder,
  derivePlaceholders,
  buildAutoFillMap,
  getEffectiveValue,
  getEffectiveValues,
  buildFilledTemplate,
  extractKeywords,
  findQuestions,
  scoreMatch,
  tryInsertAfterQuestion,
} from './promptTemplateUtils';

describe('derivePlaceholders', () => {
  it('returns placeholders array when present', () => {
    const phs: Placeholder[] = [
      { name: 'company', description: 'Your company', example: 'Acme' },
    ];
    const result = derivePlaceholders({ template: 'test', placeholders: phs });
    expect(result).toEqual(phs);
  });

  it('converts legacy variables array to placeholders', () => {
    const result = derivePlaceholders({ template: 'test', variables: ['role', 'industry'] });
    expect(result).toEqual([
      { name: 'role', description: '', example: '' },
      { name: 'industry', description: '', example: '' },
    ]);
  });

  it('returns empty array when neither placeholders nor variables', () => {
    expect(derivePlaceholders({ template: 'test' })).toEqual([]);
  });
});

describe('buildAutoFillMap', () => {
  it('returns empty map for null profile', () => {
    expect(buildAutoFillMap(null)).toEqual({});
  });

  it('maps company_name to both company_name and company', () => {
    const map = buildAutoFillMap({ company_name: 'Colaberry' });
    expect(map.company_name).toBe('Colaberry');
    expect(map.company).toBe('Colaberry');
  });

  it('maps industry to both industry and sector', () => {
    const map = buildAutoFillMap({ industry: 'Education' });
    expect(map.industry).toBe('Education');
    expect(map.sector).toBe('Education');
  });

  it('maps role, goal, and identified_use_case', () => {
    const map = buildAutoFillMap({
      role: 'CTO',
      goal: 'Scale AI',
      identified_use_case: 'Customer support automation',
    });
    expect(map.role).toBe('CTO');
    expect(map.goal).toBe('Scale AI');
    expect(map.identified_use_case).toBe('Customer support automation');
    expect(map.use_case).toBe('Customer support automation');
  });

  it('includes personalization_context_json entries without overriding structured fields', () => {
    const map = buildAutoFillMap({
      company_name: 'Colaberry',
      personalization_context_json: {
        company_name: 'ShouldNotOverride',
        department: 'Engineering',
      },
    });
    expect(map.company_name).toBe('Colaberry');
    expect(map.department).toBe('Engineering');
  });
});

describe('getEffectiveValue', () => {
  it('prefers manual fill values over auto-fill', () => {
    const result = getEffectiveValue('company', { company: 'Manual Co' }, { company: 'Auto Co' });
    expect(result).toBe('Manual Co');
  });

  it('falls back to auto-fill map', () => {
    const result = getEffectiveValue('company', {}, { company: 'Auto Co' });
    expect(result).toBe('Auto Co');
  });

  it('falls back to lowercase key match', () => {
    const result = getEffectiveValue('Company', {}, { company: 'Auto Co' });
    expect(result).toBe('Auto Co');
  });

  it('returns empty string when nothing matches', () => {
    expect(getEffectiveValue('unknown', {}, {})).toBe('');
  });
});

describe('getEffectiveValues', () => {
  it('builds values for all placeholders', () => {
    const phs: Placeholder[] = [
      { name: 'company', description: '', example: '' },
      { name: 'role', description: '', example: '' },
    ];
    const result = getEffectiveValues(phs, { role: 'CTO' }, { company: 'Colaberry' });
    expect(result).toEqual({ company: 'Colaberry', role: 'CTO' });
  });
});

describe('extractKeywords', () => {
  it('removes stop words and short words', () => {
    const kws = extractKeywords('What is the specific operational challenge you are facing?');
    expect(kws).toContain('specific');
    expect(kws).toContain('operational');
    expect(kws).toContain('challenge');
    expect(kws).toContain('facing');
    expect(kws).not.toContain('is');
    expect(kws).not.toContain('the');
    expect(kws).not.toContain('you');
  });
});

describe('findQuestions', () => {
  it('finds questions ending with ?', () => {
    const qs = findQuestions('Hello. What is AI? How does it work? Great.');
    expect(qs).toHaveLength(2);
    expect(qs[0].question).toContain('What is AI?');
    expect(qs[1].question).toContain('How does it work?');
  });

  it('returns empty array for text with no questions', () => {
    expect(findQuestions('No questions here.')).toHaveLength(0);
  });
});

describe('scoreMatch', () => {
  it('scores keyword overlap between description and question', () => {
    const descKws = extractKeywords('specific operational challenge');
    const score = scoreMatch(descKws, 'What specific challenge are you currently facing in your operations?');
    expect(score).toBeGreaterThanOrEqual(2);
  });

  it('returns 0 for no overlap', () => {
    const descKws = extractKeywords('department focus');
    const score = scoreMatch(descKws, 'What is your favorite color?');
    expect(score).toBe(0);
  });
});

describe('tryInsertAfterQuestion', () => {
  it('inserts answer after matching question', () => {
    const template = 'Step 1: What challenge are you facing? Step 2: Done.';
    const result = tryInsertAfterQuestion(template, 'specific challenge facing', 'data silos', new Set());
    expect(result).not.toBeNull();
    expect(result!.result).toContain('What challenge are you facing?\nAnswer: data silos');
  });

  it('returns null when no questions match', () => {
    const template = 'No questions here, just instructions.';
    const result = tryInsertAfterQuestion(template, 'challenge facing', 'data silos', new Set());
    expect(result).toBeNull();
  });

  it('skips already-used question indices', () => {
    const template = 'What challenge? What department?';
    const used = new Set([0]); // First question already used
    const result = tryInsertAfterQuestion(template, 'department focus', 'Engineering', used);
    expect(result).not.toBeNull();
    expect(result!.matchIndex).toBe(1);
  });
});

describe('buildFilledTemplate', () => {
  const placeholders: Placeholder[] = [
    { name: 'company_name', description: 'Your company', example: 'Acme' },
    { name: 'specific_challenge', description: 'Key challenge', example: 'data silos' },
  ];

  describe('with {{markers}} in template', () => {
    it('replaces double-brace markers', () => {
      const template = 'Analyze AI readiness for {{company_name}} focusing on {{specific_challenge}}.';
      const result = buildFilledTemplate(template, placeholders, {
        company_name: 'Colaberry',
        specific_challenge: 'customer churn',
      });
      expect(result).toBe('Analyze AI readiness for Colaberry focusing on customer churn.');
    });

    it('replaces single-brace markers', () => {
      const template = 'Analyze AI readiness for {company_name} focusing on {specific_challenge}.';
      const result = buildFilledTemplate(template, placeholders, {
        company_name: 'Colaberry',
        specific_challenge: 'customer churn',
      });
      expect(result).toBe('Analyze AI readiness for Colaberry focusing on customer churn.');
    });

    it('replaces multiple occurrences of the same marker', () => {
      const template = '{{company_name}} needs help. {{company_name}} should act now.';
      const result = buildFilledTemplate(template, placeholders, {
        company_name: 'Colaberry',
        specific_challenge: '',
      });
      expect(result).toBe('Colaberry needs help. Colaberry should act now.');
    });

    it('leaves unfilled markers as-is', () => {
      const template = 'Analyze {{company_name}} with {{specific_challenge}}.';
      const result = buildFilledTemplate(template, placeholders, {
        company_name: 'Colaberry',
        specific_challenge: '',
      });
      expect(result).toContain('Colaberry');
      expect(result).toContain('{{specific_challenge}}');
    });
  });

  describe('without {{markers}} — inline answer insertion', () => {
    const realTemplate = `To evaluate the current state of AI at your company, please follow these steps:
1) What specific challenge are you currently facing in your operations?
2) Are you analyzing your whole company or a specific department?
3) What processes currently take up the most time and resources?
4) What are your desired outcomes from implementing AI solutions?
Based on your answers, generate a list of AI applications.`;

    const realPlaceholders: Placeholder[] = [
      { name: 'specific_challenge', description: 'What is the specific operational challenge you are facing?', example: 'data silos' },
      { name: 'department_focus', description: 'Which department is the primary focus for AI integration?', example: 'Operations' },
      { name: 'current_process', description: 'What current process consumes the most time?', example: 'manual reporting' },
      { name: 'desired_outcome', description: 'What outcome do you hope to achieve with AI?', example: 'faster reporting' },
    ];

    it('inserts answers inline after matching questions', () => {
      const result = buildFilledTemplate(realTemplate, realPlaceholders, {
        specific_challenge: 'Inefficient data processing',
        department_focus: 'Data Analysis Team',
        current_process: 'Manual reporting',
        desired_outcome: 'Faster report generation',
      });
      // Each answer should appear after its matching question
      expect(result).toContain('operations?\nAnswer: Inefficient data processing');
      expect(result).toContain('department?\nAnswer: Data Analysis Team');
      expect(result).toContain('resources?\nAnswer: Manual reporting');
      expect(result).toContain('solutions?\nAnswer: Faster report generation');
      // Original template text should still be present
      expect(result).toContain('Based on your answers');
    });

    it('all filled values appear somewhere in the output', () => {
      const result = buildFilledTemplate(realTemplate, realPlaceholders, {
        specific_challenge: 'Inefficient data processing',
        department_focus: 'Data Analysis Team',
        current_process: 'Manual reporting',
        desired_outcome: 'Faster report generation',
      });
      expect(result).toContain('Inefficient data processing');
      expect(result).toContain('Data Analysis Team');
      expect(result).toContain('Manual reporting');
      expect(result).toContain('Faster report generation');
    });

    it('puts unmatched values at the top as context', () => {
      const noQuestionTemplate = 'Please analyze AI readiness for the company. Consider all departments and processes.';
      const result = buildFilledTemplate(noQuestionTemplate, realPlaceholders, {
        specific_challenge: 'data silos',
        department_focus: '',
        current_process: '',
        desired_outcome: '',
      });
      expect(result).toContain('My context:');
      expect(result).toContain('data silos');
      expect(result).toContain(noQuestionTemplate);
    });

    it('does not modify template when no values are filled', () => {
      const result = buildFilledTemplate(realTemplate, realPlaceholders, {
        specific_challenge: '',
        department_focus: '',
        current_process: '',
        desired_outcome: '',
      });
      expect(result).toBe(realTemplate);
    });

    it('handles partial fills — some inline, some at top', () => {
      const partialTemplate = 'What challenge are you facing? Now describe your goals in detail.';
      const phs: Placeholder[] = [
        { name: 'challenge', description: 'specific challenge facing', example: '' },
        { name: 'timeline', description: 'implementation timeline', example: '' },
      ];
      const result = buildFilledTemplate(partialTemplate, phs, {
        challenge: 'data silos',
        timeline: '6 months',
      });
      // Challenge matches the question
      expect(result).toContain('facing?\nAnswer: data silos');
      // Timeline has no matching question, goes to context
      expect(result).toContain('implementation timeline: 6 months');
    });
  });

  describe('edge cases', () => {
    it('handles empty placeholders array', () => {
      const result = buildFilledTemplate('Just a prompt with no placeholders.', [], {});
      expect(result).toBe('Just a prompt with no placeholders.');
    });

    it('handles empty template', () => {
      const result = buildFilledTemplate('', placeholders, { company_name: 'Test' });
      expect(result).toContain('Test');
    });

    it('ensures all filled placeholder values appear in output with markers', () => {
      const manyPhs: Placeholder[] = [
        { name: 'company', description: 'Company', example: '' },
        { name: 'role', description: 'Role', example: '' },
        { name: 'industry', description: 'Industry', example: '' },
        { name: 'goal', description: 'Goal', example: '' },
      ];
      const values = {
        company: 'Colaberry',
        role: 'VP Engineering',
        industry: 'EdTech',
        goal: 'Automate grading',
      };

      const withMarkers = 'At {{company}}, {{role}} in {{industry}} wants to {{goal}}.';
      const result1 = buildFilledTemplate(withMarkers, manyPhs, values);
      expect(result1).toContain('Colaberry');
      expect(result1).toContain('VP Engineering');
      expect(result1).toContain('EdTech');
      expect(result1).toContain('Automate grading');
    });

    it('ensures all filled placeholder values appear in output without markers', () => {
      const manyPhs: Placeholder[] = [
        { name: 'company', description: 'Company name', example: '' },
        { name: 'role', description: 'Your role', example: '' },
        { name: 'industry', description: 'Industry sector', example: '' },
        { name: 'goal', description: 'Primary goal', example: '' },
      ];
      const values = {
        company: 'Colaberry',
        role: 'VP Engineering',
        industry: 'EdTech',
        goal: 'Automate grading',
      };
      const withoutMarkers = 'Tell me about AI strategy for my company.';
      const result2 = buildFilledTemplate(withoutMarkers, manyPhs, values);
      expect(result2).toContain('Colaberry');
      expect(result2).toContain('VP Engineering');
      expect(result2).toContain('EdTech');
      expect(result2).toContain('Automate grading');
    });
  });
});
