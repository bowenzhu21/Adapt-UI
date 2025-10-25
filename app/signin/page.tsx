'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/UI/Navbar';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function SignInPage() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); return; }
    // upsert users row (useful if the user was created outside normal flow)
    if (data.user) await supabase.from('users').upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
    window.location.href = '/';
  };

  return (
    <main className="py-6">
      <Navbar />
      <div className="max-w-md mx-auto glass p-6 mt-4">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <form onSubmit={onSubmit} className="space-y-3 mt-4">
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <input className="input" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} required/>
          <button className="btn-primary w-full">Sign in</button>
          {err && <p className="text-red-400 text-sm">{err}</p>}
        </form>
        <p className="text-sm text-white/70 mt-3">
          No account? <Link className="underline" href="/signup">Create one</Link>
        </p>
        <p className="text-sm text-white/70">
          Forgot password? <Link className="underline" href="/reset">Reset it</Link>
        </p>
      </div>
    </main>
  );
}