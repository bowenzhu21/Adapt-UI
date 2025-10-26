import { groqChat } from '@/lib/groq';

export const runtime = 'nodejs';

type ReqBody = { code: string };

export async function POST(req: Request) {
  const { code } = (await req.json()) as ReqBody;
  if (!code || typeof code !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400 });
  }

  // Cheap local heuristics (sandbox already isolates, but this keeps obvious mistakes down)
  const heuristics: string[] = [];
  const hasCommonJsDefault = /module\.exports\.default\s*=/.test(code);
  const hasEsmDefault = /export\s+default\b/.test(code);
  if (!hasCommonJsDefault && !hasEsmDefault) {
    heuristics.push('Missing default export (module.exports.default = Component).');
  }
  if (/fetch\s*\(/.test(code)) heuristics.push('Contains fetch(). Network calls are disallowed in the sandbox.');
  if (/\blocalStorage\b|\bsessionStorage\b/.test(code)) heuristics.push('Uses localStorage/sessionStorage, which is disallowed.');
  if (/\bdocument\b|\bwindow\b/.test(code)) heuristics.push('Direct document/window access found.');

  // Ask Groq-8B for a quick lint summary (no heavy fix here; fixer comes next step)
  const sys =
`You are a strict React code validator for a sandboxed environment.
Rules:
- React is injected globally as "React"; DO NOT require import statements.
- No network calls.
- No direct window/document/localStorage.
- Must export default via module.exports.default = Component.
- Only flag missing key props when elements are rendered via array iteration (not standalone buttons).
- Identify syntax/React issues likely to cause runtime errors.
Respond with a short JSON: {"valid": boolean, "issues": [{"type":"security|syntax|react|performance","message": "..."}]}. No extra text.`;

  const ai = await groqChat('llama-3.1-8b-instant', [
    { role: 'system', content: sys },
    { role: 'user', content: code.slice(0, 6000) } // keep payload reasonable
  ]);

  // Try to parse; if it fails, fall back to heuristics only
  let parsed: { valid: boolean; issues?: Array<{type:string; message:string}> } | null = null;
  try { parsed = JSON.parse(ai); } catch { parsed = null; }

  const issues = [
    ...(parsed?.issues || []),
    ...heuristics.map(m => ({ type: 'security', message: m }))
  ];

  const valid = (parsed?.valid ?? true) && issues.length === 0;

  return Response.json({ valid, issues });
}