import Link from 'next/link';
import AdminHeader from '@/components/AdminHeader';

const items = [
  { href: '/admin/restocks', title: 'Reposições', desc: 'Registo de mercadoria recebida por loja' },
  { href: '/admin/export', title: 'Exportar CSV', desc: 'Stock e consumo por loja e período' },
  { href: '/admin/settings', title: 'Definições', desc: 'Lojas, hora limite da contagem' },
];

export default function MorePage() {
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
