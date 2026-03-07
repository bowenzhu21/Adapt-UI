'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from '@/components/UI/Navbar';

type Issue = { type: string; message: string };

const MAX_AUTOFIX_ATTEMPTS = 4;
const MAX_PROMPT_CHARS = 900;
const SANDBOX_BASE_STYLES = `
  :root {
    --adapt-bg: #050a14;
    --adapt-surface: rgba(255, 255, 255, 0.16);
    --adapt-surface-soft: rgba(255, 255, 255, 0.1);
    --adapt-border: rgba(255, 255, 255, 0.36);
    --adapt-text: #0f172a;
    --adapt-muted: rgba(30, 41, 59, 0.82);
    --adapt-primary: #9ecbff;
    --adapt-accent: #f08cbd;
    --adapt-success: #10b981;
    --adapt-danger: #ff5f74;
    --adapt-radius: 18px;
    --adapt-shadow: 0 24px 48px rgba(3, 6, 14, 0.44);
  }

  * { box-sizing: border-box; }

  html, body, #root {
    margin: 0;
    width: 100%;
    min-height: 100%;
    background: transparent !important;
  }

  body {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: var(--adapt-text);
    background: transparent;
    line-height: 1.5;
  }

  #root {
    padding: 18px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: transparent !important;
  }

  .adapt-shell {
    width: 100%;
    max-width: none;
    margin: 0 auto;
  }

  .adapt-panel {
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(150deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.1) 58%, rgba(255, 255, 255, 0.16) 100%);
    border: 1px solid var(--adapt-border);
    border-radius: var(--adapt-radius);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.56),
      inset 0 -1px 0 rgba(255, 255, 255, 0.12),
      var(--adapt-shadow);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    padding: 18px;
  }

  .adapt-panel::before {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: inherit;
    pointer-events: none;
    background:
      linear-gradient(120deg, rgba(255, 255, 255, 0.44), rgba(255, 255, 255, 0) 34%),
      radial-gradient(130% 90% at 0% 100%, rgba(116, 179, 255, 0.18), transparent 52%);
    opacity: 0.82;
  }

  .adapt-title {
    margin: 0;
    font-size: clamp(1.25rem, 2.2vw, 1.8rem);
    line-height: 1.2;
    letter-spacing: -0.015em;
    color: var(--adapt-text);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.46);
  }

  .adapt-subtitle {
    margin: 8px 0 0;
    color: var(--adapt-muted);
    font-size: 0.95rem;
  }

  .adapt-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .adapt-grid {
    display: grid;
    gap: 12px;
  }

  .adapt-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    gap: 10px;
    width: min(340px, 100%);
    padding: 8px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    background: rgba(12, 18, 34, 0.44);
  }

  .adapt-cell {
    aspect-ratio: 1 / 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 700;
    border-radius: 14px;
    border: 1px solid rgba(171, 209, 255, 0.42);
    background: linear-gradient(156deg, rgba(125, 181, 255, 0.38), rgba(240, 140, 189, 0.24) 54%, rgba(14, 22, 44, 0.62));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.34),
      0 10px 18px rgba(3, 6, 14, 0.36);
    color: #0f1e3b;
  }

  .adapt-btn,
  .adapt-btn-ghost {
    appearance: none;
    border-radius: 12px;
    padding: 9px 14px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.14s ease, filter 0.14s ease, box-shadow 0.14s ease;
  }

  .adapt-btn {
    border: 1px solid rgba(255, 255, 255, 0.5);
    background:
      linear-gradient(128deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08)),
      linear-gradient(140deg, rgba(125, 181, 255, 0.8), rgba(240, 140, 189, 0.68));
    color: #0a1934;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 12px 24px rgba(2, 6, 14, 0.38);
    font-weight: 700;
  }

  .adapt-btn-ghost {
    border: 1px solid rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.16);
    color: #102143;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
    backdrop-filter: blur(12px) saturate(160%);
    -webkit-backdrop-filter: blur(12px) saturate(160%);
  }

  .adapt-btn:hover,
  .adapt-btn-ghost:hover {
    transform: translateY(-1px);
    filter: saturate(1.06) brightness(1.04);
  }

  .adapt-btn:active,
  .adapt-btn-ghost:active {
    transform: translateY(0);
  }

  .adapt-btn:focus-visible,
  .adapt-btn-ghost:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(164, 209, 255, 0.22);
  }

  .adapt-input {
    width: 100%;
    border: 1px solid rgba(182, 211, 255, 0.46);
    background: rgba(10, 16, 30, 0.56);
    color: var(--adapt-text);
    border-radius: 12px;
    padding: 10px 12px;
    font: inherit;
  }

  .adapt-input::placeholder {
    color: rgba(205, 218, 240, 0.74);
  }

  .adapt-input:focus-visible {
    outline: none;
    border-color: rgba(210, 230, 255, 0.84);
    background: rgba(11, 18, 33, 0.74);
    box-shadow: 0 0 0 3px rgba(120, 182, 255, 0.24);
  }

  .adapt-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    background: rgba(16, 28, 52, 0.64);
    color: #f2f7ff;
    border: 1px solid rgba(163, 195, 255, 0.38);
  }

  .adapt-kbd {
    display: inline-flex;
    align-items: center;
    border-radius: 8px;
    border: 1px solid rgba(163, 195, 255, 0.4);
    background: rgba(12, 18, 34, 0.62);
    color: #f4f8ff;
    font-size: 0.78rem;
    font-weight: 600;
    padding: 3px 8px;
    line-height: 1;
  }

  :where(h1, h2, h3) {
    margin: 0 0 10px;
    line-height: 1.2;
    letter-spacing: -0.015em;
    color: var(--adapt-text);
  }

  :where(p) {
    margin: 0;
    color: var(--adapt-muted);
  }

  :where(span, li, label, small, strong) {
    color: var(--adapt-text);
  }

  :where(button) {
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background:
      linear-gradient(128deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.08)),
      linear-gradient(140deg, rgba(125, 181, 255, 0.8), rgba(240, 140, 189, 0.68));
    color: #0a1934;
    border-radius: 12px;
    padding: 9px 14px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.14s ease, filter 0.14s ease, box-shadow 0.14s ease;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 12px 24px rgba(2, 6, 14, 0.38);
  }

  :where(button:hover) {
    transform: translateY(-1px);
    filter: saturate(1.06) brightness(1.04);
  }

  :where(button:active) {
    transform: translateY(0);
  }

  :where(button:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 3px rgba(164, 209, 255, 0.22);
  }

  :where(input, textarea, select) {
    width: 100%;
    border: 1px solid rgba(163, 195, 255, 0.42);
    background: rgba(8, 14, 28, 0.54);
    color: var(--adapt-text);
    border-radius: 12px;
    padding: 10px 12px;
    font: inherit;
  }

  :where(input, textarea, select)::placeholder {
    color: rgba(194, 212, 244, 0.7);
  }

  :where(input, textarea, select):focus-visible {
    outline: none;
    border-color: rgba(197, 221, 255, 0.82);
    box-shadow: 0 0 0 3px rgba(120, 182, 255, 0.34);
  }
`;

