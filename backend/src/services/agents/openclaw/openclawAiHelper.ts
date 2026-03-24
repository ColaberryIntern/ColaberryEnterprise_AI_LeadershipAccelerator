import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';

/**
 * Simple wrapper for generating text content via OpenAI.
 * Returns { body, tokens_used, model }.
 */
export async function generateContent(
  prompt: string,
  model: string = 'gpt-4o',
): Promise<{ body: string; tokens_used: number; model: string }> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client not configured');
  }

  const result = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.75,
  });

  const body = result.choices[0]?.message?.content || '';
  const tokensUsed = result.usage?.total_tokens || 0;

  return { body, tokens_used: tokensUsed, model };
}
