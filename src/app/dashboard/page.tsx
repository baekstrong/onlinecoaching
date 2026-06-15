import Link from 'next/link'
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

      <div className="mt-6 flex gap-3">
        {profile?.role === 'coach' ? (
          <>
            <Link href="/coach/requests" className="rounded-md bg-black px-4 py-2 text-white">
              요청 큐 보기
            </Link>
            <Link href="/coach/templates" className="rounded-md border px-4 py-2">
              피드백 템플릿
            </Link>
          </>
        ) : (
          <>
            <Link href="/request/new" className="rounded-md bg-black px-4 py-2 text-white">
              코칭 신청하기
            </Link>
            <Link href="/requests" className="rounded-md border px-4 py-2">
              내 신청 보기
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
