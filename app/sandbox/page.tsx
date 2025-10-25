'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Navbar from '@/components/UI/Navbar';

type Issue = { type: string; message: string };

const MAX_AUTOFIX_ATTEMPTS = 3;

const fallbackDemo = `
  const { useState } = React;
  function Demo(props) {
    const [count, setCount] = useState(0);
    return (
      <div style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Hello from the sandbox!</h2>
        <p style={{ marginTop: 8 }}>Prop title: {props?.title}</p>
        <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      </div>
    );
  }
  module.exports.default = Demo;
`;

const safeJson = async (res: Response) => {
  try { return await res.json(); } catch { return null; }
};

export default function SandboxPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<'idle'|'ok'|'error'|'validating'|'generating'|'autofixing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('Create a pomodoro timer with start/pause/reset and a big time display.');
  const [currentCode, setCurrentCode] = useState<string | null>(null);

  const postToSandbox = useCallback((code: string) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'render',
      payload: { code, props: { title: 'Sandbox Demo' } }
    }, '*');
  }, []);

  const logFix = useCallback(async (params: { componentId?: string; error_message: string; fix_summary: string; success: boolean }) => {
    const { componentId, error_message, fix_summary, success } = params;
    try {
      const supabase = supabaseBrowser();
      await supabase.from('error_log').insert({
        component_id: componentId || null,
        error_message,
        fix_summary,
        success
      });
    } catch {}
  }, []);

  const autoFix = useCallback(async (code: string, startingIssues: Issue[] = [], runtimeError?: string) => {
    setStatus('autofixing'); setError(null);
    let attempt = 0;
    let working = code;
    let issues = startingIssues;
    let runtimeMsg = runtimeError;

    while (attempt < MAX_AUTOFIX_ATTEMPTS) {
      attempt += 1;
      let patched = working;
      try {
        const dbgRes = await fetch('/api/debug-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: working, issues, runtimeError: runtimeMsg })
        });
        if (!dbgRes.ok) {
          const txt = await dbgRes.text().catch(() => '');
          throw new Error(txt || `debug-component failed: ${dbgRes.status}`);
        }
        const dbg = await safeJson(dbgRes);
        patched = typeof dbg?.code === 'string' ? dbg.code : working;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error'); setError(message);
        await logFix({
          error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'debugger error',
          fix_summary: `autofix attempt ${attempt} debugger error`,
          success: false
        });
        return;
      }

      let val: { valid?: boolean; issues?: Issue[] } | null = null;
      try {
        const valRes = await fetch('/api/validate-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: patched })
        });
        if (!valRes.ok) {
          const txt = await valRes.text().catch(() => '');
          throw new Error(txt || `validate-component failed: ${valRes.status}`);
        }
        val = await safeJson(valRes);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus('error'); setError(message);
        await logFix({
          error_message: runtimeMsg || message,
          fix_summary: `autofix attempt ${attempt} validator error`,
          success: false
        });
        return;
      }

      const valIssues: Issue[] = Array.isArray(val?.issues) ? (val?.issues as Issue[]) : [];

      if (val?.valid) {
        setCurrentCode(patched);
        postToSandbox(patched);
        await logFix({
          error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'validator issues',
          fix_summary: `autofix attempt ${attempt} succeeded`,
          success: true
        });
        return;
      }

      await logFix({
        error_message: runtimeMsg || valIssues.map(i => i.message).join(' | ') || 'validation failed',
        fix_summary: `autofix attempt ${attempt} failed`,
        success: false
      });
      working = patched;
      issues = valIssues;
      runtimeMsg = undefined;
    }

    setStatus('error');
    setError('Auto-fix failed after 3 attempts.');
    await logFix({
      error_message: 'autofix exhausted',
      fix_summary: 'autofix attempts exhausted',
      success: false
    });
  }, [logFix, postToSandbox]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.data?.type === 'render:ok') {
        setStatus('ok'); setError(null);
      }
      if (e.data?.type === 'render:error') {
        const msg = e.data?.message || 'Runtime error';
        if (currentCode) {
          await autoFix(currentCode, [], msg);
        } else {
          setStatus('error'); setError(msg);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [autoFix, currentCode]);

  const handleGenerate = async () => {
    setStatus('generating'); setError(null);
    try {
      const genRes = await fetch('/api/generate-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
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
        body: JSON.stringify({ code: gen.code })
      });
      if (!valRes.ok) {
        const txt = await valRes.text().catch(() => '');
        throw new Error(txt || `validate-component failed: ${valRes.status}`);
      }
      const val = await safeJson(valRes);
      const valIssues: Issue[] = Array.isArray(val?.issues) ? (val?.issues as Issue[]) : [];

      if (val?.valid) {
        setCurrentCode(gen.code);
        postToSandbox(gen.code);
      } else {
        await autoFix(gen.code, valIssues);
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderDemo = () => {
    setCurrentCode(fallbackDemo);
    postToSandbox(fallbackDemo);
  };

  return (
    <main className="py-6">
      <Navbar />

      <section className="glass p-6 mt-4 space-y-4">
        <h1 className="text-2xl font-bold">Sandbox Renderer</h1>
        <p className="text-sm text-white/70">
          Type a prompt to generate a component. If it fails, Adapt auto-fixes it silently.
        </p>

        <textarea
          className="input h-28"
          value={prompt}
          onChange={(e)=>setPrompt(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button onClick={handleGenerate} className="btn-primary">Generate & Render</button>
          <button onClick={renderDemo} className="btn-ghost">Render Demo Component</button>
          <span className="text-sm">Status: {status}{error ? ` — ${error}` : ''}</span>
        </div>
      </section>

      <section className="glass p-2 mt-4">
        <iframe
          ref={iframeRef}
          src="/sandbox.html"
          sandbox="allow-scripts"
          className="w-full h-[500px] rounded-xl"
        />
      </section>
    </main>
  );
}