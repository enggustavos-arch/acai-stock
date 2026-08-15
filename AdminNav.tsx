'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'admin' | 'owner' | 'store_manager';

const BASE_ITEMS = [
  { href: '/admin', label: 'Início', icon: '🏠' },
  { href: '/admin/stock', label: 'Stock', icon: '📋' },
  { href: '/admin/trends', label: 'Consumo', icon: '📈' },
  { href: '/admin/products', label: 'Produtos', icon: '🛠️' },
];
const ANALYTICS_ITEM = { href: '/admin/analytics', label: 'Análise', icon: '💰' };
const MORE_ITEM = { href: '/admin/more', label: 'Mais', icon: '⋯' };

// Tailwind needs the full class name literally in source to generate it —
// keep this map instead of building "grid-cols-" + n at runtime.
const GRID_COLS: Record<number, string> = {
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export default function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  // Analytics is owner/admin only — store_manager doesn't see it.
  const items =
    role === 'store_manager'
      ? [...BASE_ITEMS, MORE_ITEM]
      : [...BASE_ITEMS, ANALYTICS_ITEM, MORE_ITEM];
  const gridCols = GRID_COLS[items.length] ?? 'grid-cols-5';

  return (
    <nav className={`fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[max(env(safe-area-inset-bottom),0.375rem)]`}>
      <div className={`grid ${gridCols} max-w-lg mx-auto`}>
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
