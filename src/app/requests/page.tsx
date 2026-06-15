import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMemberRequests } from '@/lib/requests'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function RequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requests = await listMemberRequests(supabase, user.id)

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 코칭함</h1>
        <Link href="/request/new" className="rounded-md bg-black px-3 py-2 text-sm text-white">
          새 신청
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-gray-500">아직 신청한 코칭이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <p className="text-sm text-gray-500">
                {new Date(r.created_at).toLocaleDateString('ko-KR')}
              </p>
              <p className="font-medium">{STATUS_LABEL[r.status] ?? r.status}</p>
              {r.member_note && <p className="mt-1 text-sm">{r.member_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
