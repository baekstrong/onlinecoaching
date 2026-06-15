# 온라인 코칭 시스템 — 3a단계(코치 요청 큐 + 분류 태깅) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코치(관리자)가 들어온 코칭 요청 큐를 상태별로 보고, 각 요청의 영상을 재생하며 메모를 확인하고, 케이스에 분류(문제 유형·신체 부위·회원 수준 등)를 태깅할 수 있다.

**Architecture:** 코치 전용 화면은 `/coach/*` 경로에 두고 페이지 레벨에서 `coach` 역할을 확인(미인증/비코치는 리다이렉트)한다. 보안의 본질은 1단계에서 만든 RLS다 — 코치는 모든 요청 조회·모든 분류 관리가 가능하고, 회원은 본인 것만 보인다. 도메인 로직(요청 목록/상세, 분류 CRUD, 전체 축·태그)은 순수 함수로 분리해 로컬 Supabase에 통합 테스트한다. 영상 재생은 R2 presigned GET URL(서버 발급)로 한다.

**Tech Stack:** Next.js 16 Server Actions/Components, Supabase(RLS), `@aws-sdk/*`(R2 presign), Vitest(통합 테스트는 로컬 Supabase 대상).

**Prerequisites:** 1·2단계 완료. 로컬 Supabase 기동 중. `.env.local`에 Supabase 키 + 더미 R2 키. 코치 판정은 `profiles.role='coach'`(테스트에서는 서비스롤로 코치 프로필을 만들어 검증).

---

## File Structure

```
src/lib/storage/r2.ts                       # (수정) createPresignedDownloadUrl 추가
src/lib/auth/coach.ts                        # 현재 사용자 역할 조회/코치 판정
src/lib/auth/coach.test.ts
src/lib/requests.ts                          # (수정) listAllRequests, getRequestDetail 추가
src/lib/requests-coach.test.ts               # 코치 조회 통합 테스트
src/lib/classification.ts                    # (수정) getAllAxesWithTags 추가
src/lib/request-classifications.ts           # 요청 분류 조회/추가/삭제(코치)
src/lib/request-classifications.test.ts
src/app/coach/actions.ts                     # 코치 Server Actions(태깅/영상URL)
src/app/coach/requests/page.tsx              # 요청 큐(상태 필터)
src/app/coach/requests/[id]/page.tsx         # 요청 상세(영상·메모·분류)
src/app/coach/requests/[id]/classification-editor.tsx  # 분류 태깅 클라이언트
src/app/dashboard/page.tsx                   # (수정) 코치에게 큐 링크 노출
src/test-helpers/users.ts                    # (수정) createSignedInCoach 추가
```

---

## Task 1: R2 presigned 다운로드(GET) URL

**Files:**
- Modify: `src/lib/storage/r2.ts`
- Modify: `src/lib/storage/r2.test.ts`

- [ ] **Step 1: 실패 테스트 추가** — `src/lib/storage/r2.test.ts`의 기존 import에 `createPresignedDownloadUrl`를 추가하고, 파일 끝에 describe 블록 추가:

```ts
import { buildVideoObjectKey, createPresignedUploadUrl, createPresignedDownloadUrl } from './r2'
```

(파일 맨 아래에 추가)

```ts
describe('createPresignedDownloadUrl', () => {
  it('버킷·키·서명이 포함된 GET용 서명 URL을 반환한다', async () => {
    const url = await createPresignedDownloadUrl('requests/u1/abc.mp4')
    expect(url).toContain('coaching-videos')
    expect(url).toContain('requests/u1/abc.mp4')
    expect(url).toContain('X-Amz-Signature')
  })
})
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- r2`
Expected: FAIL — `createPresignedDownloadUrl`가 export되지 않음

- [ ] **Step 3: 구현 추가** — `src/lib/storage/r2.ts`에 `GetObjectCommand` import 추가 및 함수 추가:

`import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'`를 다음으로 교체:
```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
```

파일 끝에 추가:
```ts
/** R2 객체를 재생/다운로드할 수 있는 presigned GET URL을 만든다. */
export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: objectKey,
  })
  return getSignedUrl(r2Client(), command, { expiresIn })
}
```

- [ ] **Step 4: 실행 → 통과 확인**

