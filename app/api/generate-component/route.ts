import { openaiChat } from '@/lib/groq';
import { extractCode, isComplexPrompt, normalizeGeneratedCode, profilePrompt } from '@/lib/component-sandbox';
import { assessComponentQualityForPrompt, type ValidationIssue, validateComponentLocally } from '@/lib/component-validator';

export const runtime = 'nodejs';
export const maxDuration = 60;

type ReqBody = {
  prompt: string;
  mood?: { label: string; score: number };
  context?: Array<{ content: string }>;
};

type CandidateEvaluation = {
  code: string;
  issues: ValidationIssue[];
  qualityScore: number;
  valid: boolean;
};

type PipelineStep = {
  phase: 'generate' | 'repair';
  pass: number;
  model: string;
  issues: number;
  quality: number;
};

const DEFAULT_SIMPLE_MAX_TOKENS = 1400;
const DEFAULT_COMPLEX_MAX_TOKENS = 2800;
const DEFAULT_GAME_MAX_TOKENS = 3800;
const DEFAULT_MAX_PROMPT_CHARS = 900;
const DEFAULT_MAX_CONTEXT_ITEMS = 4;
const DEFAULT_MAX_CONTEXT_ITEM_CHARS = 240;
const DEFAULT_SERVER_REPAIR_PASSES = 1;
const DEFAULT_SERVER_REPAIR_PASSES_GAME = 2;
const DEFAULT_MIN_QUALITY_SCORE = 0.62;
const DEFAULT_MIN_GAME_QUALITY_SCORE = 0.74;
const DEFAULT_PLAN_MAX_TOKENS = 380;
const MAX_GENERATION_TOKENS_CAP = 4200;

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

function summarizeIssues(issues: ValidationIssue[], limit = 12): string {
  if (!issues.length) return '- No issues provided';
  return issues.slice(0, limit).map((issue) => `- [${issue.type}] ${issue.message}`).join('\n');
}

function evaluateCandidate(code: string, promptText: string, minQualityScore: number): CandidateEvaluation {
  const structural = validateComponentLocally(code);
  const quality = assessComponentQualityForPrompt(code, promptText);
  const issues = dedupeIssues([...structural.issues, ...quality.issues]);
  const valid = structural.valid && quality.score >= minQualityScore;
  return {
    code,
    issues,
    qualityScore: quality.score,
    valid,
  };
}

function isBetterCandidate(next: CandidateEvaluation, best: CandidateEvaluation | null): boolean {
  if (!best) return true;
  if (next.valid && !best.valid) return true;
  if (!next.valid && best.valid) return false;
  if (next.issues.length !== best.issues.length) return next.issues.length < best.issues.length;
  if (next.qualityScore !== best.qualityScore) return next.qualityScore > best.qualityScore;
  return next.code.length < best.code.length;
}

async function buildImplementationPlan(promptText: string, contextText: string): Promise<string> {
  const plannerModel = process.env.OPENAI_PLAN_MODEL || 'gpt-4o-mini';
  const plannerTokens = Math.floor(clampNumber(
    Number(process.env.OPENAI_PLAN_MAX_TOKENS || DEFAULT_PLAN_MAX_TOKENS),
    120,
    900,
    DEFAULT_PLAN_MAX_TOKENS
  ));

  const planSystem =
`You are a senior frontend engineer.\nReturn a compact implementation plan for one self-contained React sandbox component.\nOutput plain text only with sections:\n1) Core state model\n2) Rendering structure\n3) Input/interaction handling\n4) Edge cases/tests\nKeep it under 12 bullet points total.`;

  const planUser = [
    `Prompt: ${promptText}`,
    contextText ? `Context:\n${contextText}` : ''
  ].filter(Boolean).join('\n\n');

  const plan = await openaiChat(
    plannerModel,
    [
      { role: 'system', content: planSystem },
      { role: 'user', content: planUser }
    ],
    0.1,
    plannerTokens
  );

  return plan.trim().slice(0, 1800);
}

