'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/UI/Navbar';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function ResetPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'request'|'update'>('request');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // If user lands here from the magic link, Supabase will set a session and we can show update form
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPhase('update');
    });
    }, [supabase.auth]);

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/reset` : undefined
    });
    if (error) setErr(error.message); else setMsg('Check your inbox for the reset link.');
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setErr(error.message); else setMsg('Password updated. You can close this tab and sign in.');
  };

  return (
    <main className="py-6">
      <Navbar />
      <div className="max-w-md mx-auto glass p-6 mt-4">
        <h1 className="text-2xl font-semibold">Reset password</h1>

        {phase === 'request' ? (
          <form onSubmit={requestReset} className="space-y-3 mt-4">
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/>
            <button className="btn-primary w-full">Send reset link</button>
          </form>
        ) : (
          <form onSubmit={updatePassword} className="space-y-3 mt-4">
            <input className="input" type="password" placeholder="New password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/>
            <button className="btn-primary w-full">Update password</button>
          </form>
        )}

        {msg && <p className="text-emerald-400 text-sm mt-2">{msg}</p>}
        {err && <p className="text-red-400 text-sm mt-2">{err}</p>}
      </div>
    </main>
  );
}