import { openaiChat } from '@/lib/groq';
import { assessComponentQualityForPrompt, validateComponentLocally, type ValidationIssue } from '@/lib/component-validator';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ReqBody = { code: string; prompt?: string };

const ENABLE_AI_VALIDATION = process.env.OPENAI_ENABLE_AI_VALIDATION === 'true';
const DEFAULT_VALIDATION_MAX_TOKENS = 450;
const DEFAULT_VALIDATION_CODE_CHARS = 4500;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.type}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export async function POST(req: Request) {
  const { code, prompt = '' } = (await req.json()) as ReqBody;
  if (!code || typeof code !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400 });
  }

  const localStructural = validateComponentLocally(code);
  const localQuality = assessComponentQualityForPrompt(code, String(prompt || ''));
  const local = {
    valid: localStructural.valid && localQuality.issues.length === 0,
    issues: dedupeIssues([...localStructural.issues, ...localQuality.issues]),
    qualityScore: localQuality.score
  };

  // Default mode: local-only to avoid spending model tokens on every request.
  // Enable model validation with OPENAI_ENABLE_AI_VALIDATION=true when needed.
  if (!ENABLE_AI_VALIDATION) {
    return Response.json({ valid: local.valid, issues: local.issues, qualityScore: local.qualityScore, mode: 'local' });
  }

  const sys =
`You validate React sandbox component code.
Rules:
- React is injected globally as "React"; DO NOT use import/require.
- TypeScript and JSX are allowed.
- No network/storage APIs.
- Must export default via module.exports.default = Component.
- Focus on runtime-breaking issues only.
Return JSON only:
{"valid": boolean, "issues":[{"type":"security|syntax|react|performance","message":"..."}]}`;

  const ai = await openaiChat(
    process.env.OPENAI_VALIDATION_MODEL || 'gpt-4o-mini',
    [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: [
          prompt ? `Prompt:\n${String(prompt).slice(0, 500)}` : '',
          'Code:',
          code.slice(
            0,
            Math.floor(clampNumber(
              Number(process.env.OPENAI_VALIDATION_MAX_CODE_CHARS || DEFAULT_VALIDATION_CODE_CHARS),
              1200,
              9000,
              DEFAULT_VALIDATION_CODE_CHARS
            ))
          )
        ].filter(Boolean).join('\n\n')
      }
    ],
    0.05,
    Math.floor(clampNumber(
      Number(process.env.OPENAI_VALIDATION_MAX_TOKENS || DEFAULT_VALIDATION_MAX_TOKENS),
      150,
      700,
      DEFAULT_VALIDATION_MAX_TOKENS
    ))
  );

  // Parse model response; if it fails, use local-only result.
  let parsed: { valid: boolean; issues?: Array<{type:string; message:string}> } | null = null;
  try {
    parsed = JSON.parse(ai);
  } catch {
    const fence = ai.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fence?.[1] ?? ai.match(/\{[\s\S]*\}/)?.[0];
    if (candidate) {
      try {
        parsed = JSON.parse(candidate);
      } catch {
        parsed = null;
      }
    }
  }

  const modelIssues = (parsed?.issues || [])
    .filter((i): i is ValidationIssue => Boolean(i?.type && i?.message))
    .map((i) => ({ type: i.type, message: i.message }));
  const issues = dedupeIssues([...local.issues, ...modelIssues]);

  const valid = issues.length === 0 && (parsed?.valid ?? true);

  return Response.json({ valid, issues, qualityScore: local.qualityScore, mode: 'ai+local' });
}
