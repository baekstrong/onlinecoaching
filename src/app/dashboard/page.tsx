import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  return (
    <main className="p-8">
      <h1 className="text-xl font-bold">
        {profile?.role === 'coach' ? '코치 대시보드' : '내 코칭함'}
      </h1>
      <p className="mt-2 text-gray-500">{profile?.name ?? user.email} 님 환영합니다.</p>
    </main>
  )
}
