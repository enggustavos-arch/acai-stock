'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/admin', label: 'Início', icon: '🏠' },
  { href: '/admin/stock', label: 'Stock', icon: '📋' },
  { href: '/admin/trends', label: 'Consumo', icon: '📈' },
  { href: '/admin/products', label: 'Produtos', icon: '🛠️' },
  { href: '/admin/more', label: 'Mais', icon: '⋯' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[max(env(safe-area-inset-bottom),0.375rem)]">
      <div className="grid grid-cols-5 max-w-lg mx-auto">
        {items.map((it) => {
          const active =
            it.href === '/admin' ? pathname === '/admin' : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center pt-2.5 pb-2 text-[11px] ${
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
