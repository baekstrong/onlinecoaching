import type { SupabaseClient } from '@supabase/supabase-js'

export type CoachingRequest = {
  id: string
  member_id: string
  member_note: string | null
  video_object_key: string | null
  video_uploaded_at: string | null
  status: string
  created_at: string
}

export type NewCoachingRequest = {
  memberId: string
  tagId: string
  note: string
  objectKey: string
}

/** 영상 object key가 해당 회원의 prefix(requests/<memberId>/) 아래인지 검증한다. */
export function isOwnedObjectKey(memberId: string, objectKey: string): boolean {
  return objectKey.startsWith(`requests/${memberId}/`)
}

/**
 * 코칭 요청을 만들고 선택한 종목 태그를 연결한다.
 * 두 INSERT는 DB 함수에서 한 트랜잭션으로 원자적으로 실행되므로,
 * 분류 연결이 RLS 등으로 실패하면 요청도 함께 롤백된다(고아 요청 없음).
 * 회원의 인증 클라이언트로 호출(RLS 적용).
 */
export async function createCoachingRequest(
  supabase: SupabaseClient,
  input: NewCoachingRequest,
): Promise<CoachingRequest> {
  if (!isOwnedObjectKey(input.memberId, input.objectKey)) {
    throw new Error('영상 키가 본인 소유 경로가 아닙니다.')
  }

  const { data, error } = await supabase.rpc('create_coaching_request', {
    p_tag_id: input.tagId,
    p_note: input.note,
    p_object_key: input.objectKey,
  })
  if (error || !data) throw new Error(error?.message ?? '요청 생성 실패')

  return data as CoachingRequest
}

/** 회원 본인의 요청 목록(최신순). RLS가 본인 것만 노출. */
export async function listMemberRequests(
  supabase: SupabaseClient,
  memberId: string,
): Promise<CoachingRequest[]> {
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachingRequest[]
}

/** (코치) 모든 요청을 최신순으로. 상태 필터 옵션. RLS가 코치에게만 전체를 노출. */
export async function listAllRequests(
  supabase: SupabaseClient,
  status?: string,
): Promise<CoachingRequest[]> {
  let query = supabase.from('coaching_requests').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachingRequest[]
}

/** (코치/본인) 단일 요청 상세. 없거나 접근권 없으면 null. */
export async function getRequestDetail(
  supabase: SupabaseClient,
  requestId: string,
): Promise<CoachingRequest | null> {
  const { data } = await supabase
    .from('coaching_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  return (data as CoachingRequest | null) ?? null
}
