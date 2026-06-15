'use client'

import { useState } from 'react'
import { tagRequest, untagRequest } from '../../actions'

type Tag = { id: string; label: string }
type Axis = { id: string; name: string; tags: Tag[] }

export function ClassificationEditor({
  requestId,
  axes,
  initialTagIds,
}: {
  requestId: string
  axes: Axis[]
  initialTagIds: string[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTagIds))
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(tagId: string) {
    setError(null)
    setPending(tagId)
    const isOn = selected.has(tagId)
    try {
      if (isOn) await untagRequest(requestId, tagId)
      else await tagRequest(requestId, tagId)
      setSelected((prev) => {
        const next = new Set(prev)
        if (isOn) next.delete(tagId)
        else next.add(tagId)
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경에 실패했습니다.')
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-gray-500">분류 태깅</h2>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {axes.map((axis) => (
        <div key={axis.id} className="flex flex-col gap-2">
          <span className="text-sm font-medium">{axis.name}</span>
          <div className="flex flex-wrap gap-2">
            {axis.tags.map((tag) => {
              const on = selected.has(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={pending === tag.id}
                  onClick={() => toggle(tag.id)}
                  className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${
                    on ? 'bg-black text-white' : 'bg-white text-black'
                  }`}
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