Run: `npm test -- r2`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/storage/r2.ts src/lib/storage/r2.test.ts
git commit -m "feat: R2 presigned 다운로드(GET) URL 생성 추가"
```

---

## Task 2: 코치 판정 헬퍼 + 테스트용 코치 생성

**Files:**
- Create: `src/lib/auth/coach.ts`
- Create: `src/lib/auth/coach.test.ts`
- Modify: `src/test-helpers/users.ts` (createSignedInCoach 추가)

- [ ] **Step 1: 테스트 헬퍼에 코치 생성 추가** — `src/test-helpers/users.ts` 파일 끝에 추가:

```ts
/** 확인된 코치 계정을 만들고, 그 코치로 로그인된 클라이언트를 돌려준다. */
export async function createSignedInCoach(
  email: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Passw0rd!123',
    email_confirm: true,
  })
  if (error) throw error
  const id = data.user.id
  await admin.from('profiles').upsert({ id, email, role: 'coach' }, { onConflict: 'id' })
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'Passw0rd!123',
  })
  if (signInError) throw signInError
  return { id, client }
}
```

- [ ] **Step 2: 실패 테스트 작성** — `src/lib/auth/coach.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser } from '@/test-helpers/users'
import { getCurrentRole, isCurrentUserCoach } from './coach'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

describe('getCurrentRole / isCurrentUserCoach', () => {
  it('코치 계정은 coach로 판정된다', async () => {
    const c = await createSignedInCoach(`coach_${Date.now()}@test.local`)
    created.push(c.id)
    expect(await getCurrentRole(c.client)).toBe('coach')
    expect(await isCurrentUserCoach(c.client)).toBe(true)
  })

  it('회원 계정은 coach가 아니다', async () => {
    const m = await createSignedInMember(`mem_${Date.now()}@test.local`)
    created.push(m.id)
    expect(await getCurrentRole(m.client)).toBe('member')
    expect(await isCurrentUserCoach(m.client)).toBe(false)
  })
})
```

- [ ] **Step 3: 실행 → 실패 확인**

Run: `npm test -- "coach.test"`
Expected: FAIL — `./coach` 없음

- [ ] **Step 4: 구현 작성** — `src/lib/auth/coach.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from './roles'

/** 현재 로그인 사용자의 역할을 반환한다. 미로그인/프로필 없음이면 null. */
export async function getCurrentRole(supabase: SupabaseClient): Promise<Role | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return (data?.role as Role | undefined) ?? null
}

/** 현재 사용자가 코치인지 여부. */
export async function isCurrentUserCoach(supabase: SupabaseClient): Promise<boolean> {
  return (await getCurrentRole(supabase)) === 'coach'
}
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test -- "coach.test"`
Expected: PASS (2 tests). 그리고 `npm test`로 전체 통과 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/auth/coach.ts src/lib/auth/coach.test.ts src/test-helpers/users.ts
git commit -m "feat: 코치 역할 판정 헬퍼 + 테스트용 코치 생성 헬퍼"
```

---

## Task 3: 요청 목록/상세 도메인 로직(코치)

