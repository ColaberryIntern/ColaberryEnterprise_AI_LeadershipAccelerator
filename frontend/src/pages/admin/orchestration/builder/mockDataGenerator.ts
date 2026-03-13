/**
 * Deterministic mock V2 content generator.
 * Produces plausible concept_snapshot, ai_strategy, prompt_template, implementation_task,
 * knowledge_checks, and reflection_questions from mini-section configuration.
 * No LLM calls — pure data transformation.
 */

interface MiniSectionInput {
  id: string;
  mini_section_type: string;
  title: string;
  description: string;
  mini_section_order: number;
  associated_skill_ids?: string[];
  associated_variable_keys?: string[];
  creates_variable_keys?: string[];
  creates_artifact_ids?: string[];
  knowledge_check_config?: { enabled: boolean; question_count: number; pass_score: number } | null;
}

export interface MockV2Content {
  concept_snapshot: {
    title: string;
    definition: string;
    why_it_matters: string;
    visual_metaphor: string;
  } | null;
  ai_strategy: {
    description: string;
    when_to_use_ai: string[];
    human_responsibilities: string[];
    suggested_prompt: string;
  } | null;
  prompt_template: {
    template: string;
    placeholders: { name: string; description: string; example: string }[];
    expected_output_shape: string;
    variables: string[];
    example_filled: string;
    iteration_tips: string;
  } | null;
  implementation_task: {
    title: string;
    description: string;
    requirements: string[];
    deliverable: string;
    estimated_minutes: number;
    getting_started: string[];
    tools?: { name: string; url: string; is_free: boolean }[];
    evidence_requirements?: { name: string; description: string; format: string }[];
    required_artifacts: { name: string; description: string; file_types: string[]; validation_criteria: string }[];
    scenario: string;
    steps: string[];
    evaluation_criteria: string;
  } | null;
  knowledge_checks: {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }[] | null;
  reflection_questions: {
    question: string;
    prompt_for_deeper_thinking: string;
    context: string;
  }[] | null;
}

const INDUSTRY_EXAMPLES = ['healthcare', 'retail', 'financial services', 'manufacturing', 'technology'];

function titleToSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function generateConceptSnapshot(ms: MiniSectionInput, lessonTitle: string): MockV2Content['concept_snapshot'] {
  return {
    title: ms.title || lessonTitle,
    definition: `${ms.title} is a foundational concept in AI-driven enterprise leadership that enables executives to ${ms.description || 'evaluate and implement AI strategies effectively'}.`,
    why_it_matters: `Understanding ${ms.title.toLowerCase()} is critical for leaders navigating digital transformation. Organizations that master this concept see measurably better outcomes in their AI initiatives.`,
    visual_metaphor: `Think of ${ms.title.toLowerCase()} like a compass for AI decision-making — it doesn't make the journey for you, but it ensures every step moves toward your strategic destination.`,
  };
}

function generateAIStrategy(ms: MiniSectionInput, lessonTitle: string): MockV2Content['ai_strategy'] {
  const vars = ms.associated_variable_keys || [];
  return {
    description: ms.description || `This strategy framework helps leaders evaluate when and how to deploy AI for ${lessonTitle.toLowerCase()}.`,
    when_to_use_ai: [
      'Pattern recognition across large datasets exceeds human capacity',
      'Repetitive analysis tasks consume significant executive time',
      `${lessonTitle}-related decisions require real-time data synthesis`,
      'Cross-functional insights are needed but siloed across departments',
    ],
    human_responsibilities: [
      'Final strategic decision-making and ethical oversight',
      'Stakeholder relationship management and change leadership',
      'Defining success criteria and organizational constraints',
      vars.length > 0 ? `Validating AI outputs against ${vars.join(', ')} context` : 'Validating AI outputs against business context',
    ],
    suggested_prompt: `Analyze our organization's readiness for AI implementation in ${lessonTitle.toLowerCase()}. Consider our current capabilities, resource constraints, and strategic priorities. Recommend a phased approach with clear milestones.`,
  };
}

