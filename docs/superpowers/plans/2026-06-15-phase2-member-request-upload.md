# 온라인 코칭 시스템 — 2단계(회원 신청 + 영상 업로드) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 회원이 운동 종목을 고르고 메모를 적고 운동 영상을 R2에 직접 업로드해 코칭 요청을 생성하면, 요청이 `in_review` 상태로 만들어지고 선택한 종목이 분류로 연결되며, 본인 신청 목록에서 확인할 수 있다.

**Architecture:** 영상은 서버가 발급한 presigned PUT URL로 브라우저에서 Cloudflare R2(S3 호환)에 직접 업로드(서버 부하 0). 요청 생성은 회원의 인증 세션(Supabase SSR 서버 클라이언트)으로 수행해 RLS가 `member_id = auth.uid()`를 강제한다. 도메인 로직(요청 생성·목록·분류 조회)은 순수 함수로 분리해 로컬 Supabase에 대해 통합 테스트하고, Server Action은 인증 클라이언트를 주입하는 얇은 래퍼로 둔다. 회원이 자기 요청에 '회원 노출 축(운동 종목)' 태그만 달 수 있도록 RLS 정책을 추가한다.

**Tech Stack:** Next.js 16 Server Actions, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`(R2 presign), Supabase(Postgres/RLS), Vitest(통합 테스트는 로컬 Supabase 대상).

**Prerequisites:**
- 1단계 완료 상태(스키마·RLS·인증 존재). 로컬 Supabase 스택 기동 중(`npx supabase status`). `.env.local`에 Supabase 키 존재.
- 실제 클라우드 업로드 라이브 검증에는 Cloudflare R2 키가 필요하다(이 단계의 테스트는 더미 키로 presign 구조만 검증하고, 실제 PUT은 키 준비 후 검증).

---

## File Structure (이 단계에서 생성/수정되는 파일)

```
.env.local                                  # 더미 R2 값 추가(커밋 안 함)
supabase/migrations/0002_member_classification.sql  # 회원 종목 분류 삽입 허용 RLS
src/lib/storage/r2.ts                        # R2 presigned URL + object key 생성
src/lib/storage/r2.test.ts
src/lib/classification.ts                    # 회원 노출 축+태그 조회
src/lib/classification.test.ts
src/lib/requests.ts                          # 요청 생성/목록 도메인 로직
src/lib/requests.test.ts
src/test-helpers/users.ts                    # 테스트용 회원 생성/로그인 헬퍼
src/app/request/actions.ts                   # Server Actions(presign 발급, 요청 제출)
src/app/request/new/page.tsx                 # 신청 폼(서버: 종목 로드)
src/app/request/new/request-form.tsx         # 신청 폼(클라이언트: 업로드+제출)
src/app/requests/page.tsx                    # 내 신청 목록
src/app/dashboard/page.tsx                   # (수정) 신청하기/내 신청 링크 추가
```

---

## Task 1: R2 presigned 업로드 유틸리티

**Files:**
- Create: `src/lib/storage/r2.ts`
- Test: `src/lib/storage/r2.test.ts`
- Modify: `.env.local` (더미 R2 값 추가)

- [ ] **Step 1: SDK 설치**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: `.env.local`에 더미 R2 값 추가**

`.env.local` 끝에 아래를 추가(실제 키는 추후 사용자 제공 — 더미로도 presign 구조 검증 가능):

```bash
R2_ACCOUNT_ID=dummyaccount
R2_ACCESS_KEY_ID=dummyaccesskey
R2_SECRET_ACCESS_KEY=dummysecretkey
R2_BUCKET=coaching-videos
```

- [ ] **Step 3: 실패 테스트 작성**

`src/lib/storage/r2.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildVideoObjectKey, createPresignedUploadUrl } from './r2'

describe('buildVideoObjectKey', () => {
  it('회원 prefix 아래 확장자를 보존한 고유 키를 만든다', () => {
    const key = buildVideoObjectKey('user-123', 'squat.MP4')
    expect(key.startsWith('requests/user-123/')).toBe(true)
    expect(key.endsWith('.mp4')).toBe(true)
  })

  it('확장자가 없으면 mp4로 기본 처리한다', () => {
    const key = buildVideoObjectKey('u1', 'clip')
    expect(key.endsWith('.mp4')).toBe(true)
  })

  it('호출마다 다른 키를 만든다', () => {
    const a = buildVideoObjectKey('u1', 'a.mp4')
    const b = buildVideoObjectKey('u1', 'a.mp4')
    expect(a).not.toBe(b)
  })
})

