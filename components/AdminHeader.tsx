'use client';
import { createClient } from '@/lib/supabase/client';

export default function AdminHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }
  return (
    <header className="sticky top-0 z-20 bg-acai-600 text-white px-4 py-3 shadow">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg leading-tight">{title}</h1>
          {subtitle && <p className="text-acai-100 text-sm">{subtitle}</p>}
        </div>
        <button onClick={logout} className="text-acai-100 text-sm underline">
          Sair
        </button>
      </div>
    </header>
  );
}
