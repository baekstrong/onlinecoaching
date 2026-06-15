import type { SupabaseClient } from '@supabase/supabase-js'

export type RequestClassification = { id: string; request_id: string; tag_id: string }

/** 요청에 연결된 분류 태그 목록. */
export async function getRequestClassifications(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RequestClassification[]> {
  const { data, error } = await supabase
    .from('request_classifications')
    .select('id, request_id, tag_id')
    .eq('request_id', requestId)
  if (error) throw new Error(error.message)
  return (data ?? []) as RequestClassification[]
}

/** (코치) 요청에 분류 태그 추가. 이미 있으면 무시(멱등). */
export async function addRequestClassification(
  supabase: SupabaseClient,
  requestId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from('request_classifications')
    .upsert({ request_id: requestId, tag_id: tagId }, { onConflict: 'request_id,tag_id' })
  if (error) throw new Error(error.message)
}

/** (코치) 요청에서 분류 태그 제거. */
export async function removeRequestClassification(
  supabase: SupabaseClient,
  requestId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from('request_classifications')
    .delete()
    .eq('request_id', requestId)
    .eq('tag_id', tagId)
  if (error) throw new Error(error.message)
}
