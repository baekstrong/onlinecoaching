'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithKakao() {
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">온라인 코칭</h1>
      <p className="text-gray-500">카카오로 간편하게 시작하세요</p>
      <button
        onClick={signInWithKakao}
        className="rounded-md bg-[#FEE500] px-6 py-3 font-medium text-black"
      >
        카카오로 로그인
      </button>
    </main>
  )
}