export async function POST(req: Request) {
  const body = (await req.json()) as ReqBody;
  const { prompt, mood, context } = body;

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), { status: 400 });
  }

  const maxPromptChars = Math.floor(clampNumber(
    Number(process.env.OPENAI_MAX_PROMPT_CHARS || DEFAULT_MAX_PROMPT_CHARS),
    200,
    3000,
    DEFAULT_MAX_PROMPT_CHARS
  ));
  const promptText = prompt.trim();
  if (promptText.length > maxPromptChars) {
    return new Response(
      JSON.stringify({ error: `Prompt is too long. Limit is ${maxPromptChars} characters.` }),
      { status: 400 }
    );
  }

  const maxContextItems = Math.floor(clampNumber(
    Number(process.env.OPENAI_MAX_CONTEXT_ITEMS || DEFAULT_MAX_CONTEXT_ITEMS),
    0,
    10,
    DEFAULT_MAX_CONTEXT_ITEMS
  ));
  const maxContextItemChars = Math.floor(clampNumber(
    Number(process.env.OPENAI_MAX_CONTEXT_ITEM_CHARS || DEFAULT_MAX_CONTEXT_ITEM_CHARS),
    40,
    1500,
    DEFAULT_MAX_CONTEXT_ITEM_CHARS
  ));
  const safeContext = (Array.isArray(context) ? context : [])
    .slice(0, maxContextItems)
    .map((item) => String(item?.content || '').trim())
    .filter(Boolean)
    .map((content) => ({ content: content.slice(0, maxContextItemChars) }));
  const contextText = safeContext.map((c) => `- ${c.content}`).join('\n');

  const safeMood = mood && typeof mood.label === 'string'
    ? {
      label: mood.label.trim().slice(0, 48),
      score: Number(clampNumber(Number(mood.score), 0, 10, 5).toFixed(1))
    }
    : undefined;

  const promptProfile = profilePrompt(promptText);
  const complexPrompt = isComplexPrompt(promptText);

  const simpleModel = process.env.OPENAI_GENERATION_MODEL || 'gpt-4o-mini';
  const complexModel = process.env.OPENAI_GENERATION_MODEL_COMPLEX || simpleModel;
  const gameModel = process.env.OPENAI_GENERATION_MODEL_GAME || process.env.OPENAI_GENERATION_MODEL_COMPLEX || process.env.OPENAI_GENERATION_MODEL || 'gpt-4o';
  const repairModel = promptProfile.isGame
    ? (process.env.OPENAI_REPAIR_MODEL_GAME || process.env.OPENAI_DEBUG_MODEL_GAME || gameModel)
    : (process.env.OPENAI_REPAIR_MODEL || process.env.OPENAI_DEBUG_MODEL || 'gpt-4o-mini');
  const generationModel = promptProfile.isGame ? gameModel : (complexPrompt ? complexModel : simpleModel);

  const complexMaxTokenBudget = promptProfile.isGame
    ? Number(process.env.OPENAI_GENERATION_MAX_TOKENS_GAME || DEFAULT_GAME_MAX_TOKENS)
    : Number(process.env.OPENAI_GENERATION_MAX_TOKENS_COMPLEX || DEFAULT_COMPLEX_MAX_TOKENS);
  const generationMaxTokens = Math.floor(complexPrompt
    ? clampNumber(
      complexMaxTokenBudget,
      promptProfile.isGame ? 1500 : 900,
      MAX_GENERATION_TOKENS_CAP,
      promptProfile.isGame ? DEFAULT_GAME_MAX_TOKENS : DEFAULT_COMPLEX_MAX_TOKENS
    )
    : clampNumber(
      Number(process.env.OPENAI_GENERATION_MAX_TOKENS || DEFAULT_SIMPLE_MAX_TOKENS),
      500,
      2200,
      DEFAULT_SIMPLE_MAX_TOKENS
    ));

  const maxServerRepairPasses = Math.floor(clampNumber(
    Number(
      promptProfile.isGame
        ? (process.env.OPENAI_SERVER_REPAIR_PASSES_GAME || DEFAULT_SERVER_REPAIR_PASSES_GAME)
        : (process.env.OPENAI_SERVER_REPAIR_PASSES || DEFAULT_SERVER_REPAIR_PASSES)
    ),
    0,
    3,
    promptProfile.isGame ? DEFAULT_SERVER_REPAIR_PASSES_GAME : DEFAULT_SERVER_REPAIR_PASSES
  ));

  const minQualityScore = clampNumber(
    Number(
      promptProfile.isGame
        ? (process.env.OPENAI_MIN_GAME_QUALITY_SCORE || DEFAULT_MIN_GAME_QUALITY_SCORE)
        : (process.env.OPENAI_MIN_QUALITY_SCORE || DEFAULT_MIN_QUALITY_SCORE)
    ),
    0.4,
    0.95,
    promptProfile.isGame ? DEFAULT_MIN_GAME_QUALITY_SCORE : DEFAULT_MIN_QUALITY_SCORE
  );

  const plannerEnabledRaw = process.env.OPENAI_GENERATION_ENABLE_PLANNER;
  const plannerEnabled = plannerEnabledRaw === undefined
    ? promptProfile.isGame
    : plannerEnabledRaw === 'true';

  const implementationPlan = plannerEnabled
    ? await buildImplementationPlan(promptText, contextText)
    : '';

  const generationSystem =
