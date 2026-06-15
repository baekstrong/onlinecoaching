import type { SupabaseClient } from '@supabase/supabase-js'

export type Feedback = {
  id: string
  request_id: string
  text: string
  published_at: string | null
}
export type FeedbackAsset = { id: string; feedback_id: string; object_key: string }

function toFeedback(r: { id: string; request_id: string; body_rich: { text?: string } | null; published_at: string | null }): Feedback {
  return { id: r.id, request_id: r.request_id, text: r.body_rich?.text ?? '', published_at: r.published_at }
}

const SELECT = 'id, request_id, body_rich, published_at'

/** (코치) 요청의 피드백 본문을 저장(없으면 생성, 있으면 갱신). 요청당 1개(UNIQUE). */
export async function saveFeedbackDraft(
  supabase: SupabaseClient,
  requestId: string,
  text: string,
): Promise<Feedback> {
  const { data, error } = await supabase
    .from('feedbacks')
    .upsert({ request_id: requestId, body_rich: { text } }, { onConflict: 'request_id' })
    .select(SELECT)
    .single()
  if (error || !data) throw new Error(error?.message ?? '피드백 저장 실패')
  return toFeedback(data)
}

/** 요청의 피드백 조회(없으면 null). */
export async function getFeedbackForRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<Feedback | null> {
  const { data } = await supabase.from('feedbacks').select(SELECT).eq('request_id', requestId).maybeSingle()
  return data ? toFeedback(data) : null
}

/** (코치) 피드백 발행(published_at = now). */
export async function publishFeedback(supabase: SupabaseClient, feedbackId: string): Promise<void> {
  const { error } = await supabase
    .from('feedbacks')
    .update({ published_at: new Date().toISOString() })
    .eq('id', feedbackId)
  if (error) throw new Error(error.message)
}

/** (코치) 피드백 이미지 자산 추가. */
export async function addFeedbackAsset(
  supabase: SupabaseClient,
  feedbackId: string,
  objectKey: string,
): Promise<void> {
  const { error } = await supabase.from('feedback_assets').insert({ feedback_id: feedbackId, object_key: objectKey })
  if (error) throw new Error(error.message)
}

/** 피드백 이미지 자산 목록. */
export async function listFeedbackAssets(
  supabase: SupabaseClient,
  feedbackId: string,
): Promise<FeedbackAsset[]> {
  const { data, error } = await supabase
    .from('feedback_assets')
    .select('id, feedback_id, object_key')
    .eq('feedback_id', feedbackId)
  if (error) throw new Error(error.message)
  return (data ?? []) as FeedbackAsset[]
}

/** (코치) 피드백 이미지 자산 삭제. */
export async function removeFeedbackAsset(
  supabase: SupabaseClient,
  feedbackId: string,
  objectKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('feedback_assets')
    .delete()
    .eq('feedback_id', feedbackId)
    .eq('object_key', objectKey)
  if (error) throw new Error(error.message)
}
