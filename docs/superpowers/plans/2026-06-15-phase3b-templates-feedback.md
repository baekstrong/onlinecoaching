# 온라인 코칭 시스템 — 3b단계(템플릿 + 리치 피드백) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코치가 피드백 템플릿을 관리하고, 요청 상세에서 템플릿을 불러와 텍스트 피드백을 작성하고 이미지(R2)를 첨부한 뒤 발행할 수 있다. 발행된 피드백은 published_at으로 표시된다(회원 열람·알림은 4단계).

**Architecture:** 피드백은 텍스트 본문(`feedbacks.body_rich` jsonb `{ text }`) + 이미지 첨부(`feedback_assets`, R2 object key) 모델. 본문 내 링크는 URL 텍스트로 둔다. 요청당 피드백 1개(UNIQUE request_id)로 upsert. 이미지는 영상과 같은 R2 presigned PUT/GET 인프라를 재사용한다. 도메인 로직(템플릿 CRUD, 피드백 draft/publish/assets)은 순수 함수로 분리해 로컬 Supabase에 통합 테스트하고, Server Action은 코치 권한(assertCoach)으로 감싼다. 템플릿·피드백·첨부 모두 1단계 RLS(코치 전용)로 보호된다.

**Tech Stack:** Next.js 16 Server Actions/Components, Supabase(RLS), `@aws-sdk/*`(R2), Vitest(통합 테스트는 로컬 Supabase 대상).

**Prerequisites:** 1·2·3a 완료. 로컬 Supabase 기동 중. `.env.local`에 Supabase + 더미 R2 키. 실제 이미지 업로드/표시 라이브 검증은 R2 키 준비 후(테스트는 presign 구조만 더미 키로 검증).

---

## File Structure

```
supabase/migrations/0004_feedback.sql        # feedbacks UNIQUE(request_id) + feedback_assets image_url→object_key 리네임
src/lib/storage/r2.ts                         # (수정) buildFeedbackImageKey 추가
src/lib/templates.ts                          # 템플릿 CRUD(코치)
src/lib/templates.test.ts
src/lib/feedback.ts                           # 피드백 draft/publish/assets 도메인
src/lib/feedback.test.ts
src/app/coach/actions.ts                      # (수정) 피드백/이미지 Server Action 추가
src/app/coach/templates/page.tsx              # 템플릿 관리 페이지(서버)
src/app/coach/templates/template-manager.tsx  # 템플릿 관리 클라이언트
src/app/coach/requests/[id]/page.tsx          # (수정) 피드백 에디터 섹션 추가(템플릿·자산 로드)
src/app/coach/requests/[id]/feedback-editor.tsx  # 피드백 작성/발행/이미지 클라이언트
src/app/dashboard/page.tsx                    # (수정) 코치에게 템플릿 링크 추가
```

---

## Task 1: 마이그레이션(피드백 유일성·자산 키) + 이미지 키 빌더

**Files:**
- Create: `supabase/migrations/0004_feedback.sql`
- Modify: `src/lib/storage/r2.ts`, `src/lib/storage/r2.test.ts`

- [ ] **Step 1: 마이그레이션 작성** — `supabase/migrations/0004_feedback.sql`:

```sql
-- 요청당 피드백 1개(upsert 대상)
alter table feedbacks add constraint feedbacks_request_unique unique (request_id);

-- 피드백 첨부는 R2 object key를 저장한다(이미지 URL이 아니라 키 → 표시 시 presign)
alter table feedback_assets rename column image_url to object_key;
```

- [ ] **Step 2: 적용**

Run: `npx supabase db reset`
Expected: 0001~0004 + 시드가 오류 없이 적용됨.

- [ ] **Step 3: 실패 테스트 추가** — `src/lib/storage/r2.test.ts`의 import에 `buildFeedbackImageKey` 추가:
```ts
import { buildVideoObjectKey, createPresignedUploadUrl, createPresignedDownloadUrl, buildFeedbackImageKey } from './r2'
```
파일 끝에 추가:
```ts
describe('buildFeedbackImageKey', () => {
  it('feedback prefix 아래 요청별 확장자 보존 고유 키를 만든다', () => {
    const key = buildFeedbackImageKey('req-1', 'diagram.PNG')
    expect(key.startsWith('feedback/req-1/')).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
  })
  it('호출마다 다른 키', () => {
    expect(buildFeedbackImageKey('r', 'a.png')).not.toBe(buildFeedbackImageKey('r', 'a.png'))
  })
})
```

