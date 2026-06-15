import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestDetail } from '@/lib/requests'
import { getFeedbackForRequest, listFeedbackAssets } from '@/lib/feedback'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function MemberRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  const feedback = await getFeedbackForRequest(supabase, id)
  const published = feedback?.published_at != null

  const [videoUrl, assetViews] = await Promise.all([
    request.video_object_key ? createPresignedDownloadUrl(request.video_object_key) : Promise.resolve(null),
    published && feedback
      ? listFeedbackAssets(supabase, feedback.id).then((assets) =>
          Promise.all(assets.map((a) => createPresignedDownloadUrl(a.object_key))),
        )
      : Promise.resolve([] as string[]),
  ])

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">내 코칭</h1>
      <p className="text-sm text-gray-500">상태: {STATUS_LABEL[request.status] ?? request.status}</p>

      {videoUrl ? (
        <video src={videoUrl} controls className="w-full rounded-md border" />
      ) : (
        <p className="text-sm text-gray-400">영상이 만료되었거나 없습니다.</p>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500">내 메모</h2>
        <p className="mt-1 whitespace-pre-wrap">{request.member_note ?? '(없음)'}</p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500">코치 피드백</h2>
        {published && feedback ? (
          <>
            <p className="mt-1 whitespace-pre-wrap">{feedback.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {assetViews.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="피드백 이미지" className="max-h-60 rounded border" />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-gray-400">아직 피드백이 발행되지 않았습니다.</p>
        )}
      </section>
    </main>
  )
}
