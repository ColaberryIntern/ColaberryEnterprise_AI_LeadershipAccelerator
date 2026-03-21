import { NextAction } from '../../models';
import { ActionContext } from './actionContextBuilder';

export interface CodeExample {
  path: string;
  language: string;
  code: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Generate Code Examples
// ---------------------------------------------------------------------------

export function generateCodeExamples(
  action: NextAction,
  context: ActionContext
): CodeExample[] {
  const lang = detectLanguage(context);
  const examples: CodeExample[] = [];

  switch (action.action_type) {
    case 'create_artifact':
      examples.push(generateArtifactTemplate(context, lang));
      break;

    case 'update_artifact':
      examples.push(generateUpdateTemplate(context, lang));
      break;

    case 'build_feature':
      examples.push(...generateFeatureTemplates(context, lang));
      break;

    case 'fix_issue':
      examples.push(generateFixTemplate(context, lang));
      break;

    default:
      examples.push(generateGenericTemplate(context, lang));
  }

  return examples;
}

// ---------------------------------------------------------------------------
// Language Detection
// ---------------------------------------------------------------------------

function detectLanguage(context: ActionContext): string {
  if (context.tech_stack.includes('TypeScript')) return 'typescript';
  if (context.tech_stack.includes('Python')) return 'python';
  if (context.tech_stack.includes('Go')) return 'go';
  if (context.tech_stack.includes('JavaScript')) return 'javascript';
  if (context.repo_language) return context.repo_language.toLowerCase();
  return 'typescript'; // default
}

// ---------------------------------------------------------------------------
// Template Generators
// ---------------------------------------------------------------------------

function generateArtifactTemplate(context: ActionContext, lang: string): CodeExample {
  if (lang === 'python') {
    return {
      path: 'docs/artifact_template.md',
      language: 'markdown',
      description: 'Artifact documentation template',
      code: `# Artifact: ${context.requirement_text.substring(0, 60) || 'New Artifact'}

## Overview
Describe the purpose and scope of this artifact.

## Requirements Addressed
- ${context.requirement_text || 'Requirement description'}

## Design Decisions
- Decision 1: ...
- Decision 2: ...

## Implementation Notes
- Technology: ${context.tech_stack.join(', ') || 'TBD'}
- Dependencies: ...

## Validation Criteria
- [ ] Requirement fully addressed
- [ ] Documentation complete
- [ ] Reviewed by stakeholder
`,
    };
  }

  return {
    path: 'docs/artifact_template.md',
    language: 'markdown',
    description: 'Artifact documentation template',
    code: `# Artifact: ${context.requirement_text.substring(0, 60) || 'New Artifact'}

## Overview
Describe the purpose and scope of this artifact.

## Requirements Addressed
- ${context.requirement_text || 'Requirement description'}

## Technical Approach
- Stack: ${context.tech_stack.join(', ') || 'TBD'}
- Architecture: ...

## Acceptance Criteria
- [ ] Requirement fulfilled
- [ ] Tests written
- [ ] Documentation updated
`,
  };
}

function generateUpdateTemplate(context: ActionContext, lang: string): CodeExample {
  return {
    path: context.files_suggested[0] || 'src/update.ts',
    language: lang,
    description: 'Update template for existing artifact',
    code: lang === 'typescript' || lang === 'javascript'
      ? `// Update existing implementation for: ${truncate(context.requirement_text, 60)}
// Related artifacts: ${context.related_artifacts.join(', ') || 'none'}

// TODO: Review existing implementation
// TODO: Identify gaps against requirement
// TODO: Add missing functionality

export function update() {
  // Implementation here
}
`
      : `# Update existing implementation for: ${truncate(context.requirement_text, 60)}
# Related artifacts: ${context.related_artifacts.join(', ') || 'none'}

# TODO: Review existing implementation
# TODO: Identify gaps against requirement
# TODO: Add missing functionality

def update():
    # Implementation here
    pass
`,
  };
}

function generateFeatureTemplates(context: ActionContext, lang: string): CodeExample[] {
  const examples: CodeExample[] = [];
  const mainFile = context.files_suggested[0] || (lang === 'python' ? 'src/feature.py' : 'src/feature.ts');

  if (lang === 'typescript' || lang === 'javascript') {
    examples.push({
      path: mainFile,
      language: lang,
      description: 'Feature implementation scaffold',
      code: `/**
 * Feature: ${truncate(context.requirement_text, 60)}
 * Stack: ${context.tech_stack.join(', ')}
 */

// TODO: Implement feature logic
export async function handleFeature(input: any): Promise<any> {
  // 1. Validate input
  if (!input) throw new Error('Input is required');

  // 2. Process
  const result = processInput(input);

  // 3. Return result
  return result;
}

function processInput(input: any): any {
  // Implementation here
  return input;
}
`,
    });

    if (context.tech_stack.includes('Express') || context.tech_stack.includes('Node.js')) {
      examples.push({
        path: mainFile.replace(/\.ts$/, 'Routes.ts'),
        language: lang,
        description: 'Express route scaffold',
        code: `import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: Implement endpoint
    res.json({ message: 'Feature endpoint' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
`,
      });
    }
  } else if (lang === 'python') {
    examples.push({
      path: mainFile,
      language: 'python',
      description: 'Feature implementation scaffold',
      code: `"""
Feature: ${truncate(context.requirement_text, 60)}
Stack: ${context.tech_stack.join(', ')}
"""

def handle_feature(input_data):
    """Process feature logic."""
    # 1. Validate input
    if not input_data:
        raise ValueError("Input is required")

    # 2. Process
    result = process_input(input_data)

    # 3. Return result
    return result

def process_input(input_data):
    """Implementation here."""
    return input_data
`,
    });
  }

  return examples;
}

function generateFixTemplate(context: ActionContext, lang: string): CodeExample {
  const mainFile = context.files_suggested[0] || 'src/fix.ts';
  return {
    path: mainFile,
    language: lang,
    description: 'Fix/completion guide',
    code: lang === 'typescript' || lang === 'javascript'
      ? `// Fix: ${truncate(context.requirement_text, 60)}
// Files to review: ${context.files_suggested.join(', ')}

// DIAGNOSTIC STEPS:
// 1. Check existing implementation in the files above
// 2. Compare against requirement specification
// 3. Identify missing logic or broken paths
// 4. Implement fix
// 5. Add test coverage for the fix

// TODO: Add implementation
`
      : `# Fix: ${truncate(context.requirement_text, 60)}
# Files to review: ${context.files_suggested.join(', ')}

# DIAGNOSTIC STEPS:
# 1. Check existing implementation in the files above
# 2. Compare against requirement specification
# 3. Identify missing logic or broken paths
# 4. Implement fix
# 5. Add test coverage for the fix

# TODO: Add implementation
`,
  };
}

function generateGenericTemplate(context: ActionContext, lang: string): CodeExample {
  return {
    path: 'src/implementation.ts',
    language: lang,
    description: 'Generic implementation template',
    code: `// Requirement: ${truncate(context.requirement_text, 80)}
// Stack: ${context.tech_stack.join(', ')}

// TODO: Implement
`,
  };
}

function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;
}