describe('createPresignedUploadUrl', () => {
  it('버킷·키·서명이 포함된 PUT용 서명 URL을 반환한다', async () => {
    const key = 'requests/u1/abc.mp4'
    const url = await createPresignedUploadUrl(key, 'video/mp4')
    expect(url).toContain('coaching-videos')
    expect(url).toContain('requests/u1/abc.mp4')
    expect(url).toContain('X-Amz-Signature')
  })
})
```

- [ ] **Step 4: 테스트 실행 → 실패 확인**

Run: `npm test -- r2`
Expected: FAIL — `./r2` 없음

- [ ] **Step 5: 구현 작성**

`src/lib/storage/r2.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

/** 회원별 prefix 아래에 고유한 영상 object key를 만든다. 예: requests/<userId>/<uuid>.mp4 */
export function buildVideoObjectKey(userId: string, filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  const ext = match ? match[1].toLowerCase() : 'mp4'
  return `requests/${userId}/${randomUUID()}.${ext}`
}

/** R2에 직접 업로드(PUT)할 수 있는 presigned URL을 만든다. */
export async function createPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client(), command, { expiresIn })
}
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `npm test -- r2`
Expected: PASS (4 tests)

- [ ] **Step 7: 커밋**

```bash
git add src/lib/storage/r2.ts src/lib/storage/r2.test.ts package.json package-lock.json
git commit -m "feat: R2 presigned 업로드 URL 및 영상 object key 생성 유틸리티"
```

---

## Task 2: 회원 종목 분류 삽입 허용 RLS + 테스트 헬퍼

1단계 RLS는 `request_classifications` 삽입을 코치 전용으로 막았다. 회원이 신청 시 '운동 종목'(회원 노출 축)을 자기 요청에 달 수 있도록 정책을 추가한다.

**Files:**
- Create: `supabase/migrations/0002_member_classification.sql`
- Create: `src/test-helpers/users.ts`
- Test: `src/lib/requests-rls.test.ts`

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0002_member_classification.sql`:

```sql
-- 회원이 '자기 요청'에 '회원 노출 축(예: 운동 종목)'의 태그만 삽입할 수 있도록 허용
create policy "요청분류 생성(회원 종목)" on request_classifications for insert
with check (
  exists (
    select 1 from coaching_requests r
    where r.id = request_id and r.member_id = auth.uid()
  )
  and exists (
    select 1 from classification_tags t
    join classification_axes a on a.id = t.axis_id
    where t.id = tag_id and a.is_member_facing = true
  )
);
```

- [ ] **Step 2: 적용**

Run: `npx supabase db reset`
Expected: 0001 + 0002 마이그레이션 + 시드가 오류 없이 적용됨.

- [ ] **Step 3: 테스트 헬퍼 작성**

`src/test-helpers/users.ts` (테스트에서만 import):

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function adminClient(): SupabaseClient {
  return createClient(url, service, { auth: { persistSession: false } })
}

/** 확인된 회원 계정을 만들고, 그 회원으로 로그인된 클라이언트를 돌려준다. */
export async function createSignedInMember(
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
  await admin.from('profiles').upsert({ id, email, role: 'member' }, { onConflict: 'id' })
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'Passw0rd!123',
  })
  if (signInError) throw signInError
  return { id, client }
}

/** 테스트 회원 정리 */
export async function deleteUser(id: string): Promise<void> {
  const admin = adminClient()
  await admin.from('coaching_requests').delete().eq('member_id', id)
  await admin.auth.admin.deleteUser(id)
}
```

- [ ] **Step 4: RLS 동작 테스트 작성**

`src/lib/requests-rls.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, createSignedInMember, deleteUser } from '@/test-helpers/users'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function memberFacingTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin
    .from('classification_axes').select('id').eq('is_member_facing', true).single()
  const { data: tag } = await admin
    .from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return tag!.id as string
}

async function coachTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin
    .from('classification_axes').select('id').eq('is_member_facing', false).limit(1).single()
  const { data: tag } = await admin
    .from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return tag!.id as string
}

describe('회원 분류 삽입 RLS', () => {
  it('회원은 자기 요청에 회원 노출 태그를 달 수 있다', async () => {
    const m = await createSignedInMember(`rls_a_${Date.now()}@test.local`)
    created.push(m.id)
    const { data: req } = await m.client
      .from('coaching_requests').insert({ member_id: m.id, member_note: 't' }).select().single()
    const { error } = await m.client
      .from('request_classifications').insert({ request_id: req!.id, tag_id: await memberFacingTagId() })
    expect(error).toBeNull()
  })

  it('회원은 코치 전용 축 태그는 달 수 없다', async () => {
    const m = await createSignedInMember(`rls_b_${Date.now()}@test.local`)
    created.push(m.id)
    const { data: req } = await m.client
      .from('coaching_requests').insert({ member_id: m.id, member_note: 't' }).select().single()
    const { error } = await m.client
      .from('request_classifications').insert({ request_id: req!.id, tag_id: await coachTagId() })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `npm test -- requests-rls`
Expected: PASS (2 tests). 그리고 `npm test`로 전체 통과 확인.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0002_member_classification.sql src/test-helpers/users.ts src/lib/requests-rls.test.ts
git commit -m "feat: 회원이 자기 요청에 종목(회원 노출 축) 태그를 달 수 있는 RLS 정책 추가"
```

