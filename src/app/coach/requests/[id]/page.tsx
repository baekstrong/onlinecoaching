import { notFound } from 'next/navigation'
import { requireCoachPage } from '../../guard'
import { getRequestDetail } from '@/lib/requests'
import { getAllAxesWithTags } from '@/lib/classification'
import { getRequestClassifications } from '@/lib/request-classifications'
import { getFeedbackForRequest, listFeedbackAssets } from '@/lib/feedback'
import { listTemplates } from '@/lib/templates'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'
import { ClassificationEditor } from './classification-editor'
import { FeedbackEditor } from './feedback-editor'

export default async function CoachRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await requireCoachPage()

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  const [axes, current, videoUrl, feedback, templates] = await Promise.all([
    getAllAxesWithTags(supabase),
    getRequestClassifications(supabase, id),
    request.video_object_key ? createPresignedDownloadUrl(request.video_object_key) : Promise.resolve(null),
    getFeedbackForRequest(supabase, id),
    listTemplates(supabase),
  ])
  const selectedTagIds = current.map((c) => c.tag_id)

  const assets = feedback ? await listFeedbackAssets(supabase, feedback.id) : []
  const assetViews = await Promise.all(
    assets.map(async (a) => ({ objectKey: a.object_key, url: await createPresignedDownloadUrl(a.object_key) })),
  )

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

      <FeedbackEditor
        requestId={id}
        templates={templates.map((t) => ({ id: t.id, title: t.title, text: t.text }))}
        initialText={feedback?.text ?? ''}
        publishedAt={feedback?.published_at ?? null}
        initialAssets={assetViews}
      />
    </main>
  )
}
