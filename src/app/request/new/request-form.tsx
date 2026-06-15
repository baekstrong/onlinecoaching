'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestUploadUrl, submitCoachingRequest } from '../actions'

type Tag = { id: string; label: string }
const MAX_BYTES = 200 * 1024 * 1024 // 200MB

export function RequestForm({ axisName, tags }: { axisName: string; tags: Tag[] }) {
  const router = useRouter()
  const [tagId, setTagId] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!tagId) return setError('운동 종목을 선택해주세요.')
    if (!file) return setError('운동 영상을 첨부해주세요.')
    if (!file.type.startsWith('video/')) return setError('영상 파일만 업로드할 수 있습니다.')
    if (file.size > MAX_BYTES) return setError('영상은 200MB 이하만 가능합니다.')

    setBusy(true)
    try {
      const { uploadUrl, objectKey } = await requestUploadUrl(file.name, file.type)
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!put.ok) throw new Error('영상 업로드에 실패했습니다.')
      await submitCoachingRequest({ tagId, note: note.trim(), objectKey })
      router.push('/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : '신청에 실패했습니다.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{axisName}</span>
        <select
          value={tagId}
          onChange={(e) => setTagId(e.target.value)}
          className="rounded-md border p-2"
        >
          <option value="">선택하세요</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">어디를 봐드릴까요?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="rounded-md border p-2"
          placeholder="궁금한 점이나 신경 쓰이는 부분을 적어주세요."
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">운동 영상</span>
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {busy ? '업로드 중…' : '신청하기'}
      </button>
    </form>
  )
}
