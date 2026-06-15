import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { resolveRole } from '@/lib/auth/roles'

// 리다이렉트는 신뢰 가능한 APP_URL을 우선 사용(Host 헤더 스푸핑 방지), 없으면 요청 출처로 폴백
function redirectTo(path: string, request: Request) {
  const base = process.env.APP_URL ?? new URL(request.url).origin
  return NextResponse.redirect(new URL(path, base))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const admin = createAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        )

        // 프로필 존재 여부 확인 — 역할(role)은 '최초 생성 시 1회'만 정한다.
        const { data: existing, error: selError } = await admin
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()
        if (selError) {
          console.error('profile 조회 실패:', selError)
          return redirectTo('/login?error=profile', request)
        }

        const name = user.user_metadata?.name ?? null
        if (!existing) {
          // 코치 판정은 '확인된 이메일'에 한해서만 인정(이메일 스푸핑으로 인한 권한 상승 방지)
          const emailVerified = Boolean(user.email_confirmed_at)
          const role = emailVerified
            ? resolveRole(user.email, process.env.COACH_EMAIL)
            : 'member'
          const { error: insError } = await admin.from('profiles').insert({
            id: user.id,
            email: user.email,
            name,
            role,
          })
          if (insError) {
            console.error('profile 생성 실패:', insError)
            return redirectTo('/login?error=profile', request)
          }
        } else {
          // 재로그인: role은 절대 덮어쓰지 않고 이메일/이름만 갱신
          const { error: updError } = await admin
            .from('profiles')
            .update({ email: user.email, name })
            .eq('id', user.id)
          if (updError) {
            console.error('profile 갱신 실패:', updError)
            return redirectTo('/login?error=profile', request)
          }
        }
      }
      return redirectTo('/dashboard', request)
    }
  }

  return redirectTo('/login?error=auth', request)
}
