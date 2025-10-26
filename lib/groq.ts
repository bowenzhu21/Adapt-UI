const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

type ChatMsg = { role: 'system'|'user'|'assistant'; content: string };

export async function groqChat(model: string, messages: ChatMsg[], temperature = 0.2) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

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

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Groq error: ${res.status} ${text || res.statusText}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('Groq error: invalid JSON response');
  }

  type GroqResponse = { choices?: Array<{ message?: { content?: string } }> };
  const data = json as GroqResponse;
  const content = data?.choices?.[0]?.message?.content ?? '';
  return String(content);
}