import { createHash } from 'node:crypto';
import NodeCache from 'node-cache';

const OPENAI_CHAT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_OPENAI_CACHE_TTL_SECONDS = 60 * 60;
const DEFAULT_OPENAI_MAX_RETRIES = 2;
const DEFAULT_OPENAI_TIMEOUT_MS = 25_000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 3_000;
const DEFAULT_OPENAI_MAX_INPUT_CHARS = 20_000;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const OPENAI_CACHE_ENABLED = process.env.OPENAI_CACHE_ENABLED !== 'false';
const OPENAI_CACHE_TTL_SECONDS = Math.floor(clampNumber(
  Number(process.env.OPENAI_CACHE_TTL_SECONDS || DEFAULT_OPENAI_CACHE_TTL_SECONDS),
  60,
  24 * 60 * 60,
  DEFAULT_OPENAI_CACHE_TTL_SECONDS
));
const OPENAI_MAX_RETRIES = Math.floor(clampNumber(
  Number(process.env.OPENAI_MAX_RETRIES || DEFAULT_OPENAI_MAX_RETRIES),
  0,
  3,
  DEFAULT_OPENAI_MAX_RETRIES
));
const OPENAI_TIMEOUT_MS = Math.floor(clampNumber(
  Number(process.env.OPENAI_TIMEOUT_MS || DEFAULT_OPENAI_TIMEOUT_MS),
  3_000,
  45_000,
  DEFAULT_OPENAI_TIMEOUT_MS
));
const OPENAI_MAX_OUTPUT_TOKENS = Math.floor(clampNumber(
  Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || DEFAULT_OPENAI_MAX_OUTPUT_TOKENS),
  256,
  4_096,
  DEFAULT_OPENAI_MAX_OUTPUT_TOKENS
));
const OPENAI_MAX_INPUT_CHARS = Math.floor(clampNumber(
  Number(process.env.OPENAI_MAX_INPUT_CHARS || DEFAULT_OPENAI_MAX_INPUT_CHARS),
  2_000,
  30_000,
  DEFAULT_OPENAI_MAX_INPUT_CHARS
));

type ChatMsg = { role: 'system'|'user'|'assistant'; content: string };

type GlobalWithCache = typeof globalThis & {
  __adaptOpenAIChatCache?: NodeCache;
};

const cacheGlobal = globalThis as GlobalWithCache;
const chatCache = cacheGlobal.__adaptOpenAIChatCache ?? new NodeCache({
  stdTTL: OPENAI_CACHE_TTL_SECONDS,
  useClones: false
});
if (!cacheGlobal.__adaptOpenAIChatCache) {
  cacheGlobal.__adaptOpenAIChatCache = chatCache;
}

const retriableStatus = new Set([408, 409, 429, 500, 502, 503, 504]);

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openaiChat(model: string, messages: ChatMsg[], temperature = 0.2, maxTokens = 1400) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  const endpoint = process.env.OPENAI_CHAT_API_URL || OPENAI_CHAT_API_URL;
  const safeTemperature = clampNumber(temperature, 0, 1, 0.2);
  const safeMaxTokens = Math.floor(clampNumber(maxTokens, 64, OPENAI_MAX_OUTPUT_TOKENS, 1400));

  let remainingChars = OPENAI_MAX_INPUT_CHARS;
  const safeMessages = messages.map((msg) => {
    const raw = String(msg?.content || '');
    const budget = Math.max(0, remainingChars);
    const content = raw.length > budget ? raw.slice(0, budget) : raw;
    remainingChars -= content.length;
    return {
      role: msg.role,
      content
    };
  }).filter((m) => m.content.length > 0);

  if (safeMessages.length === 0) throw new Error('OpenAI error: empty message payload');

  const payload = {
    model,
    messages: safeMessages,
    temperature: safeTemperature,
    max_tokens: safeMaxTokens,
    stream: false
  };
  const cacheKey = createHash('sha256').update(JSON.stringify({ endpoint, ...payload })).digest('hex');

  if (OPENAI_CACHE_ENABLED) {
    const cached = chatCache.get<string>(cacheKey);
    if (typeof cached === 'string' && cached.length > 0) return cached;
  }

  let lastError = 'Unknown OpenAI error';

  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastError = `OpenAI error: ${res.status} ${text || res.statusText}`;
        const shouldRetry = retriableStatus.has(res.status) && attempt < OPENAI_MAX_RETRIES;
        if (shouldRetry) {
          const backoffMs = 250 * (2 ** attempt) + Math.floor(Math.random() * 150);
          await wait(backoffMs);
          continue;
        }
        throw new Error(lastError);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new Error('OpenAI error: invalid JSON response');
      }

      type OpenAIResponse = { choices?: Array<{ message?: { content?: string } }> };
      const data = json as OpenAIResponse;
      const content = String(data?.choices?.[0]?.message?.content ?? '');
      if (!content) throw new Error('OpenAI error: empty completion content');

      if (OPENAI_CACHE_ENABLED) chatCache.set(cacheKey, content);
      return content;
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      const isAbort = msg.includes('aborted') || msg.includes('AbortError');
      if (attempt < OPENAI_MAX_RETRIES && isAbort) {
        const backoffMs = 250 * (2 ** attempt) + Math.floor(Math.random() * 150);
        await wait(backoffMs);
        continue;
      }
      if (attempt >= OPENAI_MAX_RETRIES) break;
      // For transient network errors without status code.
      if (/fetch failed|network|timeout/i.test(msg)) {
        const backoffMs = 250 * (2 ** attempt) + Math.floor(Math.random() * 150);
        await wait(backoffMs);
        continue;
      }
      break;
    }
  }

  throw new Error(lastError);
}
