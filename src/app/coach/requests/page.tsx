import Link from 'next/link'
import { requireCoachPage } from '../guard'
import { listAllRequests } from '@/lib/requests'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function CoachRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await requireCoachPage()

  const { status } = await searchParams
  const requests = await listAllRequests(supabase, status)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">요청 큐</h1>

      <nav className="flex gap-2 text-sm">
        <Link href="/coach/requests" className="rounded border px-3 py-1">전체</Link>
        <Link href="/coach/requests?status=in_review" className="rounded border px-3 py-1">검토중</Link>
        <Link href="/coach/requests?status=completed" className="rounded border px-3 py-1">완료</Link>
      </nav>

      {requests.length === 0 ? (
        <p className="text-gray-500">표시할 요청이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <Link href={`/coach/requests/${r.id}`} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{STATUS_LABEL[r.status] ?? r.status}</span>
                  {r.member_note && <span className="ml-2 text-sm text-gray-600">{r.member_note}</span>}
                </span>
                <span className="text-sm text-gray-400">
                  {new Date(r.created_at).toLocaleDateString('ko-KR')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
