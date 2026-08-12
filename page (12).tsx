'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Email ou palavra-passe incorretos.');
      setBusy(false);
      return;
    }
    // Hard navigation so middleware + server components pick up the session.
    window.location.href = '/';
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-acai-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 h-16 w-16 rounded-2xl bg-acai-600 flex items-center justify-center text-3xl">
            🍇
          </div>
          <h1 className="text-2xl font-bold text-acai-900">Açaí Algarve</h1>
          <p className="text-sm text-gray-500 mt-1">Contagem diária de stock</p>
        </div>
        <form onSubmit={onSubmit} className="card p-5 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">Palavra-passe</label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'A entrar…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
