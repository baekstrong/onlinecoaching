'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  saveFeedback, publishFeedbackAction,
  requestFeedbackImageUpload, attachFeedbackImage, detachFeedbackImage,
} from '../../actions'

type Template = { id: string; title: string; text: string }
type AssetView = { objectKey: string; url: string }

export function FeedbackEditor({
  requestId, templates, initialText, publishedAt, initialAssets,
}: {
  requestId: string
  templates: Template[]
  initialText: string
  publishedAt: string | null
  initialAssets: AssetView[]
}) {
  const router = useRouter()
  const [text, setText] = useState(initialText)
  const [assets, setAssets] = useState<AssetView[]>(initialAssets)
  const [published, setPublished] = useState<boolean>(publishedAt !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (t) setText((prev) => (prev ? prev + '\n\n' + t.text : t.text))
  }

  async function saveDraft() {
    setError(null); setNotice(null)
    if (!text.trim()) return setError('내용을 입력해주세요.')
    setBusy(true)
    try {
      await saveFeedback(requestId, text.trim())
      setNotice('저장되었습니다.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally { setBusy(false) }
  }

  async function publish() {
    setError(null); setNotice(null)
    setBusy(true)
    try {
      await saveFeedback(requestId, text.trim())
      await publishFeedbackAction(requestId)
      setPublished(true)
      setNotice('발행되었습니다.')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '발행 실패')
    } finally { setBusy(false) }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('이미지 파일만 첨부할 수 있습니다.')
    setError(null); setBusy(true)
    try {
      const { id: feedbackId } = await saveFeedback(requestId, text.trim() || '(작성 중)')
      const { uploadUrl, objectKey } = await requestFeedbackImageUpload(requestId, file.name, file.type)
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!put.ok) throw new Error('이미지 업로드 실패')
      await attachFeedbackImage(feedbackId, objectKey)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 첨부 실패')
    } finally { setBusy(false) }
  }

  async function removeImage(objectKey: string) {
    setBusy(true)
    try {
      const { id: feedbackId } = await saveFeedback(requestId, text.trim() || '(작성 중)')
      await detachFeedbackImage(feedbackId, objectKey)
      setAssets((prev) => prev.filter((a) => a.objectKey !== objectKey))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 제거 실패')
    } finally { setBusy(false) }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-500">피드백</h2>
        <span className={`text-xs ${published ? 'text-green-600' : 'text-gray-400'}`}>
          {published ? '발행됨' : '작성중'}
        </span>
      </div>

      {templates.length > 0 && (
        <select
          onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = '' } }}
          className="rounded border p-2 text-sm"
          defaultValue=""
        >
          <option value="">템플릿 불러오기…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="rounded border p-2"
        placeholder="피드백을 작성하세요. (이미지 링크/영상 링크는 URL로 붙여넣으세요)"
      />

      <div className="flex flex-wrap gap-2">
        {assets.map((a) => (
          <div key={a.objectKey} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt="첨부" className="h-20 w-20 rounded border object-cover" />
            <button
              type="button"
              onClick={() => removeImage(a.objectKey)}
              className="absolute -right-2 -top-2 rounded-full bg-black px-2 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded border text-sm text-gray-400">
          + 이미지
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={saveDraft} disabled={busy} className="rounded-md border px-4 py-2 disabled:opacity-50">
          임시 저장
        </button>
        <button type="button" onClick={publish} disabled={busy} className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">
          발행
        </button>
      </div>
    </section>
  )
}
