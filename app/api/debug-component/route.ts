import { groqChat } from '@/lib/groq';

export const runtime = 'nodejs';

type Issue = { type: string; message: string };
type ReqBody = {
  code: string;
  issues?: Issue[];
  runtimeError?: string;
};

function extractCode(markdown: string) {
  const fence = markdown.match(/```(?:tsx|jsx|javascript)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return markdown.trim();
}

export async function POST(req: Request) {
  const { code, issues = [], runtimeError } = (await req.json()) as ReqBody;
  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400 });
  }

  const sys =
`You are a senior React engineer fixing a self-contained component module that runs under:
new Function('React','module','exports','props', code)

Hard rules:
- No imports.
- React is global as "React" (UMD).
- Hooks via: const { useState, useEffect, useMemo, useRef } = React;
- Must end with: module.exports.default = <ComponentName>;
- No network/localStorage/document/window.
- Keep the component reasonably small and deterministic.

You will ONLY output the fixed module code in one block.`;

  const user = [
    `Original code:\n\n${code}`,
    issues.length ? `Validator issues:\n${issues.map(i=>`- [${i.type}] ${i.message}`).join('\n')}` : '',
    runtimeError ? `Runtime error: ${runtimeError}` : ''
  ].filter(Boolean).join('\n\n');

  const content = await groqChat('llama-3.3-70b-versatile', [
    { role: 'system', content: sys },
    { role: 'user', content: user }
  ]);

  const fixed = extractCode(content);
  return Response.json({ code: fixed });
}