function generatePromptTemplate(ms: MiniSectionInput, lessonTitle: string): MockV2Content['prompt_template'] {
  const createsVars = ms.creates_variable_keys || [];
  const usesVars = ms.associated_variable_keys || [];
  const placeholders = [
    { name: 'company_name', description: 'Your organization name', example: 'Acme Corp' },
    { name: 'industry', description: 'Your industry sector', example: 'Healthcare' },
    { name: 'role', description: 'Your executive role', example: 'VP of Operations' },
    ...usesVars.map(v => ({ name: v, description: `Value from ${v}`, example: `[Your ${v.replace(/_/g, ' ')}]` })),
  ];

  const templateLines = [
    `You are an AI strategy advisor helping a {{role}} at {{company_name}} in the {{industry}} industry.`,
    '',
    `## Context: ${lessonTitle}`,
    ms.description || `Analyze and provide recommendations for ${ms.title.toLowerCase()}.`,
    '',
    ...usesVars.map(v => `- ${v.replace(/_/g, ' ')}: {{${v}}}`),
    '',
    '## Required Output',
    createsVars.length > 0
      ? `Provide structured analysis that produces: ${createsVars.join(', ')}`
      : 'Provide a structured analysis with actionable recommendations.',
    '',
    '## Format',
    'Respond in clear sections with headers. Include specific, measurable recommendations.',
  ];

  return {
    template: templateLines.join('\n'),
    placeholders,
    expected_output_shape: createsVars.length > 0
      ? `JSON object with keys: ${createsVars.join(', ')}`
      : 'Structured markdown with sections: Analysis, Recommendations, Next Steps',
    variables: usesVars,
    example_filled: templateLines.join('\n')
      .replace('{{company_name}}', 'Acme Corp')
      .replace('{{industry}}', 'Healthcare')
      .replace('{{role}}', 'VP of Operations'),
    iteration_tips: 'Refine by adding specific constraints, timelines, or budget parameters. Try different industry contexts to see how recommendations shift.',
  };
}

function generateImplementationTask(ms: MiniSectionInput, lessonTitle: string, artifactMap?: Record<string, string>): MockV2Content['implementation_task'] {
  const createsArtifacts = ms.creates_artifact_ids || [];
  const artifactNames = createsArtifacts.map(id => artifactMap?.[id] || 'Deliverable');
  return {
    title: ms.title || `${lessonTitle} Implementation`,
    description: ms.description || `Apply the concepts from ${lessonTitle} to your organization's context and produce a deliverable artifact.`,
    requirements: [
      'Complete the concept review and AI strategy sections first',
      'Have access to your organization\'s current data and metrics',
      `Understand the key frameworks from ${lessonTitle}`,
      'Allocate focused time for analysis and artifact creation',
    ],
    deliverable: artifactNames.length > 0
      ? `Completed artifact(s): ${artifactNames.join(', ')}`
      : `A comprehensive analysis document applying ${ms.title} to your organization`,
    estimated_minutes: 45,
    getting_started: [
      'Review the prompt template output from the previous section',
      'Gather relevant organizational data and stakeholder input',
      'Use the provided framework to structure your analysis',
      'Draft your initial deliverable, then iterate using AI feedback',
    ],
    tools: [
      { name: 'Google Sheets', url: 'https://sheets.google.com', is_free: true },
      { name: 'Canva', url: 'https://canva.com', is_free: true },
    ],
    evidence_requirements: [
      { name: 'Strategy Document', description: 'PDF or DOCX with your analysis and recommendations', format: 'file' },
      { name: 'Execution Screenshot', description: 'Screenshot showing successful AI tool output', format: 'screenshot' },
    ],
    required_artifacts: createsArtifacts.map((id, i) => ({
      name: artifactNames[i] || `Artifact ${i + 1}`,
      description: `Deliverable artifact for ${ms.title}`,
      file_types: ['pdf', 'docx', 'pptx'],
      validation_criteria: 'Must include executive summary, analysis framework, and actionable recommendations',
    })),
    scenario: `You are a ${INDUSTRY_EXAMPLES[Math.floor(ms.mini_section_order) % INDUSTRY_EXAMPLES.length]} executive tasked with implementing ${lessonTitle.toLowerCase()} principles in your organization.`,
    steps: [
      'Analyze your current state using the provided framework',
      'Identify gaps between current and desired capabilities',
      'Develop a prioritized action plan with timeline',
      'Create the required deliverable artifact(s)',
      'Review and refine using AI-assisted analysis',
    ],
    evaluation_criteria: 'Specificity to your organization, actionability of recommendations, alignment with strategic goals, completeness of analysis',
  };
}

