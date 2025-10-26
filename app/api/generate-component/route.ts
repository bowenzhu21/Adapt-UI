import { groqChat } from '@/lib/groq';

export const runtime = 'nodejs';

type ReqBody = {
  prompt: string;
  mood?: { label: string; score: number };
  context?: Array<{ content: string }>;
};

function extractCode(markdown: string) {
  // Try to pull code from a fenced block first
  const fence = markdown.match(/```(?:tsx|jsx|javascript)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return markdown.trim();
}

export async function POST(req: Request) {
  const body = (await req.json()) as ReqBody;
  const { prompt, mood, context } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400 });
  }

  const sys = `You are an expert TypeScript UI generator.

Output ONLY a single self-contained TypeScript file that can be evaluated with:
new Function('React','module','exports','props', code)

Constraints:
- Assume React is available globally as "React" (UMD) inside a sandbox iframe.
- Do NOT import anything.
- Use "const { useState, useEffect, useMemo, useRef } = React;" for hooks.
- At the end, ensure there is "module.exports.default = <ComponentName>;".
- The component must render without needing network, localStorage, or document/window access.
- Keep it 80–200 lines when possible. Prefer inline styles or minimal Tailwind-like class strings (but no imports).
- For interactive components (e.g., games like Snake):
  - Implement a game loop using React hooks (e.g., useEffect with requestAnimationFrame).
  - Handle keyboard input for controlling the game.
  - Use state to manage the game board, snake position, and food.
  - Include collision detection and game-over logic.
  - Ensure smooth animations and responsive design.

Return ONLY the code in a single TypeScript file, nothing else.`;

  const usrParts = [
    `User request: ${prompt}`,
    mood ? `Mood: ${mood.label} (${mood.score}/10)` : '',
    context && context.length ? `Context:\n${context.map(c=>`- ${c.content}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');

  const content = await groqChat('llama-3.3-70b-versatile', [
    { role: 'system', content: sys },
    { role: 'user', content: usrParts }
  ]);

  const code = extractCode(content);

  // Basic guard: must export default
  if (!/module\.exports\.default\s*=/.test(code)) {
    return Response.json({ code, description: 'Generated component', intent: 'unspecified', note: 'No default export detected; validator will likely flag this.' });
  }

  return Response.json({ code, description: 'Generated component', intent: 'unspecified' });
}
