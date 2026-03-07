const hookPrelude = "const { useState, useEffect, useMemo, useRef, useReducer, useLayoutEffect, useCallback } = React;";

export type PromptProfile = {
  isGame: boolean;
  isRealtimeGame: boolean;
  isBoardGame: boolean;
  isGridGame: boolean;
  is2048: boolean;
  isComplex: boolean;
};

export function profilePrompt(prompt: string): PromptProfile {
  const p = String(prompt || '').toLowerCase();

  const isGame = /\b(game|snake|tic[\s-]?tac[\s-]?toe|tetris|pong|breakout|flappy|maze|runner|platformer|arcade|shooter|racing|chess|checkers|2048|minesweeper|sudoku)\b/.test(p);
  const isRealtimeGame = /\b(snake|tetris|pong|breakout|flappy|runner|platformer|arcade|shooter|racing)\b/.test(p);
  const isBoardGame = /\b(tic[\s-]?tac[\s-]?toe|chess|checkers|connect\s*4|othello|reversi)\b/.test(p);
  const isGridGame = /\b(tic[\s-]?tac[\s-]?toe|chess|checkers|2048|minesweeper|sudoku|tetris)\b/.test(p);
  const is2048 = /\b2048\b/.test(p) || /\bsliding\s+tile\b/.test(p);

  const isComplex =
    isGame ||
    /(canvas|physics|animation|simulator|editor|drag|multiplayer|pathfinding|dashboard|data table|spreadsheet|chart)/.test(p);

  return {
    isGame,
    isRealtimeGame,
    isBoardGame,
    isGridGame,
    is2048,
    isComplex,
  };
}

export function normalizeGeneratedCode(raw: string): string {
  let code = String(raw || '');

  // Strip imports (not usable in the sandbox runtime).
  code = code.replace(/^\s*import[^;]+;?\s*$/gm, '');

  // Normalize common export default patterns into CJS.
  code = code.replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)\s*\(/g, 'module.exports.default = function $1(');
  code = code.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)\s*/g, 'module.exports.default = class $1 ');
  code = code.replace(/export\s+default\s+/g, 'module.exports.default = ');

  // Ensure hooks are available via destructuring.
  const hasHookDestructure = /\{\s*[^}]*(useState|useEffect|useMemo|useRef|useReducer|useLayoutEffect|useCallback)[^}]*\}\s*=\s*React/.test(code);
  const hasDirectHookBinding = /(const|let|var)\s+(useState|useEffect|useMemo|useRef|useReducer|useLayoutEffect|useCallback)\s*=\s*React\.\2/.test(code);
  if (!hasHookDestructure && !hasDirectHookBinding) {
    code = `${hookPrelude}\n${code}`;
  }

  // If no default export, set one from the first component-like binding.
  if (!/module\.exports\.default\s*=/.test(code)) {
    const match =
      code.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/) ||
      code.match(/class\s+([A-Z][A-Za-z0-9_]*)\s+/) ||
      code.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\(|function|class)/);
    if (match?.[1]) code = `${code}\nmodule.exports.default = ${match[1]};`;
  }

  return code.trim();
}

export function extractCode(markdown: string): string {
  const fence = String(markdown || '').match(/```(?:tsx|jsx|javascript|typescript)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  return String(markdown || '').trim();
}

export function isComplexPrompt(prompt: string): boolean {
  return profilePrompt(prompt).isComplex;
}
