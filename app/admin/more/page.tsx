import Link from 'next/link';
import AdminHeader from '@/components/AdminHeader';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALL_ITEMS = [
  { href: '/admin/restocks', title: 'Reposições', desc: 'Registo de mercadoria recebida por loja', adminOnly: false },
  { href: '/admin/export', title: 'Exportar CSV', desc: 'Stock e consumo por loja e período', adminOnly: false },
  { href: '/admin/settings', title: 'Definições', desc: 'Lojas, hora limite da contagem', adminOnly: true },
];

export default async function MorePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('user_id', user.id).single()
    : { data: null };
  const isAdmin = profile?.role === 'admin';
  const items = ALL_ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <main>
      <AdminHeader title="Mais" />
      <div className="p-3 space-y-3 max-w-lg mx-auto">
        {items.map((it) => (
          <Link key={it.href} href={it.href} className="card p-4 block active:bg-acai-50">
            <h2 className="font-semibold">{it.title}</h2>
            <p className="text-sm text-gray-500">{it.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
