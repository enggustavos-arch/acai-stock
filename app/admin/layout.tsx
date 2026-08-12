import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

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

  // admin and manager can use the dashboard; products/settings pages
  // have their own admin-only guards
  if (profile?.role !== 'admin' && profile?.role !== 'manager') redirect('/contagem');

  return (
    <div className="min-h-dvh pb-20">
      {children}
      <AdminNav />
    </div>
  );
}
