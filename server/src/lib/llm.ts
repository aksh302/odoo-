import { config } from '../config';
import { AppError } from './errors';
import https from 'https';

export class AiUnavailableError extends AppError {
  constructor(message = 'AI service is temporarily unavailable') {
    super('AI_UNAVAILABLE', 503, message);
  }
}

/**
 * Perform an HTTP request with timeout.
 */
function makeHttpRequest(
  url: string,
  options: https.RequestOptions,
  bodyData?: string,
  timeoutMs = 8000,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 500, data }));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('AI_REQUEST_TIMEOUT'));
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

/**
 * Universal LLM caller: Gemini | Anthropic | OpenAI
 * Provider-agnostic wrapper with 1 automatic retry on timeout or 5xx.
 */
export async function queryLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!config.ai.enabled || !config.ai.apiKey) {
    throw new AiUnavailableError('AI features are disabled or API key is not configured');
  }

  const timeout = config.ai.timeoutMs || 8000;
  let attempts = 0;

  while (attempts < 2) {
    attempts++;
    try {
      if (config.ai.provider === 'openai') {
        const body = JSON.stringify({
          model: config.ai.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        });

        const res = await makeHttpRequest(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.ai.apiKey}`,
            },
          },
          body,
          timeout,
        );

        if (res.status >= 200 && res.status < 300) {
          const parsed = JSON.parse(res.data);
          return parsed.choices[0]?.message?.content || '';
        }
      } else if (config.ai.provider === 'anthropic') {
        const body = JSON.stringify({
          model: config.ai.model || 'claude-3-haiku-20240307',
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 1024,
        });

        const res = await makeHttpRequest(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.ai.apiKey,
              'anthropic-version': '2023-06-01',
            },
          },
          body,
          timeout,
        );

        if (res.status >= 200 && res.status < 300) {
          const parsed = JSON.parse(res.data);
          return parsed.content[0]?.text || '';
        }
      } else {
        // Default: Gemini API
        const model = config.ai.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.ai.apiKey}`;
        const body = JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2 },
        });

        const res = await makeHttpRequest(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          body,
          timeout,
        );

        if (res.status >= 200 && res.status < 300) {
          const parsed = JSON.parse(res.data);
          return parsed.candidates[0]?.content?.parts[0]?.text || '';
        }
      }
    } catch (err: any) {
      if (attempts >= 2) {
        throw new AiUnavailableError(`LLM error after retry: ${err.message}`);
      }
    }
  }

  throw new AiUnavailableError('Failed to get response from AI provider');
}

/**
 * Generate structured JSON from LLM matching schema.
 */
export async function generateJson<T>(
  systemPrompt: string,
  userPrompt: string,
  validateFn?: (obj: any) => T,
): Promise<T> {
  const jsonSysPrompt = `${systemPrompt}\nIMPORTANT: You must respond ONLY with a single valid JSON object. No markdown backticks, no code fence, no additional prose.`;
  const rawText = await queryLlm(jsonSysPrompt, userPrompt);

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/, '');
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.replace(/\s*```$/, '');

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new AiUnavailableError('LLM did not return valid JSON');
  }

  if (validateFn) {
    return validateFn(parsed);
  }
  return parsed as T;
}

/**
 * Generate plain text.
 */
export async function generateText(systemPrompt: string, userPrompt: string): Promise<string> {
  return queryLlm(systemPrompt, userPrompt);
}
