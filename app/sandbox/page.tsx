'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabaseBrowser } from '@/lib/supabase-browser';
import Navbar from '@/components/UI/Navbar';

type Issue = { type: string; message: string };

const MAX_AUTOFIX_ATTEMPTS = 3;

const safeJson = async (res: Response) => {
  try { return await res.json(); } catch { return null; }
};

export default function SandboxPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('Create a tic tac toe game');
  const [currentCode, setCurrentCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');

  const postToSandbox = useCallback((code: string) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'render',
      payload: {
        code,
        props: {
          title: 'Sandbox Demo',
          styles: `
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              background-color: #f0f0f0;
            }
            .game-container {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 1rem;
            }
            .restart-button {
              padding: 0.5rem 1rem;
              background-color: #007bff;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
            }
            .restart-button:hover {
              background-color: #0056b3;
            }
          `,
        },
      },
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
    setError(null);
    let attempt = 0;
    let working = code;
    let issues = startingIssues;
    let runtimeMsg = runtimeError;

    while (attempt < MAX_AUTOFIX_ATTEMPTS + 2) { // Increased attempts for better debugging
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
          body: JSON.stringify({ code: patched })
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
        await logFix({
          error_message: runtimeMsg || issues.map(i => i.message).join(' | ') || 'validator issues',
          fix_summary: `autofix attempt ${attempt} succeeded`,
          success: true
        });
        return;
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

    setError('Auto-fix failed after extended attempts.');
    await logFix({
      error_message: 'autofix exhausted',
      fix_summary: 'autofix attempts exhausted',
      success: false
    });
  }, [logFix, postToSandbox]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.data?.type === 'render:ok') {
        setError(null);
      }
      if (e.data?.type === 'render:error') {
        const msg = e.data?.message || 'Runtime error';
        if (currentCode) {
          await autoFix(currentCode, [], msg);
        } else {
          setError(msg);
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [autoFix, currentCode]);

  const handleGenerate = async () => {
    setStatus('generating');
    setError(null);
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

      if (val?.valid) {
        setCurrentCode(gen.code);
        postToSandbox(gen.code);
        setStatus('ok');
      } else {
        throw new Error('Validation failed.');
      }
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleError = useCallback((error: string) => {
    setError(error);
    alert(`An error occurred: ${error}`);
  }, []);

  useEffect(() => {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'error') {
        handleError(event.data.payload.message);
      }
    });

    return () => {
      window.removeEventListener('message', (event) => {
        if (event.data.type === 'error') {
          handleError(event.data.payload.message);
        }
      });
    };
  }, [handleError]);

  // Restored 'saveConfiguration' function
  const saveConfiguration = useCallback(() => {
    if (currentCode) {
      localStorage.setItem('sandboxConfig', JSON.stringify({ code: currentCode }));
      alert('Configuration saved!');
    }
  }, [currentCode]);

  // Restored 'loadConfiguration' function
  const loadConfiguration = useCallback(() => {
    const savedConfig = localStorage.getItem('sandboxConfig');
    if (savedConfig) {
      const { code } = JSON.parse(savedConfig);
      setCurrentCode(code);
      postToSandbox(code);
      alert('Configuration loaded!');
    } else {
      alert('No saved configuration found.');
    }
  }, [postToSandbox]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <main className="py-6">
        <Navbar />

        <section className="glass p-6 mt-4 space-y-4">
          <h1 className="text-2xl font-bold">Sandbox</h1>
          <p className="text-sm text-white/70">
            We code, validate, and auto-repair. Type a prompt to generate a component.
          </p>

          <textarea
            className="input h-28"
            value={prompt}
            onChange={(e)=>setPrompt(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <button onClick={handleGenerate} className="btn-primary">Generate UI</button>
            <button onClick={saveConfiguration} className="btn-secondary">Save Configuration</button>
            <button onClick={loadConfiguration} className="btn-secondary">Load Configuration</button>
            <span className="text-sm">Status: {status}{error ? ` — ${error}` : ''}</span>
          </div>
        </section>

        <section className="glass p-2 mt-4">
          <iframe
            ref={iframeRef}
            src="/sandbox.html"
            sandbox="allow-scripts"
            className="sandbox-iframe"
            style={{ width: '100%', height: '500px', border: 'none' }}
          />
        </section>

        {error && <div className="error-message">{error}</div>}
      </main>
    </motion.div>
  );
}