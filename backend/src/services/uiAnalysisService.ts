/**
 * UI Analysis Service
 *
 * Analyzes frontend UI feedback and returns actionable suggestions
 * with ready-to-paste Claude Code prompts.
 */
import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface UIAnalysisResult {
  issues: Array<{ title: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  suggestions: Array<{ title: string; description: string; impact: string }>;
  prompt: string;  // Ready-to-paste Claude Code prompt
}

export async function analyzeUI(options: {
  processName: string;
  feedback: string;
  frontendFiles: string[];
  repoUrl?: string;
}): Promise<UIAnalysisResult> {
  const { processName, feedback, frontendFiles, repoUrl } = options;

  const fileList = frontendFiles.slice(0, 20).join('\n');

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: `You are a senior UI/UX engineer. Analyze user feedback about a frontend and return structured improvement suggestions. Respond with valid JSON only.`,
    }, {
      role: 'user',
      content: `Business process: "${processName}"

User feedback: "${feedback}"

Frontend files in repo:
${fileList || '(no frontend files detected)'}

Analyze the feedback and return:
{
  "issues": [{"title": "...", "description": "...", "severity": "low|medium|high"}],
  "suggestions": [{"title": "...", "description": "...", "impact": "..."}],
  "claude_prompt": "A detailed prompt for Claude Code to implement the improvements. Include specific file paths from the frontend files list. Start with: You are implementing UI improvements for the ${processName} business process."
}

Be specific and actionable. Reference actual files when possible.`,
    }],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

  return {
    issues: parsed.issues || [],
    suggestions: parsed.suggestions || [],
    prompt: parsed.claude_prompt || `Improve the frontend UI for "${processName}" based on this feedback: ${feedback}`,
  };
}
