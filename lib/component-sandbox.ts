const hookPrelude = "const { useState, useEffect, useMemo, useRef, useReducer, useLayoutEffect, useCallback } = React;";

const BUILTIN_SNAKE_COMPONENT = String.raw`const { useCallback, useEffect, useMemo, useRef, useState } = React;

function SnakeGame(props) {
  const title = props && props.title ? props.title : 'Snake Game';
  const GRID_SIZE = 24;
  const CELL_SIZE = 24;
  const BOARD_SIZE = GRID_SIZE * CELL_SIZE;
  const START_SPEED = 125;
  const MIN_SPEED = 72;
  const SPEED_STEP = 2;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tickMs, setTickMs] = useState(START_SPEED);
  const [boardFocused, setBoardFocused] = useState(false);
  const [food, setFood] = useState({ x: 14, y: 12 });
  const [snake, setSnake] = useState(function () {
    return [
      { x: 11, y: 12 },
      { x: 10, y: 12 },
      { x: 9, y: 12 }
    ];
  });

  const directionRef = useRef({ x: 1, y: 0 });
  const pendingDirectionRef = useRef({ x: 1, y: 0 });
  const snakeRef = useRef(snake);
  const foodRef = useRef(food);
  const gameOverRef = useRef(gameOver);
  const pausedRef = useRef(paused);

  useEffect(function () { snakeRef.current = snake; }, [snake]);
  useEffect(function () { foodRef.current = food; }, [food]);
  useEffect(function () { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(function () { pausedRef.current = paused; }, [paused]);

  const randomFood = useCallback(function (segments) {
    const occupied = new Set(segments.map(function (s) { return s.x + ',' + s.y; }));
    const free = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const key = x + ',' + y;
        if (!occupied.has(key)) free.push({ x: x, y: y });
      }
    }
    if (!free.length) return { x: 0, y: 0 };
    return free[Math.floor(Math.random() * free.length)];
  }, []);

  const restart = useCallback(function () {
    const baseSnake = [
      { x: 11, y: 12 },
      { x: 10, y: 12 },
      { x: 9, y: 12 }
    ];
    directionRef.current = { x: 1, y: 0 };
    pendingDirectionRef.current = { x: 1, y: 0 };
    setSnake(baseSnake);
    setFood(randomFood(baseSnake));
    setScore(0);
    setTickMs(START_SPEED);
    setGameOver(false);
    setPaused(false);
  }, [randomFood]);

  const draw = useCallback(function () {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
    gradient.addColorStop(0, '#0b1323');
    gradient.addColorStop(1, '#040811');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    ctx.strokeStyle = 'rgba(130, 165, 235, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID_SIZE; i += 1) {
      const p = i * CELL_SIZE + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, BOARD_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(BOARD_SIZE, p);
      ctx.stroke();
    }

    const segments = snakeRef.current;
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const segment = segments[i];
      const x = segment.x * CELL_SIZE;
      const y = segment.y * CELL_SIZE;
      const t = i / Math.max(segments.length - 1, 1);
      const hue = 132 + Math.round(t * 24);
      ctx.fillStyle = 'hsl(' + hue + ', 84%, ' + (56 - Math.round(t * 14)) + '%)';
      ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    const f = foodRef.current;
    const fx = f.x * CELL_SIZE;
    const fy = f.y * CELL_SIZE;
    ctx.fillStyle = '#ff5f74';
    ctx.fillRect(fx + 2, fy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.strokeStyle = 'rgba(255, 219, 226, 0.72)';
    ctx.strokeRect(fx + 2.5, fy + 2.5, CELL_SIZE - 5, CELL_SIZE - 5);
  }, []);

  useEffect(function () {
    draw();
  }, [snake, food, draw]);

  const step = useCallback(function () {
    if (gameOverRef.current || pausedRef.current) return;

    const nextDirection = pendingDirectionRef.current;
    directionRef.current = nextDirection;
    const dir = directionRef.current;
    const segments = snakeRef.current;
    const head = segments[0];
    const nextHead = { x: head.x + dir.x, y: head.y + dir.y };

    const hitWall =
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE;
    if (hitWall) {
      setGameOver(true);
      return;
    }

    const hitSelf = segments.some(function (seg) {
      return seg.x === nextHead.x && seg.y === nextHead.y;
    });
    if (hitSelf) {
      setGameOver(true);
      return;
    }

    const ate = nextHead.x === foodRef.current.x && nextHead.y === foodRef.current.y;
    const nextSegments = [nextHead].concat(segments);
    if (!ate) nextSegments.pop();

    setSnake(nextSegments);
    if (ate) {
      setScore(function (prev) {
        const next = prev + 1;
        setBest(function (b) { return next > b ? next : b; });
        return next;
      });
      setTickMs(function (prev) { return Math.max(MIN_SPEED, prev - SPEED_STEP); });
      setFood(randomFood(nextSegments));
    }
  }, [randomFood]);

  useEffect(function () {
    if (gameOver || paused) return;
    const id = window.setInterval(step, tickMs);
    return function () { window.clearInterval(id); };
  }, [step, tickMs, gameOver, paused]);

  useEffect(function () {
    const onKeyDown = function (event) {
      const key = event.key;
      const lower = key.toLowerCase();
      const isArrow =
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight';
      const isMove = isArrow || lower === 'w' || lower === 'a' || lower === 's' || lower === 'd';
      if (isArrow || key === ' ') event.preventDefault();

      if (lower === 'r') {
        restart();
        return;
      }
      if (lower === 'p' || key === ' ') {
        if (!gameOverRef.current) {
          setPaused(function (prev) { return !prev; });
        }
        return;
      }
      if (!isMove || gameOverRef.current) return;

      let next = directionRef.current;
      if (key === 'ArrowUp' || lower === 'w') next = { x: 0, y: -1 };
      if (key === 'ArrowDown' || lower === 's') next = { x: 0, y: 1 };
      if (key === 'ArrowLeft' || lower === 'a') next = { x: -1, y: 0 };
      if (key === 'ArrowRight' || lower === 'd') next = { x: 1, y: 0 };

      const current = directionRef.current;
      if (current.x + next.x === 0 && current.y + next.y === 0) return;
      pendingDirectionRef.current = next;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return function () {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [restart]);

  useEffect(function () {
    if (containerRef.current && typeof containerRef.current.focus === 'function') {
      containerRef.current.focus();
    }
  }, []);

  const statusText = useMemo(function () {
    if (gameOver) return 'Game Over';
    if (paused) return 'Paused';
    return 'Playing';
  }, [gameOver, paused]);

  return (
    <div className="adapt-shell">
      <div className="adapt-panel">
        <div className="adapt-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h1 className="adapt-title">{title}</h1>
          <span className="adapt-pill">{statusText}</span>
        </div>
        <div className="adapt-row" style={{ marginBottom: 12 }}>
          <span className="adapt-pill">Score: {score}</span>
          <span className="adapt-pill">Best: {best}</span>
          <span className="adapt-pill">Speed: {Math.round(1000 / tickMs)} FPS</span>
        </div>

        <div
          ref={containerRef}
          tabIndex={0}
          aria-label="Snake board"
          style={{
            width: BOARD_SIZE + 16,
            maxWidth: '100%',
            borderRadius: 18,
            padding: 8,
            border: '1px solid rgba(163, 195, 255, 0.42)',
            background: 'linear-gradient(160deg, rgba(8, 14, 28, 0.72), rgba(12, 20, 36, 0.56))',
            boxShadow: boardFocused ? '0 0 0 3px rgba(120, 182, 255, 0.34)' : 'none',
            outline: 'none'
          }}
          onFocus={function () { setBoardFocused(true); }}
          onBlur={function () { setBoardFocused(false); }}
          onPointerDown={function () {
            if (containerRef.current && typeof containerRef.current.focus === 'function') {
              containerRef.current.focus();
            }
          }}
        >
          <canvas
            ref={canvasRef}
            width={BOARD_SIZE}
            height={BOARD_SIZE}
            style={{
              width: '100%',
              maxWidth: BOARD_SIZE,
              aspectRatio: '1 / 1',
              borderRadius: 14,
              display: 'block'
            }}
          />
        </div>

        <div className="adapt-row" style={{ marginTop: 12 }}>
          <button className="adapt-btn" onClick={restart} aria-label="Restart game">Restart</button>
          <button
            className="adapt-btn-ghost"
            onClick={function () { if (!gameOver) setPaused(function (p) { return !p; }); }}
            aria-label={paused ? 'Resume game' : 'Pause game'}
            disabled={gameOver}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>

        <p className="adapt-subtitle" style={{ marginTop: 10 }}>
          Controls: Arrow keys or WASD to move, Space/P to pause, R to restart.
        </p>
      </div>
    </div>
  );
}

module.exports.default = SnakeGame;
`;

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
  const p = String(prompt || '').toLowerCase();
  return /(game|snake|tic[\s-]?tac[\s-]?toe|chess|tetris|canvas|physics|animation|simulator|editor|drag|multiplayer|pathfinding)/.test(p);
}

export function getBuiltinComponentForPrompt(prompt: string): string | null {
  const p = String(prompt || '').toLowerCase();
  if (/\bsnake\b/.test(p)) return BUILTIN_SNAKE_COMPONENT;
  return null;
}
