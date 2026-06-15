import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from './roles'

/** 현재 로그인 사용자의 역할을 반환한다. 미로그인/프로필 없음이면 null. */
export async function getCurrentRole(supabase: SupabaseClient): Promise<Role | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return (data?.role as Role | undefined) ?? null
}

/** 현재 사용자가 코치인지 여부. */
export async function isCurrentUserCoach(supabase: SupabaseClient): Promise<boolean> {
  return (await getCurrentRole(supabase)) === 'coach'
}