- [ ] **Step 4: 실행 → 실패 확인**

Run: `npm test -- r2`
Expected: FAIL — `buildFeedbackImageKey` 없음

- [ ] **Step 5: 구현 추가** — `src/lib/storage/r2.ts` 끝에 추가:
```ts
/** 피드백 첨부 이미지용 R2 object key. 예: feedback/<requestId>/<uuid>.png */
export function buildFeedbackImageKey(requestId: string, filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  const ext = match ? match[1].toLowerCase() : 'png'
  return `feedback/${requestId}/${randomUUID()}.${ext}`
}
```

- [ ] **Step 6: 실행 → 통과 확인**

Run: `npm test -- r2`
Expected: PASS (7 tests). 전체 `npm test`도 통과.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/0004_feedback.sql src/lib/storage/r2.ts src/lib/storage/r2.test.ts
git commit -m "feat: 피드백 유일성·자산 object_key 마이그레이션 + 이미지 키 빌더"
```

---

## Task 2: 템플릿 CRUD 도메인(코치)

**Files:**
- Create: `src/lib/templates.ts`
- Create: `src/lib/templates.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/templates.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInCoach, createSignedInMember, deleteUser } from '@/test-helpers/users'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

describe('템플릿 CRUD (코치)', () => {
  it('코치는 템플릿을 생성/수정/삭제하고 본인 것만 조회한다', async () => {
    const coach = await createSignedInCoach(`tpl_c_${Date.now()}@test.local`)
    created.push(coach.id)

    const t = await createTemplate(coach.client, coach.id, {
      title: '스쿼트 무릎', category: '스쿼트', text: '무릎이 안쪽으로 모입니다.',
    })
    expect(t.title).toBe('스쿼트 무릎')

    await updateTemplate(coach.client, t.id, { title: '스쿼트 무릎 교정', category: '스쿼트', text: '발끝 방향으로 무릎을 미세요.' })
    const list = await listTemplates(coach.client)
    expect(list.find((x) => x.id === t.id)?.title).toBe('스쿼트 무릎 교정')

    await deleteTemplate(coach.client, t.id)
    const after = await listTemplates(coach.client)
    expect(after.find((x) => x.id === t.id)).toBeUndefined()
  })

  it('회원은 템플릿을 만들 수 없다(RLS 차단)', async () => {
    const m = await createSignedInMember(`tpl_m_${Date.now()}@test.local`)
    created.push(m.id)
    await expect(
      createTemplate(m.client, m.id, { title: 'x', category: null, text: 'x' }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- templates`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현 작성** — `src/lib/templates.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type FeedbackTemplate = {
  id: string
  coach_id: string
  title: string
  category: string | null
  text: string
}

type TemplateInput = { title: string; category: string | null; text: string }

function toRow(t: { id: string; coach_id: string; title: string; category: string | null; body_rich: { text?: string } | null }): FeedbackTemplate {
  return { id: t.id, coach_id: t.coach_id, title: t.title, category: t.category, text: t.body_rich?.text ?? '' }
}

/** (코치) 본인 템플릿 목록(최신순). RLS가 본인 것만 노출. */
export async function listTemplates(supabase: SupabaseClient): Promise<FeedbackTemplate[]> {
  const { data, error } = await supabase
    .from('feedback_templates')
    .select('id, coach_id, title, category, body_rich')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toRow)
}

/** (코치) 템플릿 생성. coach_id는 호출자(코치)의 id. */
export async function createTemplate(
  supabase: SupabaseClient,
  coachId: string,
  input: TemplateInput,
): Promise<FeedbackTemplate> {
  const { data, error } = await supabase
    .from('feedback_templates')
    .insert({ coach_id: coachId, title: input.title, category: input.category, body_rich: { text: input.text } })
    .select('id, coach_id, title, category, body_rich')
    .single()
  if (error || !data) throw new Error(error?.message ?? '템플릿 생성 실패')
  return toRow(data)
}

/** (코치) 템플릿 수정. */
export async function updateTemplate(
  supabase: SupabaseClient,
  templateId: string,
  input: TemplateInput,
): Promise<void> {
  const { error } = await supabase
    .from('feedback_templates')
    .update({ title: input.title, category: input.category, body_rich: { text: input.text } })
    .eq('id', templateId)
  if (error) throw new Error(error.message)
}

/** (코치) 템플릿 삭제. */
export async function deleteTemplate(supabase: SupabaseClient, templateId: string): Promise<void> {
  const { error } = await supabase.from('feedback_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: 실행 → 통과 확인**

Run: `npm test -- templates`
Expected: PASS (2 tests). 전체 `npm test`도 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/templates.ts src/lib/templates.test.ts
git commit -m "feat: 피드백 템플릿 CRUD 도메인 로직(코치)"
```

---

## Task 3: 피드백 draft/publish/assets 도메인

**Files:**
- Create: `src/lib/feedback.ts`
- Create: `src/lib/feedback.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/feedback.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInCoach, createSignedInMember, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import {
  saveFeedbackDraft, getFeedbackForRequest, publishFeedback,
  addFeedbackAsset, listFeedbackAssets, removeFeedbackAsset,
} from './feedback'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}
async function seedRequest() {
  const m = await createSignedInMember(`fb_m_${Date.now()}_${Math.round(performance.now())}@test.local`)
  created.push(m.id)
  return createCoachingRequest(m.client, {
    memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: `requests/${m.id}/v.mp4`,
  })
}

describe('피드백 도메인 (코치)', () => {
  it('draft 저장(upsert)·조회·발행', async () => {
    const coach = await createSignedInCoach(`fb_c_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()

    const fb = await saveFeedbackDraft(coach.client, req.id, '자세가 좋습니다.')
    expect(fb.text).toBe('자세가 좋습니다.')
    expect(fb.published_at).toBeNull()

    // 같은 요청에 다시 저장하면 새 행이 아니라 갱신
    const fb2 = await saveFeedbackDraft(coach.client, req.id, '무릎을 더 벌리세요.')
    expect(fb2.id).toBe(fb.id)
    expect(fb2.text).toBe('무릎을 더 벌리세요.')

    await publishFeedback(coach.client, fb.id)
    const got = await getFeedbackForRequest(coach.client, req.id)
    expect(got?.published_at).not.toBeNull()
  })

  it('이미지 자산 추가/조회/삭제', async () => {
    const coach = await createSignedInCoach(`fb_c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const fb = await saveFeedbackDraft(coach.client, req.id, '본문')

    await addFeedbackAsset(coach.client, fb.id, `feedback/${req.id}/a.png`)
    let assets = await listFeedbackAssets(coach.client, fb.id)
    expect(assets.map((a) => a.object_key)).toContain(`feedback/${req.id}/a.png`)

    await removeFeedbackAsset(coach.client, fb.id, `feedback/${req.id}/a.png`)
    assets = await listFeedbackAssets(coach.client, fb.id)
    expect(assets.length).toBe(0)
  })
})
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- "feedback.test"`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현 작성** — `src/lib/feedback.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type Feedback = {
  id: string
  request_id: string
  text: string
  published_at: string | null
}
export type FeedbackAsset = { id: string; feedback_id: string; object_key: string }

function toFeedback(r: { id: string; request_id: string; body_rich: { text?: string } | null; published_at: string | null }): Feedback {
  return { id: r.id, request_id: r.request_id, text: r.body_rich?.text ?? '', published_at: r.published_at }
}

const SELECT = 'id, request_id, body_rich, published_at'

/** (코치) 요청의 피드백 본문을 저장(없으면 생성, 있으면 갱신). 요청당 1개(UNIQUE). */
export async function saveFeedbackDraft(
  supabase: SupabaseClient,
  requestId: string,
  text: string,
): Promise<Feedback> {
  const { data, error } = await supabase
    .from('feedbacks')
    .upsert({ request_id: requestId, body_rich: { text } }, { onConflict: 'request_id' })
    .select(SELECT)
    .single()
  if (error || !data) throw new Error(error?.message ?? '피드백 저장 실패')
  return toFeedback(data)
}

/** 요청의 피드백 조회(없으면 null). */
export async function getFeedbackForRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<Feedback | null> {
  const { data } = await supabase.from('feedbacks').select(SELECT).eq('request_id', requestId).maybeSingle()
  return data ? toFeedback(data) : null
}

/** (코치) 피드백 발행(published_at = now). */
export async function publishFeedback(supabase: SupabaseClient, feedbackId: string): Promise<void> {
  const { error } = await supabase
    .from('feedbacks')
    .update({ published_at: new Date().toISOString() })
    .eq('id', feedbackId)
  if (error) throw new Error(error.message)
}

/** (코치) 피드백 이미지 자산 추가(멱등). */
export async function addFeedbackAsset(
  supabase: SupabaseClient,
  feedbackId: string,
  objectKey: string,
): Promise<void> {
  const { error } = await supabase.from('feedback_assets').insert({ feedback_id: feedbackId, object_key: objectKey })
  if (error) throw new Error(error.message)
}

/** 피드백 이미지 자산 목록. */
export async function listFeedbackAssets(
  supabase: SupabaseClient,
  feedbackId: string,
): Promise<FeedbackAsset[]> {
  const { data, error } = await supabase
    .from('feedback_assets')
    .select('id, feedback_id, object_key')
    .eq('feedback_id', feedbackId)
  if (error) throw new Error(error.message)
  return (data ?? []) as FeedbackAsset[]
}

/** (코치) 피드백 이미지 자산 삭제. */
export async function removeFeedbackAsset(
  supabase: SupabaseClient,
  feedbackId: string,
  objectKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('feedback_assets')
    .delete()
    .eq('feedback_id', feedbackId)
    .eq('object_key', objectKey)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 4: 실행 → 통과 확인**

Run: `npm test -- "feedback.test"`
Expected: PASS (2 tests). 전체 `npm test`도 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/feedback.ts src/lib/feedback.test.ts
git commit -m "feat: 피드백 draft/발행/이미지 자산 도메인 로직"
```

---

## Task 4: 코치 피드백/이미지 Server Actions

**Files:**
- Modify: `src/app/coach/actions.ts`

- [ ] **Step 1: 구현 추가** — `src/app/coach/actions.ts`의 import에 추가:
```ts
import { saveFeedbackDraft, publishFeedback, getFeedbackForRequest, addFeedbackAsset, removeFeedbackAsset } from '@/lib/feedback'
import { buildFeedbackImageKey, createPresignedUploadUrl } from '@/lib/storage/r2'
```
파일 끝에 추가:
```ts
/** (코치) 피드백 본문 저장(draft) */
export async function saveFeedback(requestId: string, text: string): Promise<{ id: string }> {
  const supabase = await assertCoach()
  const fb = await saveFeedbackDraft(supabase, requestId, text)
  return { id: fb.id }
}

/** (코치) 피드백 발행 */
export async function publishFeedbackAction(requestId: string): Promise<void> {
  const supabase = await assertCoach()
  const fb = await getFeedbackForRequest(supabase, requestId)
  if (!fb) throw new Error('저장된 피드백이 없습니다.')
  await publishFeedback(supabase, fb.id)
}

/** (코치) 피드백 이미지 업로드 URL 발급 */
export async function requestFeedbackImageUpload(
  requestId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  await assertCoach()
  if (!contentType.startsWith('image/')) throw new Error('이미지 파일만 업로드할 수 있습니다.')
  const objectKey = buildFeedbackImageKey(requestId, filename)
  const uploadUrl = await createPresignedUploadUrl(objectKey, contentType)
  return { uploadUrl, objectKey }
}

/** (코치) 업로드된 이미지를 피드백에 첨부 */
export async function attachFeedbackImage(feedbackId: string, objectKey: string): Promise<void> {
  const supabase = await assertCoach()
  await addFeedbackAsset(supabase, feedbackId, objectKey)
}

/** (코치) 피드백 이미지 첨부 제거 */
export async function detachFeedbackImage(feedbackId: string, objectKey: string): Promise<void> {
  const supabase = await assertCoach()
  await removeFeedbackAsset(supabase, feedbackId, objectKey)
}
```

- [ ] **Step 2: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/app/coach/actions.ts
git commit -m "feat: 코치 피드백 저장/발행/이미지 업로드 Server Action"
```

---

## Task 5: 템플릿 관리 페이지

**Files:**
- Create: `src/app/coach/templates/page.tsx`
- Create: `src/app/coach/templates/template-manager.tsx`
- Modify: `src/app/coach/actions.ts` (템플릿 Server Action 추가)
- Modify: `src/app/dashboard/page.tsx` (코치에 템플릿 링크)

- [ ] **Step 1: 템플릿 Server Action 추가** — `src/app/coach/actions.ts`의 import에 추가:
```ts
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/templates'
```
파일 끝에 추가:
```ts
/** (코치) 템플릿 생성 */
export async function createTemplateAction(input: { title: string; category: string | null; text: string }): Promise<void> {
  const supabase = await assertCoach()
  const { data: { user } } = await supabase.auth.getUser()
  await createTemplate(supabase, user!.id, input)
}
/** (코치) 템플릿 수정 */
export async function updateTemplateAction(id: string, input: { title: string; category: string | null; text: string }): Promise<void> {
  const supabase = await assertCoach()
  await updateTemplate(supabase, id, input)
}
/** (코치) 템플릿 삭제 */
export async function deleteTemplateAction(id: string): Promise<void> {
  const supabase = await assertCoach()
  await deleteTemplate(supabase, id)
}
```

- [ ] **Step 2: 템플릿 페이지(서버)** — `src/app/coach/templates/page.tsx`:
```tsx
import { requireCoachPage } from '../guard'
import { listTemplates } from '@/lib/templates'
import { TemplateManager } from './template-manager'

export default async function CoachTemplatesPage() {
  const supabase = await requireCoachPage()
  const templates = await listTemplates(supabase)
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">피드백 템플릿</h1>
      <TemplateManager initialTemplates={templates} />
    </main>
  )
}
```

- [ ] **Step 3: 템플릿 관리 클라이언트** — `src/app/coach/templates/template-manager.tsx`:
```tsx
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
```

- [ ] **Step 4: 대시보드에 템플릿 링크 추가** — `src/app/dashboard/page.tsx`의 코치 분기 블록을 아래로 교체:
```tsx
        {profile?.role === 'coach' ? (
          <>
            <Link href="/coach/requests" className="rounded-md bg-black px-4 py-2 text-white">
              요청 큐 보기
            </Link>
            <Link href="/coach/templates" className="rounded-md border px-4 py-2">
              피드백 템플릿
            </Link>
          </>
        ) : (
```

- [ ] **Step 5: 타입체크 + 빌드 + 가드 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/coach/templates` 포함)

미인증 확인: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/coach/templates` → 307 → /login

- [ ] **Step 6: 커밋**

```bash
git add src/app/coach/templates/page.tsx src/app/coach/templates/template-manager.tsx src/app/coach/actions.ts src/app/dashboard/page.tsx
git commit -m "feat: 코치 템플릿 관리 페이지(CRUD) + 대시보드 링크"
```

---

## Task 6: 요청 상세에 피드백 에디터 추가

**Files:**
- Modify: `src/app/coach/requests/[id]/page.tsx`
- Create: `src/app/coach/requests/[id]/feedback-editor.tsx`

- [ ] **Step 1: 상세 페이지에 피드백 로드 추가** — `src/app/coach/requests/[id]/page.tsx`를 아래로 교체:
```tsx
import { notFound } from 'next/navigation'
import { requireCoachPage } from '../../guard'
import { getRequestDetail } from '@/lib/requests'
import { getAllAxesWithTags } from '@/lib/classification'
import { getRequestClassifications } from '@/lib/request-classifications'
import { getFeedbackForRequest, listFeedbackAssets } from '@/lib/feedback'
import { listTemplates } from '@/lib/templates'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'
import { ClassificationEditor } from './classification-editor'
import { FeedbackEditor } from './feedback-editor'

export default async function CoachRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await requireCoachPage()

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  const [axes, current, videoUrl, feedback, templates] = await Promise.all([
    getAllAxesWithTags(supabase),
    getRequestClassifications(supabase, id),
    request.video_object_key ? createPresignedDownloadUrl(request.video_object_key) : Promise.resolve(null),
    getFeedbackForRequest(supabase, id),
    listTemplates(supabase),
  ])
  const selectedTagIds = current.map((c) => c.tag_id)

  // 기존 첨부 이미지의 표시용 presigned URL
  const assets = feedback ? await listFeedbackAssets(supabase, feedback.id) : []
  const assetViews = await Promise.all(
    assets.map(async (a) => ({ objectKey: a.object_key, url: await createPresignedDownloadUrl(a.object_key) })),
  )

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">요청 상세</h1>

      {videoUrl ? (
        <video src={videoUrl} controls className="w-full rounded-md border" />
      ) : (
        <p className="text-sm text-gray-500">영상을 불러올 수 없습니다.</p>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500">회원 메모</h2>
        <p className="mt-1 whitespace-pre-wrap">{request.member_note ?? '(없음)'}</p>
      </section>

      <ClassificationEditor requestId={id} axes={axes} initialTagIds={selectedTagIds} />

      <FeedbackEditor
        requestId={id}
        templates={templates.map((t) => ({ id: t.id, title: t.title, text: t.text }))}
        initialText={feedback?.text ?? ''}
        publishedAt={feedback?.published_at ?? null}
        initialAssets={assetViews}
      />
    </main>
  )
}
```

- [ ] **Step 2: 피드백 에디터 클라이언트** — `src/app/coach/requests/[id]/feedback-editor.tsx`:
```tsx
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
      // 먼저 본문이 저장되어 있어야 피드백 id가 생기므로 draft 저장
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
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add "src/app/coach/requests/[id]/page.tsx" "src/app/coach/requests/[id]/feedback-editor.tsx"
git commit -m "feat: 요청 상세 피드백 에디터(템플릿 불러오기·이미지 첨부·임시저장·발행)"
```

---

## 3b단계 완료 기준 (Definition of Done)

- [ ] `npm test` 전부 통과 (r2 7, templates 2, feedback 2, 기존)
- [ ] `npx tsc --noEmit` 오류 없음
- [ ] `npm run build` 성공 (`/coach/templates` 포함)
- [ ] 코치가 템플릿 CRUD, 요청 상세에서 템플릿 불러와 피드백 작성·임시저장·발행, 이미지 첨부/제거 가능 (통합 테스트 + 빌드로 검증)
- [ ] 회원은 템플릿/피드백/첨부를 만들 수 없음 (RLS, 테스트로 검증)
- [ ] **(라이브, R2 키 필요)** 실제 이미지 업로드/표시 — R2 키 준비 후 검증

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** 설계 '코치 피드백 플로우'의 뒷단(템플릿 라이브러리·리치 텍스트 피드백·이미지·발행) → Task 1~6. 회원 열람·알림은 4단계.
- **플레이스홀더:** 없음. 모든 코드/명령 포함.
- **타입 일관성:** `createTemplate(supabase, coachId, input)`(Task 2)가 Server Action(Task 5)에서 일치. `saveFeedbackDraft/publishFeedback/get/add/list/removeFeedbackAsset`(Task 3)가 actions(Task 4)·상세 페이지(Task 6)에서 일치. `buildFeedbackImageKey`(Task 1)가 actions(Task 4)에서 사용. 피드백/자산 표시는 `createPresignedDownloadUrl`(3a) 재사용. FeedbackEditor props(templates/initialText/publishedAt/initialAssets)가 상세 페이지 전달과 일치.
- **보안:** 템플릿/피드백/자산 Server Action은 모두 assertCoach. RLS는 템플릿 코치-본인소유, 피드백/자산 코치 관리. 이미지 업로드 URL은 코치 권한 + image/* MIME 검증. 회원 차단은 templates 테스트로 검증.
- **R2 라이브 의존:** presign 구조는 더미 키로 검증, 실제 업로드/표시는 R2 키 준비 후.
- **알려진 한계:** feedback_assets 멱등성은 DB unique 제약이 없어 같은 키 중복 insert 시 행이 늘 수 있음(에디터는 업로드마다 새 uuid 키라 실무상 충돌 없음). 4단계에서 회원 열람 시 발행된 피드백만 노출(RLS의 published_at 게이트 기존 존재).