**Files:**
- Modify: `src/lib/requests.ts`
- Create: `src/lib/requests-coach.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `src/lib/requests-coach.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest, listAllRequests, getRequestDetail } from './requests'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('listAllRequests (코치)', () => {
  it('코치는 여러 회원의 요청을 모두 본다', async () => {
    const coach = await createSignedInCoach(`c_${Date.now()}@test.local`)
    created.push(coach.id)
    const m1 = await createSignedInMember(`m1_${Date.now()}@test.local`)
    created.push(m1.id)
    await createCoachingRequest(m1.client, {
      memberId: m1.id, tagId: await squatTagId(), note: 'm1', objectKey: `requests/${m1.id}/a.mp4`,
    })
    const all = await listAllRequests(coach.client)
    expect(all.some((r) => r.member_id === m1.id)).toBe(true)
  })

  it('상태 필터로 좁힐 수 있다', async () => {
    const coach = await createSignedInCoach(`c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const inReview = await listAllRequests(coach.client, 'in_review')
    expect(inReview.every((r) => r.status === 'in_review')).toBe(true)
  })
})

describe('getRequestDetail (코치)', () => {
  it('코치는 임의 요청의 상세를 조회한다', async () => {
    const coach = await createSignedInCoach(`c3_${Date.now()}@test.local`)
    created.push(coach.id)
    const m = await createSignedInMember(`m3_${Date.now()}@test.local`)
    created.push(m.id)
    const req = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '상세', objectKey: `requests/${m.id}/b.mp4`,
    })
    const detail = await getRequestDetail(coach.client, req.id)
    expect(detail?.member_note).toBe('상세')
    expect(detail?.video_object_key).toBe(`requests/${m.id}/b.mp4`)
  })
})
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `npm test -- requests-coach`
Expected: FAIL — `listAllRequests`/`getRequestDetail` 없음

- [ ] **Step 3: 구현 추가** — `src/lib/requests.ts` 끝에 추가:

```ts
/** (코치) 모든 요청을 최신순으로. 상태 필터 옵션. RLS가 코치에게만 전체를 노출. */
export async function listAllRequests(
  supabase: SupabaseClient,
  status?: string,
): Promise<CoachingRequest[]> {
  let query = supabase.from('coaching_requests').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachingRequest[]
}

/** (코치/본인) 단일 요청 상세. 없거나 접근권 없으면 null. */
export async function getRequestDetail(
  supabase: SupabaseClient,
  requestId: string,
): Promise<CoachingRequest | null> {
  const { data } = await supabase
    .from('coaching_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()
  return (data as CoachingRequest | null) ?? null
}
```

- [ ] **Step 4: 실행 → 통과 확인**

Run: `npm test -- requests-coach`
Expected: PASS (3 tests). 전체 `npm test`도 통과.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/requests.ts src/lib/requests-coach.test.ts
git commit -m "feat: 코치용 요청 목록(상태필터)/상세 도메인 로직"
```

---

## Task 4: 전체 분류 축 조회 + 요청 분류 CRUD(코치)

**Files:**
- Modify: `src/lib/classification.ts`
- Create: `src/lib/request-classifications.ts`
- Create: `src/lib/request-classifications.test.ts`

- [ ] **Step 1: 전체 축 조회 추가** — `src/lib/classification.ts` 끝에 추가:

```ts
export type AxisWithTags = {
  id: string
  name: string
  is_member_facing: boolean
  allow_multiple: boolean
  tags: ClassificationTag[]
}

/** 모든 분류 축과 태그를 sort_order 순서로 반환(코치 태깅 UI용). */
export async function getAllAxesWithTags(supabase: SupabaseClient): Promise<AxisWithTags[]> {
  const { data: axes } = await supabase
    .from('classification_axes')
    .select('id, name, is_member_facing, allow_multiple')
    .order('sort_order')
  if (!axes) return []

  const { data: tags } = await supabase
    .from('classification_tags')
    .select('id, label, axis_id')
    .order('sort_order')

  return axes.map((a) => ({
    ...a,
    tags: (tags ?? []).filter((t) => t.axis_id === a.id).map((t) => ({ id: t.id, label: t.label })),
  }))
}
```

- [ ] **Step 2: 실패 테스트 작성** — `src/lib/request-classifications.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import {
  getRequestClassifications,
  addRequestClassification,
  removeRequestClassification,
} from './request-classifications'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}
async function problemTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin.from('classification_axes').select('id').eq('name', '문제 유형').single()
  const { data } = await admin.from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return data!.id as string
}

async function seedRequest() {
  const m = await createSignedInMember(`rc_m_${Date.now()}_${Math.round(performance.now())}@test.local`)
  created.push(m.id)
  const req = await createCoachingRequest(m.client, {
    memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: `requests/${m.id}/v.mp4`,
  })
  return req
}

describe('요청 분류 CRUD (코치)', () => {
  it('코치는 임의 요청에 코치 전용 축 태그를 추가/삭제한다', async () => {
    const coach = await createSignedInCoach(`rc_c_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const tag = await problemTagId()

    await addRequestClassification(coach.client, req.id, tag)
    let tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.map((t) => t.tag_id)).toContain(tag)

    await removeRequestClassification(coach.client, req.id, tag)
    tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.map((t) => t.tag_id)).not.toContain(tag)
  })

  it('회원이 만든 종목 태그도 코치가 조회한다', async () => {
    const coach = await createSignedInCoach(`rc_c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.length).toBeGreaterThanOrEqual(1) // 신청 시 단 종목 태그
  })
})
```

- [ ] **Step 3: 실행 → 실패 확인**

Run: `npm test -- request-classifications`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현 작성** — `src/lib/request-classifications.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type RequestClassification = { id: string; request_id: string; tag_id: string }

/** 요청에 연결된 분류 태그 목록. */
export async function getRequestClassifications(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RequestClassification[]> {
  const { data, error } = await supabase
    .from('request_classifications')
    .select('id, request_id, tag_id')
    .eq('request_id', requestId)
  if (error) throw new Error(error.message)
  return (data ?? []) as RequestClassification[]
}

/** (코치) 요청에 분류 태그 추가. 이미 있으면 무시(멱등). */
export async function addRequestClassification(
  supabase: SupabaseClient,
  requestId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from('request_classifications')
    .upsert({ request_id: requestId, tag_id: tagId }, { onConflict: 'request_id,tag_id' })
  if (error) throw new Error(error.message)
}

/** (코치) 요청에서 분류 태그 제거. */
export async function removeRequestClassification(
  supabase: SupabaseClient,
  requestId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from('request_classifications')
    .delete()
    .eq('request_id', requestId)
    .eq('tag_id', tagId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test -- request-classifications`
Expected: PASS (2 tests). 전체 `npm test`도 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/classification.ts src/lib/request-classifications.ts src/lib/request-classifications.test.ts
git commit -m "feat: 전체 분류 축 조회 + 요청 분류 추가/삭제/조회(코치)"
```

---

## Task 5: 코치 Server Actions (분류 태깅 + 영상 URL)

**Files:**
- Create: `src/app/coach/actions.ts`

- [ ] **Step 1: 구현 작성** — `src/app/coach/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'
import { getRequestDetail } from '@/lib/requests'
import { addRequestClassification, removeRequestClassification } from '@/lib/request-classifications'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'

async function assertCoach() {
  const supabase = await createClient()
  if (!(await isCurrentUserCoach(supabase))) throw new Error('코치 권한이 필요합니다.')
  return supabase
}

/** (코치) 요청에 분류 태그 추가 */
export async function tagRequest(requestId: string, tagId: string): Promise<void> {
  const supabase = await assertCoach()
  await addRequestClassification(supabase, requestId, tagId)
}

/** (코치) 요청에서 분류 태그 제거 */
export async function untagRequest(requestId: string, tagId: string): Promise<void> {
  const supabase = await assertCoach()
  await removeRequestClassification(supabase, requestId, tagId)
}

/** (코치) 요청 영상의 재생용 presigned URL */
export async function getRequestVideoUrl(requestId: string): Promise<string | null> {
  const supabase = await assertCoach()
  const req = await getRequestDetail(supabase, requestId)
  if (!req?.video_object_key) return null
  return createPresignedDownloadUrl(req.video_object_key)
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
git commit -m "feat: 코치 Server Action(분류 태깅/영상 URL, 코치 권한 확인)"
```

---

## Task 6: 코치 요청 큐 페이지 + 대시보드 링크

**Files:**
- Create: `src/app/coach/requests/page.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 요청 큐 페이지 작성** — `src/app/coach/requests/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'
import { listAllRequests } from '@/lib/requests'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function CoachRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isCurrentUserCoach(supabase))) redirect('/dashboard')

  const { status } = await searchParams
  const requests = await listAllRequests(supabase, status)

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">요청 큐</h1>

      <nav className="flex gap-2 text-sm">
        <Link href="/coach/requests" className="rounded border px-3 py-1">전체</Link>
        <Link href="/coach/requests?status=in_review" className="rounded border px-3 py-1">검토중</Link>
        <Link href="/coach/requests?status=completed" className="rounded border px-3 py-1">완료</Link>
      </nav>

      {requests.length === 0 ? (
        <p className="text-gray-500">표시할 요청이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <Link href={`/coach/requests/${r.id}`} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{STATUS_LABEL[r.status] ?? r.status}</span>
                  {r.member_note && <span className="ml-2 text-sm text-gray-600">{r.member_note}</span>}
                </span>
                <span className="text-sm text-gray-400">
                  {new Date(r.created_at).toLocaleDateString('ko-KR')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: 대시보드에 코치 링크 추가** — `src/app/dashboard/page.tsx`의 링크 블록을 아래로 교체(코치일 때만 큐 링크 노출):

기존:
```tsx
      <div className="mt-6 flex gap-3">
        <Link href="/request/new" className="rounded-md bg-black px-4 py-2 text-white">
          코칭 신청하기
        </Link>
        <Link href="/requests" className="rounded-md border px-4 py-2">
          내 신청 보기
        </Link>
      </div>
```
교체:
```tsx
      <div className="mt-6 flex gap-3">
        {profile?.role === 'coach' ? (
          <Link href="/coach/requests" className="rounded-md bg-black px-4 py-2 text-white">
            요청 큐 보기
          </Link>
        ) : (
          <>
            <Link href="/request/new" className="rounded-md bg-black px-4 py-2 text-white">
              코칭 신청하기
            </Link>
            <Link href="/requests" className="rounded-md border px-4 py-2">
              내 신청 보기
            </Link>
          </>
        )}
      </div>
```

- [ ] **Step 3: 타입체크 + 빌드 + 가드 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/coach/requests` 포함)

개발 서버에서 미인증 접근 확인:
`curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/coach/requests`
Expected: 307 → `/login`

- [ ] **Step 4: 커밋**

```bash
git add src/app/coach/requests/page.tsx src/app/dashboard/page.tsx
git commit -m "feat: 코치 요청 큐 페이지(상태 필터) + 대시보드 코치 링크"
```

---

## Task 7: 코치 요청 상세 + 분류 태깅 UI

**Files:**
- Create: `src/app/coach/requests/[id]/page.tsx`
- Create: `src/app/coach/requests/[id]/classification-editor.tsx`

- [ ] **Step 1: 상세 페이지 작성(서버)** — `src/app/coach/requests/[id]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'
import { getRequestDetail } from '@/lib/requests'
import { getAllAxesWithTags } from '@/lib/classification'
import { getRequestClassifications } from '@/lib/request-classifications'
import { getRequestVideoUrl } from '../../actions'
import { ClassificationEditor } from './classification-editor'

export default async function CoachRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (!(await isCurrentUserCoach(supabase))) redirect('/dashboard')

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  const [axes, current, videoUrl] = await Promise.all([
    getAllAxesWithTags(supabase),
    getRequestClassifications(supabase, id),
    getRequestVideoUrl(id),
  ])
  const selectedTagIds = current.map((c) => c.tag_id)

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
    </main>
  )
}
```

- [ ] **Step 2: 분류 태깅 클라이언트 작성** — `src/app/coach/requests/[id]/classification-editor.tsx`:

```tsx
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
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/coach/requests/[id]` 포함)

- [ ] **Step 4: 커밋**

```bash
git add "src/app/coach/requests/[id]/page.tsx" "src/app/coach/requests/[id]/classification-editor.tsx"
git commit -m "feat: 코치 요청 상세(영상 재생·메모) + 분류 태깅 UI"
```

---

## 3a단계 완료 기준 (Definition of Done)

- [ ] `npm test` 전부 통과 (r2 5, coach 2, requests-coach 3, request-classifications 2, 기존)
- [ ] `npx tsc --noEmit` 오류 없음
- [ ] `npm run build` 성공 (`/coach/requests`, `/coach/requests/[id]` 포함)
- [ ] 코치는 큐에서 모든 요청을 보고 상태로 필터, 상세에서 메모 확인 + 분류 태깅(추가/삭제) 가능 (통합 테스트로 검증)
- [ ] 비코치는 `/coach/*` 접근 시 리다이렉트 (가드)
- [ ] **(라이브, R2 키 필요)** 실제 영상 재생(presigned GET) — R2 키 준비 후 검증

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** 설계 '코치 피드백 플로우'의 앞단(요청 큐·영상 재생·메모 확인·분류 태깅) → Task 1·3·4·5·6·7. 템플릿·리치 피드백 발행은 3b로 분리.
- **플레이스홀더:** 없음. 모든 코드/명령 포함.
- **타입 일관성:** `getCurrentRole`/`isCurrentUserCoach`(Task 2)가 actions(Task 5)·페이지(6·7)에서 일치. `listAllRequests`/`getRequestDetail`(Task 3)가 페이지·actions에서 일치. `getAllAxesWithTags`(Task 4)·`get/add/removeRequestClassification`(Task 4)가 상세 페이지·editor·actions에서 일치. `createPresignedDownloadUrl`(Task 1)가 actions에서 사용. `Role` 타입은 기존 `src/lib/auth/roles.ts`에서 import.
- **보안:** 코치 화면은 페이지 레벨 코치 가드 + Server Action `assertCoach` + RLS(코치만 전체 조회·분류 관리). 비코치는 RLS로 데이터가 막히고 가드로 화면도 막힘.
- **R2 라이브 의존:** presigned GET URL 구조는 더미 키로 테스트, 실제 영상 재생은 R2 키 준비 후.
