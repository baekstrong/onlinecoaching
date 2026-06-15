import type { SupabaseClient } from '@supabase/supabase-js'

const RETENTION_DAYS = 90

/**
 * 90일 지난 영상을 만료시킨다: R2 객체 삭제 후 video_object_key를 null로.
 * deleteFn은 R2 삭제 함수(테스트에서 주입). admin(service_role) 클라이언트로 호출.
 * 반환: 만료 처리한 요청 수.
 */
export async function expireOldRequestVideos(
  supabase: SupabaseClient,
  deleteFn: (objectKey: string) => Promise<void>,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('id, video_object_key')
    .lt('video_uploaded_at', cutoff)
    .not('video_object_key', 'is', null)
  if (error) throw new Error(error.message)

  let count = 0
  for (const r of data ?? []) {
    const key = r.video_object_key as string
    try {
      await deleteFn(key)
    } catch (e) {
      console.error('R2 객체 삭제 실패:', key, e)
    }
    const { error: updError } = await supabase
      .from('coaching_requests')
      .update({ video_object_key: null })
      .eq('id', r.id)
    if (updError) throw new Error(updError.message)
    count++
  }
  return count
}
