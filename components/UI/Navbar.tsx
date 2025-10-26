'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function Navbar() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    setEmail(null);
  };

  return (
    <header className="flex items-center justify-between py-6">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">Adapt</span>
      </Link>
      <nav className="flex items-center gap-2">
        <Link className="btn-ghost" href="/sandbox">Sandbox</Link>
        {email ? (
          <>
            <button onClick={signOut} className="btn-primary">Sign out</button>
          </>
        ) : (
          <>
            <Link className="btn-ghost" href="/signin">Sign in</Link>
            <Link
              className="btn-primary"
              href="/signup"
              onClick={(e) => {
                if (email) {
                  e.preventDefault();
                  alert('You are already signed in.');
                }
              }}
            >
              Create account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}