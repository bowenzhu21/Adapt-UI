import { profilePrompt } from '@/lib/component-sandbox';

export type ValidationIssueType = 'security' | 'syntax' | 'react' | 'performance';

export type ValidationIssue = {
  type: ValidationIssueType;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export type QualityAssessment = {
  score: number;
  checks: number;
  passedChecks: number;
  issues: ValidationIssue[];
};

const MAX_CODE_SIZE_BYTES = 28_000;

function pushIssue(issues: ValidationIssue[], type: ValidationIssueType, message: string) {
  if (!issues.some((i) => i.type === type && i.message === message)) {
    issues.push({ type, message });
  }
}

export function validateComponentLocally(code: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const src = String(code || '');

  if (!src.trim()) {
    pushIssue(issues, 'syntax', 'Code is empty.');
    return { valid: false, issues };
  }

  if (src.length > MAX_CODE_SIZE_BYTES) {
    pushIssue(issues, 'performance', `Component is too large (${src.length} chars). Keep it under ${MAX_CODE_SIZE_BYTES}.`);
  }

  const hasCommonJsDefault = /module\.exports\.default\s*=/.test(src);
  const hasEsmDefault = /export\s+default\b/.test(src);
  if (!hasCommonJsDefault && !hasEsmDefault) {
    pushIssue(issues, 'syntax', 'Missing default export (module.exports.default = Component).');
  }

  if (/^\s*import\s/m.test(src)) {
    pushIssue(issues, 'syntax', 'Imports are not allowed; produce a self-contained module.');
  }
  if (/\brequire\s*\(/.test(src)) {
    pushIssue(issues, 'syntax', 'require() is not allowed; produce a self-contained module.');
  }

  if (/\bfetch\s*\(/.test(src) || /\bXMLHttpRequest\b/.test(src) || /\bWebSocket\b/.test(src)) {
    pushIssue(issues, 'security', 'Network access is disallowed in the sandbox.');
  }

  if (/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(src)) {
    pushIssue(issues, 'security', 'Browser storage APIs are disallowed in the sandbox.');
  }

  if (/\beval\s*\(/.test(src) || /\bnew Function\s*\(/.test(src)) {
    pushIssue(issues, 'security', 'Dynamic code execution (eval/new Function) is disallowed.');
  }

  const destructuresPropsStyles = /\{\s*[^}]*\bstyles\b[^}]*\}\s*=\s*(props|[\w$]+Props)\b/.test(src);
  const treatsStylesAsObject = /\bstyles\s*\[\s*['"][^'"]+['"]\s*\]/.test(src) || /\bstyles\.[A-Za-z_$][A-Za-z0-9_$]*/.test(src);
  if (destructuresPropsStyles && treatsStylesAsObject) {
    pushIssue(issues, 'react', 'Do not treat props.styles as an object. Use plain className strings like "adapt-panel".');
  }

  const looksLikeComponentUi = /<(?:div|section|article|main|button|input|textarea|canvas)\b/i.test(src);
  const usesAdaptShell = /\badapt-shell\b/.test(src);
  const usesAdaptPanel = /\badapt-panel\b/.test(src);
  if (looksLikeComponentUi && (!usesAdaptShell || !usesAdaptPanel)) {
    pushIssue(issues, 'react', 'Use adapt-shell and adapt-panel to keep generated UI cohesive with the host design system.');
  }

  const hasFlatLightContainer = /background(?:Color)?\s*:\s*['"](?:#fff|#ffffff|white|#f[0-9a-f]{5}|#e[0-9a-f]{5}|rgb\(\s*2[0-5]{2}\s*,\s*2[0-5]{2}\s*,\s*2[0-5]{2}\s*\))/i.test(src);
  if (hasFlatLightContainer) {
    pushIssue(issues, 'react', 'Avoid flat light container backgrounds; use adapt-* helper classes for visual cohesion.');
  }

  const looksLikeTicTacToe = /tic[\s-]?tac[\s-]?toe/i.test(src) || (/calculateWinner/.test(src) && /Array\s*\(\s*9\s*\)/.test(src));
  if (looksLikeTicTacToe) {
    const usesBoardGrid = /\badapt-board\b/.test(src) || /gridTemplateColumns\s*:\s*['"`]repeat\s*\(\s*3/i.test(src);
    const usesCellClass = /\badapt-cell\b/.test(src);
    if (!usesBoardGrid || !usesCellClass) {
      pushIssue(issues, 'react', 'Tic-tac-toe layouts must use a 3x3 board grid (adapt-board) and cell styling (adapt-cell).');
    }
  }

  const looksLikeSnake = /\bsnake\b/i.test(src) || (/food/i.test(src) && /direction/i.test(src) && /score/i.test(src));
  if (looksLikeSnake) {
    const usesCanvas = /<canvas\b/i.test(src)
      || /createElement\(\s*['"]canvas['"]\s*\)/i.test(src)
      || /getContext\(\s*['"]2d['"]\s*\)/i.test(src);
    const rendersLargeDomGrid = /Array\s*\(\s*(?:3\d\d|[4-9]\d\d|\d{4,})\s*\)/.test(src)
      && /map\s*\(/.test(src)
      && /<(?:div|button)\b/.test(src);
    const hasKeydownHandler = /addEventListener\(\s*['"]keydown['"]/.test(src) || /onKeyDown\s*=/.test(src);
    const hasDirectionalKeys = /ArrowUp|ArrowDown|ArrowLeft|ArrowRight|KeyW|KeyA|KeyS|KeyD/.test(src);
    const hasPreventDefault = /preventDefault\s*\(/.test(src);
    const hasRestart = /(restart|reset|play again)/i.test(src);

    if (!usesCanvas || rendersLargeDomGrid) {
      pushIssue(issues, 'react', 'Snake games should render the board with a <canvas> (avoid huge per-cell DOM grids).');
    }
    if (!hasKeydownHandler || !hasDirectionalKeys) {
      pushIssue(issues, 'react', 'Snake games must include working keyboard controls (Arrow keys at minimum).');
    }
    if (!hasPreventDefault && hasDirectionalKeys) {
      pushIssue(issues, 'react', 'Snake keyboard handlers should preventDefault for movement keys to avoid page scrolling.');
    }
    if (!hasRestart) {
      pushIssue(issues, 'react', 'Snake games should include a restart/reset control after game over.');
    }
  }

  if (/while\s*\(\s*true\s*\)/.test(src) || /for\s*\(\s*;\s*;\s*\)/.test(src)) {
    pushIssue(issues, 'performance', 'Potential infinite loop detected.');
  }

  return { valid: issues.length === 0, issues };
}

export function assessComponentQualityForPrompt(code: string, prompt: string): QualityAssessment {
  const issues: ValidationIssue[] = [];
  const src = String(code || '');
  const srcLower = src.toLowerCase();
  const profile = profilePrompt(prompt);

  let checks = 0;
  let passedChecks = 0;

  const check = (condition: boolean, message: string, type: ValidationIssueType = 'react') => {
    checks += 1;
    if (condition) {
      passedChecks += 1;
      return;
    }
    pushIssue(issues, type, message);
  };

  if (!profile.isGame) {
    const score = checks === 0 ? 1 : passedChecks / checks;
    return { score: Number(score.toFixed(3)), checks, passedChecks, issues };
  }

  check(/\b(score|points?)\b/i.test(src), 'Game should display or track score.');
  check(/\b(restart|reset|play again)\b/i.test(src), 'Game should include a restart/reset flow.');
  check(/addEventListener\(\s*['"]keydown['"]|onKeyDown\s*=/i.test(src), 'Game should include keyboard input handling.');
  check(/\b(game over|winner|draw|paused|next player|status)\b/i.test(src), 'Game should expose clear game state/status messaging.');

  if (profile.isRealtimeGame) {
    check(/\bsetInterval\b|\brequestAnimationFrame\b/i.test(src), 'Realtime games should include an explicit game loop.');
  }

  if (profile.isGridGame) {
    check(/\badapt-board\b|gridTemplateColumns|Array\s*\(\s*(9|16|25)\s*\)|\bgrid\b/i.test(src), 'Grid-style games should model and render a real board/grid.');
  }

  if (profile.isBoardGame) {
    check(/\badapt-cell\b|<button[^>]*>/i.test(src), 'Board games should render interactive cells/squares.');
  }

  if (profile.is2048) {
    check(/\b(4\s*\*\s*4|Array\s*\(\s*16\s*\)|gridSize\s*=\s*4|SIZE\s*=\s*4)\b/i.test(src), '2048 should model a 4x4 board.');
    check(/\b(merge|combine)\b/i.test(srcLower), '2048 should implement merge/combine logic.');
    check(/\b(spawn|new tile|random tile)\b/i.test(srcLower), '2048 should spawn a new tile after valid moves.');
    check(/\b(moveLeft|moveRight|moveUp|moveDown|ArrowLeft|ArrowRight|ArrowUp|ArrowDown)\b/i.test(src), '2048 should handle directional moves.');
    check(/\b(game over|no moves|hasmoves|canmove)\b/i.test(srcLower), '2048 should detect game-over when no moves remain.');
  }

  const score = checks === 0 ? 1 : passedChecks / checks;
  return {
    score: Number(score.toFixed(3)),
    checks,
    passedChecks,
    issues,
  };
}
