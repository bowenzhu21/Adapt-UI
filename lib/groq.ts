import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // Cache TTL: 5 minutes

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

type ChatMsg = { role: 'system'|'user'|'assistant'; content: string };

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function groqChat(model: string, messages: ChatMsg[], temperature = 0.2) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const cacheKey = JSON.stringify({ model, messages, temperature });
  const cachedResponse = cache.get<string>(cacheKey);
  if (cachedResponse) {
    console.log('Returning cached response');
    return cachedResponse;
  }

  let attempts = 0;
  const maxAttempts = 5;
  const baseDelay = 2000; // 2 seconds
  const maxRetryAfter = 60; // Cap retry-after at 60 seconds

  while (attempts < maxAttempts) {
    attempts += 1;
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false
      })
    });

    if (res.ok) {
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new Error('Groq error: invalid JSON response');
      }

      type GroqResponse = { choices?: Array<{ message?: { content?: string } }> };
      const data = json as GroqResponse;
      const content = data?.choices?.[0]?.message?.content ?? '';
      cache.set(cacheKey, content); // Cache the response
      return String(content);
    }

    if (res.status === 429) {
      const retryAfter = Math.min(parseInt(res.headers.get('Retry-After') || '0', 10), maxRetryAfter) * 1000;
      const waitTime = retryAfter || baseDelay * attempts;
      console.warn(`Rate limit hit. Retrying in ${waitTime / 1000}s...`);
      await delay(waitTime);
    } else {
      const text = await res.text().catch(() => '');
      throw new Error(`Groq error: ${res.status} ${text || res.statusText}`);
    }
  }

  throw new Error('Groq error: Max retry attempts reached');
}