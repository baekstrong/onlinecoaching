import type { SupabaseClient } from '@supabase/supabase-js'

const RETENTION_DAYS = 90

/**
 * 90일 지난 영상을 만료시킨다: R2 객체 삭제 후 video_object_key를 null로.
 * deleteFn은 R2 삭제 함수(테스트에서 주입). admin(service_role) 클라이언트로 호출.
 * 반환: 만료 처리한 요청 수.
 *
 * 주의: DB 갱신 오류가 나면 throw하며, 그 시점까지 처리된 행은 이미 반영된다(부분 처리).
 * 다음 실행에서 남은 행이 재시도되므로 데이터 손상은 없다.
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
      // 삭제 실패해도 DB 키는 비운다(무한 재시도 방지). 남은 고아 객체는 R2 버킷
      // 라이프사이클 규칙이 정리하는 것을 안전망으로 둔다(운영 메모 참조).
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