const safeJson = async (res: Response) => {
  try { return await res.json(); } catch { return null; }
};

export default function SandboxPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isAutoFixingRef = useRef(false);
  const lastRuntimeFingerprintRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');

  const postToSandbox = useCallback((code: string) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'render',
      payload: {
        code,
        props: {
          title: 'Sandbox Demo',
          styles: SANDBOX_BASE_STYLES,
          theme: {
            primary: '#9ecbff',
            accent: '#f08cbd',
            surface: 'rgba(255, 255, 255, 0.16)',
            muted: 'rgba(30, 41, 59, 0.82)',
            text: '#0f172a'
          },
          data: {
            metrics: [
              { label: 'Active users', value: 38210, delta: 6.2 },
              { label: 'Conversion', value: 4.8, delta: -0.3 },
              { label: 'MRR', value: 128430, delta: 3.1 }
            ],
            chart: [12, 16, 14, 18, 22, 19, 24, 28],
            colors: ['#7db5ff', '#f08cbd', '#2dd4bf', '#f59e0b']
          },
          shortcuts: ['⌘ + K command palette', '⇧ + / help', 'Hold Alt to sample data'],
        },
      },
    }, '*');
    window.setTimeout(() => {
      iframeRef.current?.focus();
      iframeRef.current?.contentWindow?.postMessage({ type: 'sandbox:focus' }, '*');
    }, 0);
  }, []);

  const postKeyToSandbox = useCallback((type: 'input:key' | 'input:keyup', event: KeyboardEvent) => {
    iframeRef.current?.contentWindow?.postMessage({
      type,
      payload: {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        repeat: event.repeat
      }
    }, '*');
  }, []);

  const logFix = useCallback(
    (_params: { componentId?: string; error_message: string; fix_summary: string; success: boolean }) => {
      void _params;
      return Promise.resolve();
    },
    []
  );

  const autoFix = useCallback(async (
    code: string,
    startingIssues: Issue[] = [],
    runtimeError?: string,
    promptContext?: string
  ): Promise<boolean> => {
    setError(null);
    let attempt = 0;
    let working = code;
    let issues = startingIssues;
    let runtimeMsg = runtimeError;
    const fixPrompt = String(promptContext || activePrompt || '').trim();

    while (attempt < MAX_AUTOFIX_ATTEMPTS) {
      attempt += 1;
      let patched = working;
      try {
        const dbgRes = await fetch('/api/debug-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: working, issues, runtimeError: runtimeMsg, prompt: fixPrompt })
        });
        if (!dbgRes.ok) {
          const txt = await dbgRes.text().catch(() => '');
          throw new Error(txt || `debug-component failed: ${dbgRes.status}`);
        }
        const dbg = await safeJson(dbgRes);
        patched = typeof dbg?.code === 'string' ? dbg.code : working;
        if (patched.trim() === working.trim()) {
          setError('Auto-fix returned unchanged code.');
          await logFix({
            error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'debugger unchanged output',
            fix_summary: `autofix attempt ${attempt} unchanged`,
            success: false
          });
          break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        await logFix({
          error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'debugger error',
          fix_summary: `autofix attempt ${attempt} debugger error`,
          success: false
        });
        continue; // Allow more debugging attempts
      }

      let val: { valid?: boolean; issues?: Issue[] } | null = null;
      try {
        const valRes = await fetch('/api/validate-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: patched, prompt: fixPrompt })
        });
        if (!valRes.ok) {
          const txt = await valRes.text().catch(() => '');
          throw new Error(txt || `validate-component failed: ${valRes.status}`);
        }
        val = await safeJson(valRes);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        await logFix({
          error_message: runtimeMsg || message,
          fix_summary: `autofix attempt ${attempt} validator error`,
          success: false
        });
        continue; // Allow more validation attempts
      }

      if (val?.valid) {
        setCurrentCode(patched);
        postToSandbox(patched);
        lastRuntimeFingerprintRef.current = null;
        await logFix({
          error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'validator issues',
          fix_summary: `autofix attempt ${attempt} succeeded`,
          success: true
        });
        return true;
      }

      await logFix({
        error_message: runtimeMsg || val?.issues?.map(i => i.message).join(' | ') || 'validation failed',
        fix_summary: `autofix attempt ${attempt} failed`,
        success: false
      });
      working = patched;
      issues = val?.issues || [];
      runtimeMsg = undefined;
    }

    setError('Auto-fix failed after max attempts.');
    await logFix({
      error_message: 'autofix exhausted',
      fix_summary: 'autofix attempts exhausted',
      success: false
    });
    return false;
  }, [activePrompt, logFix, postToSandbox]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'render:ok') {
        setError(null);
        setStatus('ok');
        lastRuntimeFingerprintRef.current = null;
      }
      if (e.data?.type === 'render:error') {
        const msg = e.data?.message || 'Runtime error';
        const fingerprint = `${currentCode || ''}::${msg}`;
        if (fingerprint === lastRuntimeFingerprintRef.current) return;
        lastRuntimeFingerprintRef.current = fingerprint;
        if (currentCode && !isAutoFixingRef.current) {
          try {
            isAutoFixingRef.current = true;
            setStatus('autofixing');
            const fixed = await autoFix(currentCode, [], msg, activePrompt);
            setStatus(fixed ? 'ok' : 'error');
          } finally {
            isAutoFixingRef.current = false;
          }
        } else {
          setError(msg);
          setStatus('error');
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [activePrompt, autoFix, currentCode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const focusSandbox = () => {
      iframe.focus();
      iframe.contentWindow?.postMessage({ type: 'sandbox:focus' }, '*');
    };
    iframe.addEventListener('pointerdown', focusSandbox);
    return () => iframe.removeEventListener('pointerdown', focusSandbox);
  }, []);

  useEffect(() => {
    const keyCodes = new Set([
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'Space', 'KeyR', 'Enter', 'Escape'
    ]);
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const shouldForward = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return false;
      if (keyCodes.has(event.code)) return true;
      return /^(w|a|s|d|W|A|S|D|r|R)$/.test(event.key);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldForward(event)) return;
      if (scrollKeys.has(event.code) || event.key === ' ') {
        event.preventDefault();
      }
      postKeyToSandbox('input:key', event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!shouldForward(event)) return;
      postKeyToSandbox('input:keyup', event);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [postKeyToSandbox]);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setStatus('error');
      setError('Please enter a prompt.');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
      setStatus('error');
      setError(`Prompt exceeds ${MAX_PROMPT_CHARS} characters.`);
      return;
    }

    setStatus('generating');
    setError(null);
    setActivePrompt(trimmedPrompt);
    lastRuntimeFingerprintRef.current = null;
    try {
      const genRes = await fetch('/api/generate-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmedPrompt })
      });
      if (!genRes.ok) {
        const txt = await genRes.text().catch(() => '');
        throw new Error(txt || `generate-component failed: ${genRes.status}`);
      }
      const gen = await safeJson(genRes);
      if (!gen?.code) throw new Error(gen?.error || 'No code returned');

      setStatus('validating');
      const valRes = await fetch('/api/validate-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gen.code, prompt: trimmedPrompt })
      });
      if (!valRes.ok) {
        const txt = await valRes.text().catch(() => '');
        throw new Error(txt || `validate-component failed: ${valRes.status}`);
      }
      const val = await safeJson(valRes);

      if (val?.valid) {
        setCurrentCode(gen.code);
        postToSandbox(gen.code);
        setStatus('ok');
      } else {
        // Attempt auto-fix immediately when validation fails
        setStatus('autofixing');
        const issues = Array.isArray(val?.issues) ? val.issues : [];
        const fixed = await autoFix(gen.code, issues, undefined, trimmedPrompt);
        setStatus(fixed ? 'ok' : 'error');
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const normalizedStatus = status.toLowerCase();
  const statusClassName = `status-pill ${
    normalizedStatus === 'ok'
      ? 'status-pill-ok'
      : normalizedStatus === 'error'
        ? 'status-pill-error'
        : normalizedStatus === 'autofixing'
          ? 'status-pill-warn'
          : ''
  }`;

  return (
    <main className="immersive-page sandbox-page">
      <div className="hero-sheen sandbox-sheen" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />

      <div className="page-frame">
        <Navbar minimal />

        <div className="sandbox-stack">
          <section className="sandbox-controls">
            <div className="sandbox-header">
              <div>
                <h1 className="sandbox-title">Sandbox</h1>
                <p className="sandbox-subtitle">Prompt, generate, validate, and live render.</p>
              </div>
              <div className={statusClassName}>Status: {status}</div>
            </div>

            <div className="space-y-3">
              <textarea
                className="input sandbox-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                maxLength={MAX_PROMPT_CHARS}
                placeholder="Describe the component you want to generate."
              />
              <div className="sandbox-meta">
                <span>{prompt.length}/{MAX_PROMPT_CHARS}</span>
                <span>Auto-fix max: {MAX_AUTOFIX_ATTEMPTS}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleGenerate} className="btn-primary">Generate</button>
              </div>
              {error && <p className="sandbox-error">{error}</p>}
            </div>
          </section>

          <section className="sandbox-output">
            <iframe
              ref={iframeRef}
              src="/sandbox.html"
              sandbox="allow-scripts"
              scrolling="auto"
              tabIndex={0}
              className="sandbox-frame"
            />
          </section>
        </div>
      </div>
    </main>
  );
}