---

## Task 3: 회원 노출 분류 조회 헬퍼

신청 폼에서 보여줄 '운동 종목' 축과 그 태그 목록을 불러온다.

**Files:**
- Create: `src/lib/classification.ts`
- Test: `src/lib/classification.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/classification.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { adminClient } from '@/test-helpers/users'
import { getMemberFacingAxisWithTags } from './classification'

describe('getMemberFacingAxisWithTags', () => {
  it('운동 종목 축과 6개 태그를 정렬해 반환한다', async () => {
    const result = await getMemberFacingAxisWithTags(adminClient())
    expect(result?.axis.name).toBe('운동 종목')
    expect(result?.tags.map((t) => t.label)).toEqual([
      '스쿼트', '데드리프트', '벤치프레스', '푸시업', '런지', '플랭크',
    ])
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- classification`
Expected: FAIL — `./classification` 없음

- [ ] **Step 3: 구현 작성**

`src/lib/classification.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type ClassificationTag = { id: string; label: string }
export type MemberFacingAxis = {
  axis: { id: string; name: string }
  tags: ClassificationTag[]
}

/** 회원 노출 축(예: 운동 종목)과 그 태그들을 sort_order 순서로 반환한다. 없으면 null. */
export async function getMemberFacingAxisWithTags(
  supabase: SupabaseClient,
): Promise<MemberFacingAxis | null> {
  const { data: axis } = await supabase
    .from('classification_axes')
    .select('id, name')
    .eq('is_member_facing', true)
    .order('sort_order')
    .limit(1)
    .maybeSingle()
  if (!axis) return null

  const { data: tags } = await supabase
    .from('classification_tags')
    .select('id, label')
    .eq('axis_id', axis.id)
    .order('sort_order')

  return { axis, tags: tags ?? [] }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- classification`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/classification.ts src/lib/classification.test.ts
git commit -m "feat: 회원 노출 분류 축+태그 조회 헬퍼"
```

---

## Task 4: 요청 생성/목록 도메인 로직

**Files:**
- Create: `src/lib/requests.ts`
- Test: `src/lib/requests.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/requests.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, createSignedInMember, deleteUser } from '@/test-helpers/users'
import { createCoachingRequest, listMemberRequests } from './requests'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const admin = adminClient()
  const { data } = await admin.from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('createCoachingRequest', () => {
  it('영상키·메모·종목으로 요청을 만들고 분류를 연결한다', async () => {
    const m = await createSignedInMember(`req_a_${Date.now()}@test.local`)
    created.push(m.id)
    const objectKey = `requests/${m.id}/clip.mp4`
    const req = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '무릎이 아파요', objectKey,
    })
    expect(req.status).toBe('in_review')
    expect(req.video_object_key).toBe(objectKey)

    const admin = adminClient()
    const { count } = await admin
      .from('request_classifications').select('*', { count: 'exact', head: true }).eq('request_id', req.id)
    expect(count).toBe(1)
  })

  it('다른 사람 prefix의 영상키는 거부한다', async () => {
    const m = await createSignedInMember(`req_b_${Date.now()}@test.local`)
    created.push(m.id)
    await expect(
      createCoachingRequest(m.client, {
        memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: 'requests/someone-else/clip.mp4',
      }),
    ).rejects.toThrow()
  })
})