function generateKnowledgeChecks(ms: MiniSectionInput, lessonTitle: string): MockV2Content['knowledge_checks'] {
  const config = ms.knowledge_check_config;
  const count = config?.question_count || 3;
  const checks = [];

  const questionBank = [
    {
      question: `What is the primary purpose of ${ms.title.toLowerCase()} in an AI leadership context?`,
      options: [
        'To replace human decision-making entirely',
        `To provide a structured framework for evaluating ${lessonTitle.toLowerCase()} opportunities`,
        'To automate all operational processes',
        'To reduce headcount in the organization',
      ],
      correct_index: 1,
      explanation: `${ms.title} provides leaders with a structured approach to evaluate and implement AI initiatives, not to replace human judgment but to augment it with data-driven insights.`,
    },
    {
      question: `Which of the following best describes a leader's role when implementing ${lessonTitle.toLowerCase()}?`,
      options: [
        'Delegating all decisions to AI systems',
        'Focusing solely on technical implementation',
        'Providing strategic oversight while leveraging AI for analysis',
        'Avoiding AI adoption until the technology matures',
      ],
      correct_index: 2,
      explanation: 'Effective AI leadership requires strategic oversight — leaders should guide AI implementation while maintaining responsibility for ethical considerations, stakeholder management, and final decision-making.',
    },
    {
      question: `What is a key risk of implementing ${ms.title.toLowerCase()} without proper governance?`,
      options: [
        'Increased transparency in decision-making',
        'Better alignment with organizational goals',
        'Uncontrolled scope expansion and ethical blind spots',
        'Improved stakeholder communication',
      ],
      correct_index: 2,
      explanation: 'Without proper governance, AI initiatives can expand beyond their intended scope, create ethical issues, and fail to align with organizational values and strategic objectives.',
    },
    {
      question: `How should executives measure success when applying ${lessonTitle.toLowerCase()} principles?`,
      options: [
        'By the number of AI tools purchased',
        'By reduction in staff size',
        'Through defined KPIs aligned with strategic objectives',
        'By comparing to competitors\' AI spending',
      ],
      correct_index: 2,
      explanation: 'Success should be measured through clear KPIs that connect AI initiatives to strategic business outcomes, not through vanity metrics or competitive spending comparisons.',
    },
    {
      question: `What role do variables and contextual data play in ${ms.title.toLowerCase()}?`,
      options: [
        'They are optional and rarely needed',
        'They personalize the analysis to the specific organizational context',
        'They slow down the decision-making process',
        'They are only useful for technical teams',
      ],
      correct_index: 1,
      explanation: 'Contextual variables ensure that AI-driven analysis and recommendations are tailored to the specific organization, making outputs more relevant and actionable for leaders.',
    },
  ];

  for (let i = 0; i < Math.min(count, questionBank.length); i++) {
    checks.push(questionBank[i]);
  }

  return checks;
}

function generateReflectionQuestions(ms: MiniSectionInput, lessonTitle: string): MockV2Content['reflection_questions'] {
  return [
    {
      question: `How does ${ms.title.toLowerCase()} apply to your organization's current AI maturity level?`,
      prompt_for_deeper_thinking: 'Consider not just where your organization is today, but where it needs to be in 12-18 months. What gaps exist?',
      context: lessonTitle,
    },
    {
      question: 'What organizational barriers might prevent successful implementation, and how would you address them?',
      prompt_for_deeper_thinking: 'Think beyond technology — consider culture, skills, governance, and stakeholder alignment.',
      context: lessonTitle,
    },
  ];
}

/**
 * Generate complete mock V2 content from an array of mini-sections for a lesson.
 * Each mini-section type maps to a specific V2 content section.
 */
export function generateMockV2Content(miniSections: MiniSectionInput[], lessonTitle: string, artifactMap?: Record<string, string>): MockV2Content {
  const sorted = [...miniSections].sort((a, b) => a.mini_section_order - b.mini_section_order);

  const result: MockV2Content = {
    concept_snapshot: null,
    ai_strategy: null,
    prompt_template: null,
    implementation_task: null,
    knowledge_checks: null,
    reflection_questions: null,
  };

  for (const ms of sorted) {
    switch (ms.mini_section_type) {
      case 'executive_reality_check':
        result.concept_snapshot = generateConceptSnapshot(ms, lessonTitle);
        break;
      case 'ai_strategy':
        result.ai_strategy = generateAIStrategy(ms, lessonTitle);
        break;
      case 'prompt_template':
        result.prompt_template = generatePromptTemplate(ms, lessonTitle);
        break;
      case 'implementation_task':
        result.implementation_task = generateImplementationTask(ms, lessonTitle, artifactMap);
        break;
      case 'knowledge_check':
        result.knowledge_checks = generateKnowledgeChecks(ms, lessonTitle);
        result.reflection_questions = generateReflectionQuestions(ms, lessonTitle);
        break;
    }
  }

  return result;
}
