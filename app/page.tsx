'use client';

import Link from 'next/link';
import Navbar from '@/components/UI/Navbar';

export default function Home() {
  return (
    <main className="py-6">
      <Navbar />

      <section className="glass p-8 md:p-12 mt-4">
        <p className="text-xs uppercase tracking-widest text-white/60">Demo</p>
        <h1 className="text-4xl md:text-6xl font-bold leading-tight mt-2">
          Generate interfaces with text. <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">Adapt</span> builds and adapts them live.
        </h1>
        <p className="max-w-2xl text-white/70 mt-4">
          Describe a component. We’ll generate it, validate it, auto-fix issues, and render securely in a sandbox.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/sandbox" className="btn-primary">Open Sandbox</Link>
          <Link href="/signup" className="btn-ghost">Create account</Link>
        </div>

        <div className="hr mt-8" />
        <ul className="grid gap-4 sm:grid-cols-3 mt-8">
          {[
            ['Generative UI', 'Describe components in plain English.'],
            ['Self-Healing', 'Auto-fixes common runtime errors.'],
            ['Secure Sandbox', 'Code executes in an isolated iframe.'],
          ].map(([t, d]) => (
            <li key={t} className="glass p-4">
              <h3 className="font-semibold">{t}</h3>
              <p className="text-sm text-white/70 mt-1">{d}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}