describe('listMemberRequests', () => {
  it('본인 요청만 최신순으로 반환한다', async () => {
    const m = await createSignedInMember(`req_c_${Date.now()}@test.local`)
    created.push(m.id)
    await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '1', objectKey: `requests/${m.id}/a.mp4`,
    })
    const list = await listMemberRequests(m.client, m.id)
    expect(list.length).toBe(1)
    expect(list[0].member_note).toBe('1')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- "requests.test"`
Expected: FAIL — `./requests` 없음

- [ ] **Step 3: 구현 작성**

`src/lib/requests.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export type CoachingRequest = {
  id: string
  member_id: string
  member_note: string | null
  video_object_key: string | null
  status: string
  created_at: string
}

export type NewCoachingRequest = {
  memberId: string
  tagId: string
  note: string
  objectKey: string
}

/** 영상 object key가 해당 회원의 prefix(requests/<memberId>/) 아래인지 검증한다. */
export function isOwnedObjectKey(memberId: string, objectKey: string): boolean {
  return objectKey.startsWith(`requests/${memberId}/`)
}

/** 코칭 요청을 만들고 선택한 종목 태그를 연결한다. 회원의 인증 클라이언트로 호출(RLS 적용). */
export async function createCoachingRequest(
  supabase: SupabaseClient,
  input: NewCoachingRequest,
): Promise<CoachingRequest> {
  if (!isOwnedObjectKey(input.memberId, input.objectKey)) {
    throw new Error('영상 키가 본인 소유 경로가 아닙니다.')
  }

  const { data: req, error } = await supabase
    .from('coaching_requests')
    .insert({
      member_id: input.memberId,
      member_note: input.note,
      video_object_key: input.objectKey,
      video_uploaded_at: new Date().toISOString(),
    })
    .select()
    .single()
  if (error || !req) throw new Error(error?.message ?? '요청 생성 실패')

  const { error: tagError } = await supabase
    .from('request_classifications')
    .insert({ request_id: req.id, tag_id: input.tagId })
  if (tagError) {
    // 분류 연결 실패 시 방금 만든 요청을 롤백(고아 요청 방지)
    await supabase.from('coaching_requests').delete().eq('id', req.id)
    throw new Error(tagError.message)
  }

  return req as CoachingRequest
}

/** 회원 본인의 요청 목록(최신순). RLS가 본인 것만 노출. */
export async function listMemberRequests(
  supabase: SupabaseClient,
  memberId: string,
): Promise<CoachingRequest[]> {
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachingRequest[]
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- "requests.test"`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/requests.ts src/lib/requests.test.ts
git commit -m "feat: 코칭 요청 생성/목록 도메인 로직(영상키 소유 검증 포함)"
```

---

## Task 5: Server Actions (presign 발급 + 요청 제출)

도메인 로직(Task 1·4)을 인증 세션으로 감싸는 얇은 Server Action.

**Files:**
- Create: `src/app/request/actions.ts`

- [ ] **Step 1: 구현 작성**

`src/app/request/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { buildVideoObjectKey, createPresignedUploadUrl } from '@/lib/storage/r2'
import { createCoachingRequest } from '@/lib/requests'

/** 로그인한 회원에게 본인 prefix의 presigned 업로드 URL과 object key를 발급한다. */
export async function requestUploadUrl(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const objectKey = buildVideoObjectKey(user.id, filename)
  const uploadUrl = await createPresignedUploadUrl(objectKey, contentType)
  return { uploadUrl, objectKey }
}

/** 업로드된 영상 key로 코칭 요청을 생성한다. */
export async function submitCoachingRequest(input: {
  tagId: string
  note: string
  objectKey: string
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const req = await createCoachingRequest(supabase, {
    memberId: user.id,
    tagId: input.tagId,
    note: input.note,
    objectKey: input.objectKey,
  })
  return { id: req.id }
}
```

- [ ] **Step 2: 타입체크 + 빌드 검증**

(Server Action은 요청 컨텍스트 의존이라 단위 테스트 대신 타입체크/빌드로 검증 — 핵심 로직은 Task 1·4에서 테스트됨)

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add src/app/request/actions.ts
git commit -m "feat: 영상 업로드 URL 발급/요청 제출 Server Action"
```

---

## Task 6: 신청 폼 UI

**Files:**
- Create: `src/app/request/new/page.tsx`
- Create: `src/app/request/new/request-form.tsx`

- [ ] **Step 1: 서버 페이지(종목 로드) 작성**

`src/app/request/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMemberFacingAxisWithTags } from '@/lib/classification'
import { RequestForm } from './request-form'

export default async function NewRequestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const axis = await getMemberFacingAxisWithTags(supabase)

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">코칭 신청</h1>
      <RequestForm
        axisName={axis?.axis.name ?? '운동 종목'}
        tags={axis?.tags ?? []}
      />
    </main>
  )
}
```

- [ ] **Step 2: 클라이언트 폼(업로드+제출) 작성**

`src/app/request/new/request-form.tsx`:

```tsx
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
      await submitCoachingRequest({ tagId, note, objectKey })
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

      {error && <p className="text-sm text-red-500">{error}</p>}

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
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/request/new` 라우트 포함)

- [ ] **Step 4: 커밋**

```bash
git add src/app/request/new/page.tsx src/app/request/new/request-form.tsx
git commit -m "feat: 코칭 신청 폼 UI(종목 선택·메모·영상 업로드)"
```

---

## Task 7: 내 신청 목록 + 대시보드 링크

**Files:**
- Create: `src/app/requests/page.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 신청 목록 페이지 작성**

