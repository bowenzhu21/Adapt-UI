import { openaiChat } from '@/lib/groq';
import { extractCode, normalizeGeneratedCode } from '@/lib/component-sandbox';
import { assessComponentQualityForPrompt, validateComponentLocally } from '@/lib/component-validator';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Issue = { type: string; message: string };
type ReqBody = {
  code: string;
  issues?: Issue[];
  runtimeError?: string;
  prompt?: string;
};

const DEFAULT_DEBUG_MAX_CODE_CHARS = 12_000;
const DEFAULT_DEBUG_MAX_TOKENS = 1200;
const DEFAULT_DEBUG_GAME_MAX_TOKENS = 1650;
const DEFAULT_DEBUG_MAX_ISSUES = 12;
const DEFAULT_DEBUG_MAX_RUNTIME_ERROR_CHARS = 420;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const DEBUG_MAX_CODE_CHARS = Math.floor(clampNumber(
  Number(process.env.OPENAI_DEBUG_MAX_CODE_CHARS || DEFAULT_DEBUG_MAX_CODE_CHARS),
  3000,
  20000,
  DEFAULT_DEBUG_MAX_CODE_CHARS
));
const DEBUG_MAX_TOKENS = Math.floor(clampNumber(
  Number(process.env.OPENAI_DEBUG_MAX_TOKENS || DEFAULT_DEBUG_MAX_TOKENS),
  350,
  2400,
  DEFAULT_DEBUG_MAX_TOKENS
));
const DEBUG_MAX_ISSUES = Math.floor(clampNumber(
  Number(process.env.OPENAI_DEBUG_MAX_ISSUES || DEFAULT_DEBUG_MAX_ISSUES),
  3,
  20,
  DEFAULT_DEBUG_MAX_ISSUES
));
const DEBUG_MAX_RUNTIME_ERROR_CHARS = Math.floor(clampNumber(
  Number(process.env.OPENAI_DEBUG_MAX_RUNTIME_ERROR_CHARS || DEFAULT_DEBUG_MAX_RUNTIME_ERROR_CHARS),
  120,
  1200,
  DEFAULT_DEBUG_MAX_RUNTIME_ERROR_CHARS
));

function compactText(input: string, maxChars: number) {
  const src = String(input || '');
  if (src.length <= maxChars) return src;
  return `${src.slice(0, maxChars)}\n\n/* ...truncated ${src.length - maxChars} chars... */`;
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  for (const issue of issues) {
    const key = `${issue.type}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export async function POST(req: Request) {
  const { code, issues = [], runtimeError, prompt = '' } = (await req.json()) as ReqBody;
  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing code' }), { status: 400 });
  }
  const safeRuntimeError = runtimeError ? String(runtimeError).slice(0, DEBUG_MAX_RUNTIME_ERROR_CHARS) : undefined;

  const local = validateComponentLocally(code);
  const quality = assessComponentQualityForPrompt(code, String(prompt || ''));
  const mergedIssues = dedupeIssues([
    ...issues,
    ...local.issues.map((i) => ({ type: i.type, message: i.message })),
    ...quality.issues.map((i) => ({ type: i.type, message: i.message }))
  ]);
  const codeLower = `${String(code || '').toLowerCase()} ${String(prompt || '').toLowerCase()}`;
  const isSnakeFix = /\bsnake\b/.test(codeLower) || mergedIssues.some((i) => /snake/i.test(i.message));
  const isGameFix = isSnakeFix || /\b(game|tetris|pong|breakout|flappy|maze|runner|platformer)\b/.test(codeLower)
    || mergedIssues.some((i) => /\b(game|score|canvas|keyboard)\b/i.test(i.message));
  const debugMaxTokens = isGameFix
    ? Math.floor(clampNumber(
      Number(process.env.OPENAI_DEBUG_MAX_TOKENS_GAME || DEFAULT_DEBUG_GAME_MAX_TOKENS),
      700,
      2400,
      DEFAULT_DEBUG_GAME_MAX_TOKENS
    ))
    : DEBUG_MAX_TOKENS;
  const debugModel = isGameFix
    ? (process.env.OPENAI_DEBUG_MODEL_GAME || process.env.OPENAI_DEBUG_MODEL || 'gpt-4o')
    : (process.env.OPENAI_DEBUG_MODEL || 'gpt-4o-mini');

  // Avoid spending tokens when there is nothing to fix.
  if (!runtimeError && mergedIssues.length === 0) {
    return Response.json({ code: normalizeGeneratedCode(code), skipped: true });
  }

  const sys =
`Fix this self-contained React component module for sandbox execution:
new Function('React','module','exports','props', code)

Rules:
- No imports/require; Babel already handles JSX/TypeScript.
- React is global as "React" (UMD).
- Must end with: module.exports.default = <ComponentName>;
- No network or browser storage APIs.
- props.styles is a global CSS string, not an object or class map.
- Prefer deterministic data; use props.theme/data/shortcuts when provided, otherwise use local safe defaults.
- Preserve behavior and keep code reasonably compact.
- Keep visual cohesion with Adapt UI by using adapt-* helper classes for layout and controls.
- For game components, do not downgrade to placeholders; keep gameplay complete and visually clear.
- For snake components, keep/improve a canvas-based board and avoid giant per-cell DOM grids.
- For keyboard-driven games, ensure Arrow key controls work and include preventDefault for Arrow/Space keys.
- Ensure text/background contrast remains readable over bright backdrops (avoid pale-on-pale styling).
- Avoid flat gray/white container styling; prefer adapt-panel/adapt-btn/adapt-input surface language.
Output only fixed module code.`;

  const qualityHints = [
    isGameFix ? `Quality target: keep this as a polished, fully playable game with clear HUD (score/state) and proper restart flow. Current quality score: ${quality.score.toFixed(2)}.` : '',
    isSnakeFix ? 'Snake target: ensure canvas rendering, food spawn on empty cells, no 180-degree turns, collision handling, keyboard input reliability, and restart after game over.' : ''
  ].filter(Boolean).join('\n');

  const user = [
    prompt ? `Original prompt:\n${String(prompt).slice(0, 600)}` : '',
    `Original code:\n\n${compactText(code, DEBUG_MAX_CODE_CHARS)}`,
    mergedIssues.length ? `Validation issues:\n${mergedIssues.slice(0, DEBUG_MAX_ISSUES).map(i => `- [${i.type}] ${i.message}`).join('\n')}` : '',
    safeRuntimeError ? `Runtime error: ${safeRuntimeError}` : '',
    qualityHints
  ].filter(Boolean).join('\n\n');

  const content = await openaiChat(
    debugModel,
    [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ],
    0.1,
    debugMaxTokens
  );

  const fixed = normalizeGeneratedCode(extractCode(content));
  return Response.json({ code: fixed });
}
