'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ALL_ITEMS = [
  { href: '/admin', label: 'Início', icon: '🏠', adminOnly: false },
  { href: '/admin/stock', label: 'Stock', icon: '📋', adminOnly: false },
  { href: '/admin/trends', label: 'Consumo', icon: '📈', adminOnly: false },
  { href: '/admin/products', label: 'Produtos', icon: '🛠️', adminOnly: true },
  { href: '/admin/more', label: 'Mais', icon: '⋯', adminOnly: false },
];

export default function AdminNav({ role }: { role?: string }) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';
  const items = ALL_ITEMS.filter((it) => !it.adminOnly || isAdmin);
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div
        className="grid max-w-lg mx-auto"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((it) => {
          const active =
            it.href === '/admin' ? pathname === '/admin' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center py-2 text-[11px] ${
                active ? 'text-acai-600 font-semibold' : 'text-gray-500'
              }`}
            >
              <span className="text-lg leading-none mb-0.5">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
