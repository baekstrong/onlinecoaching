import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassificationTag = { id: string; label: string }
export type MemberFacingAxis = {
  axis: { id: string; name: string }
  tags: ClassificationTag[]
}

/** 회원 노출 축(예: 운동 종목)과 그 태그들을 sort_order 순서로 반환한다. 없으면 null. */
export async function getMemberFacingAxisWithTags(
  supabase: SupabaseClient,
): Promise<MemberFacingAxis | null> {
  const { data: axis } = await supabase
    .from('classification_axes')
    .select('id, name')
    .eq('is_member_facing', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle()
  if (!axis) return null

  const { data: tags } = await supabase
    .from('classification_tags')
    .select('id, label')
    .eq('axis_id', axis.id)
    .order('sort_order')

  return { axis, tags: tags ?? [] }
}
