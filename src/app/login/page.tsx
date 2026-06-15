'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const [error, setError] = useState(false)

  async function signInWithKakao() {
    setError(false)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(true)
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
      {error && (
        <p className="text-sm text-red-500">로그인에 실패했습니다. 잠시 후 다시 시도해주세요.</p>
      )}
    </main>
  )
}
