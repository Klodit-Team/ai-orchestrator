import axios, { AxiosError } from 'axios';

const GEMINI_URL = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as AxiosError)?.response?.status;
      if (code === 503 || code === 429) {
        lastErr = e;
        await new Promise(r => setTimeout(r, 1_000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function safeParseJson(text: string): unknown {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/s);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    return { raw: text };
  }
}

export async function generateJson(
  apiKey: string,
  system: string,
  user: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  const resp = await withRetry(() => axios.post(
    GEMINI_URL(apiKey),
    {
      contents: [{ role: 'user', parts: [{ text: user }] }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { responseMimeType: 'application/json' },
    },
    { timeout: timeoutMs },
  ));
  const text: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return safeParseJson(text);
}

export async function generateJsonWithVision(
  apiKey: string,
  system: string,
  prompt: string,
  imageBase64: string,
  mimeType: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  const resp = await withRetry(() => axios.post(
    GEMINI_URL(apiKey),
    {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      }],
      systemInstruction: { parts: [{ text: system }] },
      generationConfig: { responseMimeType: 'application/json' },
    },
    { timeout: timeoutMs },
  ));
  const text: string = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return safeParseJson(text);
}
