import { openaiChat } from '@/lib/groq';
import { extractCode, getBuiltinComponentForPrompt, isComplexPrompt, normalizeGeneratedCode } from '@/lib/component-sandbox';
import { validateComponentLocally } from '@/lib/component-validator';

export const runtime = 'nodejs';

type ReqBody = {
  prompt: string;
  mood?: { label: string; score: number };
  context?: Array<{ content: string }>;
};

const DEFAULT_SIMPLE_MAX_TOKENS = 1400;
const DEFAULT_COMPLEX_MAX_TOKENS = 2400;
const DEFAULT_GAME_MAX_TOKENS = 3000;
const DEFAULT_MAX_PROMPT_CHARS = 900;
const DEFAULT_MAX_CONTEXT_ITEMS = 4;
const DEFAULT_MAX_CONTEXT_ITEM_CHARS = 240;
const MAX_GENERATION_TOKENS_CAP = 3200;

function clampNumber(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
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

  const safeMood = mood && typeof mood.label === 'string'
    ? {
      label: mood.label.trim().slice(0, 48),
      score: Number(clampNumber(Number(mood.score), 0, 10, 5).toFixed(1))
    }
    : undefined;

  const promptLower = promptText.toLowerCase();
  const isGamePrompt = /\b(game|snake|tetris|pong|breakout|flappy|maze|runner|platformer|arcade|shooter|racing)\b/.test(promptLower);
  const isSnakePrompt = /\bsnake\b/.test(promptLower);
  const isTicTacToePrompt = /tic[\s-]?tac[\s-]?toe/.test(promptLower);

  const builtinCode = getBuiltinComponentForPrompt(promptText);
  if (builtinCode) {
    const normalizedBuiltin = normalizeGeneratedCode(builtinCode);
    const localValidation = validateComponentLocally(normalizedBuiltin);
    return Response.json({
      code: normalizedBuiltin,
      description: 'Generated component',
      intent: 'builtin-snake',
      localIssues: localValidation.issues,
      note: 'Used built-in snake template for reliability and lower token cost.'
    });
  }

  const complexPrompt = isComplexPrompt(promptText);
  const generationModel = complexPrompt
    ? (process.env.OPENAI_GENERATION_MODEL_COMPLEX || process.env.OPENAI_GENERATION_MODEL || 'gpt-4o-mini')
    : (process.env.OPENAI_GENERATION_MODEL || 'gpt-4o-mini');
  const complexMaxTokenBudget = isGamePrompt
    ? Number(process.env.OPENAI_GENERATION_MAX_TOKENS_GAME || DEFAULT_GAME_MAX_TOKENS)
    : Number(process.env.OPENAI_GENERATION_MAX_TOKENS_COMPLEX || DEFAULT_COMPLEX_MAX_TOKENS);
  const generationMaxTokens = Math.floor(complexPrompt
    ? clampNumber(
      complexMaxTokenBudget,
      isGamePrompt ? 1200 : 800,
      MAX_GENERATION_TOKENS_CAP,
      isGamePrompt ? DEFAULT_GAME_MAX_TOKENS : DEFAULT_COMPLEX_MAX_TOKENS
    )
    : clampNumber(
      Number(process.env.OPENAI_GENERATION_MAX_TOKENS || DEFAULT_SIMPLE_MAX_TOKENS),
      500,
      2200,
      DEFAULT_SIMPLE_MAX_TOKENS
    ));

  const sys =
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
- Default layout should use adapt-shell + adapt-panel for a clean centered surface.
- Cohesion requirement: generated UI must look like the host Adapt UI glass style, using adapt-* classes for containers/controls instead of custom inline theme blocks.
- Use deterministic logic and safe fallbacks for missing props.
- Visual quality bar: clean, modern, and polished; avoid browser-default looking controls.
- Prefer a dark modern palette with rich contrast (deep navy/charcoal + vivid cyan/blue/purple accents), not flat gray UI.
- Never produce pale/low-contrast UI where primary gameplay elements are hard to see.
- Assume the sandbox may sit on a bright photographic backdrop; keep UI readable with strong contrast (no light text on light panels).
- Style all interactive UI states (hover/focus/active/disabled) with clear contrast.
- Keep code compact (80-260 lines) for simple prompts; for game prompts you may use up to ~650 lines when needed.
- For interactive games, prioritize complete gameplay loop and visual clarity over generic dashboard UI.
- Avoid hardcoded gray/white flat container palettes; rely on adapt-panel, adapt-btn, adapt-btn-ghost, adapt-input, adapt-pill for visual consistency.
- Game outputs should include: visible score/status HUD, restart flow, keyboard controls, and cleanup for timers/listeners.
- For keyboard-driven games, support Arrow keys and WASD where applicable.
- When handling movement keys, call preventDefault() for Arrow/Space keys to avoid page scrolling.
- For interactive games (snake/tic-tac-toe), use clear board/canvas layout, visible score/status, and keyboard controls with cleanup.
- Do not output placeholder game UIs with non-functional decorative cells.
- For board games, prefer adapt-board for the board container and adapt-cell for each square.
- For tic-tac-toe specifically, render EXACTLY 9 cells inside one adapt-board grid.
- For snake specifically, render gameplay on a <canvas> board (avoid hundreds of per-cell DOM nodes), start in a playable state (not immediate game-over), and expose clear restart controls.
- Prefer refs and component event handlers over direct global DOM mutation.
- Include basic accessibility labels/focus states.`;

  const gameQualityRequirement = isGamePrompt
    ? 'Hard requirement: Build a complete polished game with clear HUD (score + state), full controls, visible high-contrast gameplay elements, and keyboard support (Arrow + WASD where relevant).'
    : '';
  const snakeQualityRequirement = isSnakePrompt
    ? 'Hard requirement for snake: use a canvas board, prevent 180-degree turns, spawn food only in empty cells, handle wall/self collision, include restart after game over, and do not initialize in game-over state.'
    : '';

  const usrParts = [
    `User request: ${promptText}`,
    safeMood ? `Mood: ${safeMood.label} (${safeMood.score}/10)` : '',
    safeContext.length ? `Context:\n${safeContext.map(c=>`- ${c.content}`).join('\n')}` : '',
    gameQualityRequirement,
    snakeQualityRequirement,
    isTicTacToePrompt ? 'Hard requirement: Use className="adapt-board" for the board and className="adapt-cell" for each of the 9 squares.' : ''
  ].filter(Boolean).join('\n');

  const content = await openaiChat(
    generationModel,
    [
      { role: 'system', content: sys },
      { role: 'user', content: usrParts }
    ],
    0.15,
    generationMaxTokens
  );

  const code = normalizeGeneratedCode(extractCode(content));
  const localValidation = validateComponentLocally(code);

  const note = localValidation.valid
    ? undefined
    : `Local validation issues: ${localValidation.issues.map((i) => i.message).join(' | ')}`;

  return Response.json({
    code,
    description: 'Generated component',
    intent: 'unspecified',
    localIssues: localValidation.issues,
    note
  });
}
