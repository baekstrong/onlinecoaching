import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">운동, 제대로 하고 있나요?</h1>
      <p className="max-w-md text-gray-500">
        영상을 올리면 코치가 직접 자세를 봐드립니다.
      </p>
      <Link href="/login" className="rounded-md bg-black px-6 py-3 font-medium text-white">
        코칭 시작하기
      </Link>
    </main>
  )
}
