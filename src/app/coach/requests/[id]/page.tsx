import { notFound } from 'next/navigation'
import { requireCoachPage } from '../../guard'
import { getRequestDetail } from '@/lib/requests'
import { getAllAxesWithTags } from '@/lib/classification'
import { getRequestClassifications } from '@/lib/request-classifications'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'
import { ClassificationEditor } from './classification-editor'

export default async function CoachRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await requireCoachPage()

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  // 가드를 이미 통과했고 요청 행도 확보했으므로, 보유한 영상 키로 직접 presign(중복 조회 방지)
  const [axes, current, videoUrl] = await Promise.all([
    getAllAxesWithTags(supabase),
    getRequestClassifications(supabase, id),
    request.video_object_key ? createPresignedDownloadUrl(request.video_object_key) : Promise.resolve(null),
  ])
  const selectedTagIds = current.map((c) => c.tag_id)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">요청 상세</h1>

      {videoUrl ? (
        <video src={videoUrl} controls className="w-full rounded-md border" />
      ) : (
        <p className="text-sm text-gray-500">영상을 불러올 수 없습니다.</p>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500">회원 메모</h2>
        <p className="mt-1 whitespace-pre-wrap">{request.member_note ?? '(없음)'}</p>
      </section>

      <ClassificationEditor requestId={id} axes={axes} initialTagIds={selectedTagIds} />
    </main>
  )
}
