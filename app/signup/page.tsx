'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/UI/Navbar';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function SignUpPage() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null), [ok, setOk] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setErr(error.message); return; }
    // create the profile row for RLS usage
    if (data.user) {
      await supabase.from('users').upsert({ id: data.user.id, email: data.user.email }, { onConflict: 'id' });
    }
    setOk(true);
  };

  return (
    <main className="py-6">
      <Navbar />
      <div className="max-w-md mx-auto glass p-6 mt-4">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-white/70 mt-1">Use email + password.</p>
        <form onSubmit={onSubmit} className="space-y-3 mt-4">
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/>
          <input className="input" type="password" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/>
          <button className="btn-primary w-full">Create account</button>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          {ok && <p className="text-green-400 text-sm">Account created. You can now sign in.</p>}
        </form>
        <p className="text-sm text-white/70 mt-3">
          Already have an account? <Link className="underline" href="/signin">Sign in</Link>
        </p>
      </div>
    </main>
  );
}