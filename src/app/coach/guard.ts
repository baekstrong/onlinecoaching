import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'

/**
 * 코치 전용 페이지 가드.
 * 미인증 → /login, 비코치 → /dashboard 로 리다이렉트하고,
 * 코치인 경우 인증된 Supabase 클라이언트를 반환한다.
 */
export async function requireCoachPage(): Promise<SupabaseClient> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isCurrentUserCoach(supabase))) redirect('/dashboard')
  return supabase
}
