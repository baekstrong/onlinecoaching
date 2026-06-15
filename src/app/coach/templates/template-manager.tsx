'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTemplateAction, updateTemplateAction, deleteTemplateAction } from '../actions'

type Template = { id: string; title: string; category: string | null; text: string }

export function TemplateManager({ initialTemplates }: { initialTemplates: Template[] }) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setEditingId(null); setTitle(''); setCategory(''); setText('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !text.trim()) return setError('제목과 내용을 입력해주세요.')
    setBusy(true)
    try {
      const input = { title: title.trim(), category: category.trim() || null, text: text.trim() }
      if (editingId) await updateTemplateAction(editingId, input)
      else await createTemplateAction(input)
      reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try { await deleteTemplateAction(id); router.refresh() }
    catch (err) { setError(err instanceof Error ? err.message : '삭제 실패') }
    finally { setBusy(false) }
  }

  function edit(t: Template) {
    setEditingId(t.id); setTitle(t.title); setCategory(t.category ?? ''); setText(t.text)
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={save} className="flex flex-col gap-2 rounded-md border p-4">
        <span className="text-sm font-medium">{editingId ? '템플릿 수정' : '새 템플릿'}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" className="rounded border p-2" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="분류(선택, 예: 스쿼트)" className="rounded border p-2" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="내용" className="rounded border p-2" />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">
            {editingId ? '수정' : '추가'}
          </button>
          {editingId && (
            <button type="button" onClick={reset} className="rounded-md border px-4 py-2">취소</button>
          )}
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {initialTemplates.map((t) => (
          <li key={t.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.title}</span>
              <span className="flex gap-2 text-sm">
                <button onClick={() => edit(t)} className="text-blue-600">수정</button>
                <button onClick={() => remove(t.id)} className="text-red-600">삭제</button>
              </span>
            </div>
            {t.category && <p className="text-xs text-gray-400">{t.category}</p>}
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{t.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
