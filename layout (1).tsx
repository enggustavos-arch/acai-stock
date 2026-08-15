import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

const MANAGE_ROLES = ['admin', 'owner', 'store_manager'];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  // admin, owner and store_manager can use the dashboard; products/settings/
  // analytics pages have their own (stricter) guards
  const role = profile?.role ?? '';
  if (!MANAGE_ROLES.includes(role)) redirect('/contagem');

  return (
    <div className="min-h-dvh pb-20">
      {children}
      <AdminNav role={role as 'admin' | 'owner' | 'store_manager'} />
    </div>
  );
}