`src/app/requests/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listMemberRequests } from '@/lib/requests'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function RequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requests = await listMemberRequests(supabase, user.id)

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">내 코칭함</h1>
        <Link href="/request/new" className="rounded-md bg-black px-3 py-2 text-sm text-white">
          새 신청
        </Link>
      </div>

      {requests.length === 0 ? (
        <p className="text-gray-500">아직 신청한 코칭이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border p-3">
              <p className="text-sm text-gray-500">
                {new Date(r.created_at).toLocaleDateString('ko-KR')}
              </p>
              <p className="font-medium">{STATUS_LABEL[r.status] ?? r.status}</p>
              {r.member_note && <p className="mt-1 text-sm">{r.member_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: 대시보드에 링크 추가**

`src/app/dashboard/page.tsx`의 `return (...)` 안, 환영 문구 `<p>` 다음에 링크 블록을 추가한다. 파일 전체를 아래로 교체:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name')
    .eq('id', user.id)
    .single()

  return (
    <main className="p-8">
      <h1 className="text-xl font-bold">
        {profile?.role === 'coach' ? '코치 대시보드' : '내 코칭함'}
      </h1>
      <p className="mt-2 text-gray-500">{profile?.name ?? user.email} 님 환영합니다.</p>

      <div className="mt-6 flex gap-3">
        <Link href="/request/new" className="rounded-md bg-black px-4 py-2 text-white">
          코칭 신청하기
        </Link>
        <Link href="/requests" className="rounded-md border px-4 py-2">
          내 신청 보기
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 타입체크 + 빌드 + 미인증 리다이렉트 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/requests` 라우트 포함)

미인증 보호 확인(미들웨어는 `/dashboard`만 보호하므로 `/requests`·`/request/new`는 페이지 내부 `redirect('/login')`로 보호됨): 개발 서버에서
`curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/requests`
Expected: 307 → `/login` (페이지의 redirect)

- [ ] **Step 4: 커밋**

```bash
git add src/app/requests/page.tsx src/app/dashboard/page.tsx
git commit -m "feat: 내 신청 목록 페이지 + 대시보드 신청 링크"
```

---

## 2단계 완료 기준 (Definition of Done)

- [ ] `npm test` 전부 통과 (r2, requests-rls, classification, requests, 기존 1단계 테스트)
- [ ] `npx tsc --noEmit` 오류 없음
- [ ] `npm run build` 성공 (`/request/new`, `/requests` 포함)
- [ ] 회원이 종목·메모·영상으로 요청을 만들면 `coaching_requests`(in_review) + `request_classifications`(종목)가 생성됨 (통합 테스트로 검증)
- [ ] 영상 object key 소유 검증·회원 분류 RLS가 동작 (테스트로 검증)
- [ ] **(라이브, R2 키 필요)** 실제 브라우저→R2 업로드 + 신청 end-to-end — R2 키 준비 후 검증

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** 설계 '회원 신청 플로우'(종목 선택+메모+영상 업로드→in_review) → Task 1·4·5·6. 분류 연결(회원=종목) → Task 2(RLS)·3·4. 신청 확인/목록 → Task 7. 결제는 설계상 보류(범위 외). 코치 피드백·열람은 3·4단계.
- **플레이스홀더:** 없음. 모든 코드/명령 포함.
- **타입 일관성:** `createCoachingRequest(supabase, {memberId, tagId, note, objectKey})`가 Task 4 정의·Task 5 호출에서 일치. `requestUploadUrl`/`submitCoachingRequest` 시그니처가 actions(Task 5)·폼(Task 6)에서 일치. `getMemberFacingAxisWithTags`가 Task 3 정의·Task 6 사용에서 일치. `buildVideoObjectKey`/`createPresignedUploadUrl`가 Task 1 정의·Task 5 사용에서 일치.
- **보안:** 영상 키 소유 prefix 검증(Task 4) + 회원 분류 RLS(Task 2) + Server Action 인증 확인(Task 5). presigned URL은 서버에서만 발급(R2 비밀키 노출 없음).
- **R2 라이브 의존:** 테스트는 더미 키로 presign 구조만 검증. 실제 업로드는 R2 키 준비 후 별도 라이브 검증.