`You generate one self-contained React 18 + TypeScript component module for sandbox execution.

Execution:
new Function('React','module','exports','props', code)

Runtime:
- React is global as "React" (UMD), Babel handles JSX+TypeScript.
- Props may include: { title, styles, theme, data, shortcuts }.
- props.styles is a global CSS string already injected in the sandbox (not a style object).
- Global style helpers are available as class names:
  adapt-shell, adapt-panel, adapt-title, adapt-subtitle, adapt-row, adapt-grid, adapt-board,
  adapt-cell, adapt-btn, adapt-btn-ghost, adapt-input, adapt-pill, adapt-kbd.

Rules:
- Return ONLY module code (no markdown).
- No imports/require.
- End with: module.exports.default = <ComponentName>;
- No network or storage APIs.
- Use helper classes directly via className strings (e.g. className="adapt-panel"), never styles['...'] or styles.foo.
- Default layout should use adapt-shell + adapt-panel.
- Keep visuals cohesive with host Adapt UI glass style.
- Use deterministic logic and safe fallbacks for missing props.
- Style interactive states (hover/focus/active/disabled) with clear contrast.
- For game prompts, produce a fully playable implementation with complete rules, controls, score/HUD, restart flow, and cleanup for listeners/timers.
- Avoid placeholder UIs or fake boards with non-functional cells.
- Include basic accessibility labels/focus states.`;

  const gameRequirements = promptProfile.isGame
    ? [
      'Hard requirement: full game loop/turn loop with complete win/lose/draw logic as appropriate.',
      'Hard requirement: reliable controls (keyboard for keyboard-driven games).',
      'Hard requirement: clear HUD (status + score/progress) and restart/reset flow.'
    ].join('\n')
    : '';

  const promptSpecificRequirements = [
    /tic[\s-]?tac[\s-]?toe/i.test(promptText)
      ? 'For tic-tac-toe: model exactly 9 cells, proper winner lines, draw handling, and score tracking.'
      : '',
    /\b2048\b/i.test(promptText)
      ? 'For 2048: implement real 4x4 board state, one-merge-per-move behavior, random spawn of 2/4 on valid moves, score accumulation, and game-over detection when no moves remain.'
      : '',
    /\bsnake\b/i.test(promptText)
      ? 'For snake: include playable movement, food spawning, collision handling, and restart from game-over.'
      : ''
  ].filter(Boolean).join('\n');

  const baseUserPrompt = [
    `User request: ${promptText}`,
    safeMood ? `Mood: ${safeMood.label} (${safeMood.score}/10)` : '',
    contextText ? `Context:\n${contextText}` : '',
    implementationPlan ? `Implementation plan:\n${implementationPlan}` : '',
    gameRequirements,
    promptSpecificRequirements
  ].filter(Boolean).join('\n\n');

  const pipeline: PipelineStep[] = [];
  let best: CandidateEvaluation | null = null;
  let workingCode = '';

  const firstContent = await openaiChat(
    generationModel,
    [
      { role: 'system', content: generationSystem },
      { role: 'user', content: baseUserPrompt }
    ],
    0.14,
    generationMaxTokens
  );

  workingCode = normalizeGeneratedCode(extractCode(firstContent));

  for (let pass = 0; pass <= maxServerRepairPasses; pass += 1) {
    const evaluation = evaluateCandidate(workingCode, promptText, minQualityScore);
    pipeline.push({
      phase: pass === 0 ? 'generate' : 'repair',
      pass,
      model: pass === 0 ? generationModel : repairModel,
      issues: evaluation.issues.length,
      quality: evaluation.qualityScore,
    });

    if (isBetterCandidate(evaluation, best)) {
      best = evaluation;
    }

    if (evaluation.valid) {
      return Response.json({
        code: evaluation.code,
        description: 'Generated component',
        intent: promptProfile.isGame ? 'game-generated' : 'component-generated',
        localIssues: evaluation.issues,
        qualityScore: evaluation.qualityScore,
        pipeline,
      });
    }

    if (pass >= maxServerRepairPasses) break;

    const repairSystem =
`Repair this React sandbox module.
Rules:
- No imports/require.
- Must end with module.exports.default = <ComponentName>.
- Preserve intent from prompt and improve code quality.
- Keep it fully functional, not a placeholder.
- Return only module code.`;

    const repairUser = [
      `Original prompt: ${promptText}`,
      implementationPlan ? `Implementation plan:\n${implementationPlan}` : '',
      `Current code:\n\n${workingCode}`,
      `Detected issues:\n${summarizeIssues(evaluation.issues)}`,
      `Quality score target: >= ${minQualityScore.toFixed(2)} (current: ${evaluation.qualityScore.toFixed(2)})`,
      'Return a corrected full module implementation.'
    ].filter(Boolean).join('\n\n');

    const repairedContent = await openaiChat(
      repairModel,
      [
        { role: 'system', content: repairSystem },
        { role: 'user', content: repairUser }
      ],
      0.12,
      generationMaxTokens
    );

    const repairedCode = normalizeGeneratedCode(extractCode(repairedContent));

    if (!repairedCode.trim() || repairedCode.trim() === workingCode.trim()) {
      const retryUser = `${baseUserPrompt}\n\nPrevious attempt failed checks:\n${summarizeIssues(evaluation.issues)}\n\nGenerate a substantially improved implementation.`;
      const retryContent = await openaiChat(
        generationModel,
        [
          { role: 'system', content: generationSystem },
          { role: 'user', content: retryUser }
        ],
        0.2,
        generationMaxTokens
      );
      workingCode = normalizeGeneratedCode(extractCode(retryContent));
    } else {
      workingCode = repairedCode;
    }
  }

  const fallback = best ?? evaluateCandidate(workingCode, promptText, minQualityScore);

  return Response.json({
    code: fallback.code,
    description: 'Generated component',
    intent: promptProfile.isGame ? 'game-generated-fallback' : 'component-generated-fallback',
    localIssues: fallback.issues,
    qualityScore: fallback.qualityScore,
    pipeline,
    note: `Returned best candidate after pipeline attempts. Remaining issues: ${fallback.issues.length}.`,
  });
}
