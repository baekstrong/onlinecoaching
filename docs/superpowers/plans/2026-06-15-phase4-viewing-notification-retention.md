# 온라인 코칭 시스템 — 4단계(열람 + 알림 + 보관) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 자기 요청 상세에서 영상과 발행된 피드백(텍스트·이미지)을 열람하고, 코치가 피드백을 발행하면 회원에게 이메일 알림이 가며, 90일 지난 영상은 자동 삭제(R2 객체 삭제 + DB 키 제거)된다.

**Architecture:** 회원 열람은 회원의 인증 세션으로 기존 도메인 함수(getRequestDetail/getFeedbackForRequest/listFeedbackAssets)를 호출하면 RLS가 '본인 요청 + 발행된 피드백/자산'만 노출한다(3b E2E로 검증됨). 영상·이미지는 R2 presigned GET. 이메일은 Resend(키 없으면 no-op). 보관은 service_role로 90일 지난 영상을 찾아 R2 객체를 삭제하고 `video_object_key`를 null로 비우는 도메인 함수 + CRON_SECRET로 보호되는 API 라우트(외부 스케줄러가 매일 호출). 운영에선 R2 버킷 라이프사이클 규칙을 함께 두는 것을 권장.

**Tech Stack:** Next.js 16 Server Components/Route Handlers, Supabase(RLS), `@aws-sdk/*`(R2 presign·delete), `resend`(이메일), Vitest.

**Prerequisites:** 1·2·3 완료. 로컬 Supabase 기동. `.env.local`에 Supabase + 더미 R2 키. 라이브 검증(실제 이메일 발송/영상 삭제/스케줄)은 Resend·R2 키 + cron 설정 후.

---

## File Structure

```
src/app/requests/[id]/page.tsx                # 회원 요청 상세(영상·상태·발행 피드백 열람)
src/lib/email.ts                              # 피드백 발행 이메일(Resend, 키 없으면 no-op)
src/lib/email.test.ts
src/app/coach/actions.ts                      # (수정) 발행 시 이메일 알림 호출
src/lib/storage/r2.ts                         # (수정) deleteObject 추가
src/lib/retention.ts                          # 90일 지난 영상 만료(객체 삭제 + 키 null)
src/lib/retention.test.ts
src/app/api/cron/expire-videos/route.ts       # CRON_SECRET 보호 보관 작업 엔드포인트
src/app/requests/page.tsx                     # (수정) 항목에 상세 링크
.env.example                                  # (수정) RESEND_API_KEY, EMAIL_FROM, CRON_SECRET
```

---

## Task 1: 회원 요청 상세(피드백 열람)

**Files:**
- Create: `src/app/requests/[id]/page.tsx`
- Modify: `src/app/requests/page.tsx` (항목 → 상세 링크)

- [ ] **Step 1: 회원 상세 페이지 작성** — `src/app/requests/[id]/page.tsx`:

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestDetail } from '@/lib/requests'
import { getFeedbackForRequest, listFeedbackAssets } from '@/lib/feedback'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'

const STATUS_LABEL: Record<string, string> = {
  in_review: '검토중',
  completed: '완료',
  expired: '만료',
}

export default async function MemberRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const request = await getRequestDetail(supabase, id)
  if (!request) notFound()

  // RLS: 본인 요청의 발행된 피드백/자산만 조회됨
  const feedback = await getFeedbackForRequest(supabase, id)
  const published = feedback?.published_at != null

  const [videoUrl, assetViews] = await Promise.all([
    request.video_object_key ? createPresignedDownloadUrl(request.video_object_key) : Promise.resolve(null),
    published && feedback
      ? listFeedbackAssets(supabase, feedback.id).then((assets) =>
          Promise.all(assets.map(async (a) => createPresignedDownloadUrl(a.object_key))),
        )
      : Promise.resolve([] as string[]),
  ])

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">내 코칭</h1>
      <p className="text-sm text-gray-500">상태: {STATUS_LABEL[request.status] ?? request.status}</p>

      {videoUrl ? (
        <video src={videoUrl} controls className="w-full rounded-md border" />
      ) : (
        <p className="text-sm text-gray-400">영상이 만료되었거나 없습니다.</p>
      )}

      <section>
        <h2 className="text-sm font-medium text-gray-500">내 메모</h2>
        <p className="mt-1 whitespace-pre-wrap">{request.member_note ?? '(없음)'}</p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-gray-500">코치 피드백</h2>
        {published && feedback ? (
          <>
            <p className="mt-1 whitespace-pre-wrap">{feedback.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {assetViews.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt="피드백 이미지" className="max-h-60 rounded border" />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-1 text-gray-400">아직 피드백이 발행되지 않았습니다.</p>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: 목록에서 상세로 링크** — `src/app/requests/page.tsx`에서 각 `<li>`의 내용을 `<Link>`로 감싼다. 기존 `<li key={r.id} className="rounded-md border p-3"> ... </li>` 내부를 아래로 교체:

```tsx
            <li key={r.id} className="rounded-md border p-3">
              <Link href={`/requests/${r.id}`} className="block">
                <p className="text-sm text-gray-500">
                  {new Date(r.created_at).toLocaleDateString('ko-KR')}
                </p>
                <p className="font-medium">{STATUS_LABEL[r.status] ?? r.status}</p>
                {r.member_note && <p className="mt-1 text-sm">{r.member_note}</p>}
              </Link>
            </li>
```

(파일 상단에 `import Link from 'next/link'`가 이미 있는지 확인 — 있음.)

- [ ] **Step 3: 타입체크 + 빌드 + 가드 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/requests/[id]` 포함)

미인증 확인: `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/requests/some-id` → 307 → /login

- [ ] **Step 4: 커밋**

```bash
git add "src/app/requests/[id]/page.tsx" src/app/requests/page.tsx
git commit -m "feat: 회원 요청 상세(영상·발행 피드백·이미지 열람)"
```

---

## Task 2: 피드백 발행 이메일 알림 (Resend)

**Files:**
- Create: `src/lib/email.ts`, `src/lib/email.test.ts`
- Modify: `src/app/coach/actions.ts` (발행 시 호출)
- Modify: `.env.example`

- [ ] **Step 1: 패키지 설치 + env 템플릿**

```bash
npm install resend
```

`.env.example` 끝에 추가:
```bash
# 이메일 알림(Resend). 키 없으면 알림은 생략(no-op)
RESEND_API_KEY=
EMAIL_FROM=

# 보관 cron 보호용 시크릿
CRON_SECRET=
```

- [ ] **Step 2: 실패 테스트 작성** — `src/lib/email.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { sendFeedbackPublishedEmail } from './email'

describe('sendFeedbackPublishedEmail', () => {
  beforeEach(() => { delete process.env.RESEND_API_KEY })

  it('RESEND_API_KEY가 없으면 발송하지 않고 false를 반환한다', async () => {
    const sent = await sendFeedbackPublishedEmail('user@x.com', 'req-1')
    expect(sent).toBe(false)
  })
})
```

- [ ] **Step 3: 실행 → 실패 확인**

Run: `npm test -- "email.test"`
Expected: FAIL — `./email` 없음

- [ ] **Step 4: 구현 작성** — `src/lib/email.ts`:

```ts
/** 피드백 발행 알림 이메일. RESEND_API_KEY 미설정 시 no-op(false). 성공 시 true. */
export async function sendFeedbackPublishedEmail(to: string, requestId: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY 미설정 — 이메일 알림을 건너뜁니다.')
    return false
  }
  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  const base = process.env.APP_URL ?? ''
  const link = `${base}/requests/${requestId}`
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
    to,
    subject: '코칭 피드백이 도착했습니다',
    html: `<p>요청하신 운동 코칭 피드백이 발행되었습니다.</p><p><a href="${link}">피드백 보러 가기</a></p>`,
  })
  return true
}
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test -- "email.test"`
Expected: PASS (1 test)

- [ ] **Step 6: 발행 액션에서 호출** — `src/app/coach/actions.ts`의 import에 추가:
```ts
import { sendFeedbackPublishedEmail } from '@/lib/email'
import { getRequestDetail } from '@/lib/requests'
```
(getRequestDetail가 이미 import되어 있으면 중복 추가하지 말 것.)

`publishFeedbackAction`을 아래로 교체:
```ts
/** (코치) 피드백 발행 + 회원에게 이메일 알림 */
export async function publishFeedbackAction(requestId: string): Promise<void> {
  const supabase = await assertCoach()
  const fb = await getFeedbackForRequest(supabase, requestId)
  if (!fb) throw new Error('저장된 피드백이 없습니다.')
  await publishFeedback(supabase, fb.id)

  // 회원 이메일 조회 후 알림(실패해도 발행은 성공 처리)
  try {
    const req = await getRequestDetail(supabase, requestId)
    if (req) {
      const { data: profile } = await supabase.from('profiles').select('email').eq('id', req.member_id).maybeSingle()
      if (profile?.email) await sendFeedbackPublishedEmail(profile.email, requestId)
    }
  } catch (e) {
    console.error('피드백 알림 이메일 실패:', e)
  }
}
```
(`getFeedbackForRequest`, `publishFeedback`는 이미 import됨.)

- [ ] **Step 7: 타입체크 + 빌드 + 테스트**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공

Run: `npm test`
Expected: 전체 통과

- [ ] **Step 8: 커밋**

```bash
git add src/lib/email.ts src/lib/email.test.ts src/app/coach/actions.ts .env.example package.json package-lock.json
git commit -m "feat: 피드백 발행 시 회원 이메일 알림(Resend, 키 없으면 생략)"
```

---

## Task 3: 90일 영상 보관 만료 도메인

**Files:**
- Modify: `src/lib/storage/r2.ts` (deleteObject 추가)
- Create: `src/lib/retention.ts`, `src/lib/retention.test.ts`

- [ ] **Step 1: R2 객체 삭제 추가** — `src/lib/storage/r2.ts`의 client import에 `DeleteObjectCommand` 추가:
```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
```
파일 끝에 추가:
```ts
/** R2 객체 삭제. */
export async function deleteObject(objectKey: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: objectKey }))
}
```

- [ ] **Step 2: 실패 테스트 작성** — `src/lib/retention.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import { expireOldRequestVideos } from './retention'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('expireOldRequestVideos', () => {
  it('90일 지난 영상은 키를 비우고, 최근 영상은 유지한다', async () => {
    const m = await createSignedInMember(`ret_${Date.now()}@test.local`)
    created.push(m.id)
    const admin = adminClient()

    const oldReq = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: 'old', objectKey: `requests/${m.id}/old.mp4`,
    })
    const newReq = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: 'new', objectKey: `requests/${m.id}/new.mp4`,
    })
    // old 요청의 업로드 시각을 100일 전으로 조작
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    await admin.from('coaching_requests').update({ video_uploaded_at: past }).eq('id', oldReq.id)

    const deleted: string[] = []
    const count = await expireOldRequestVideos(admin, async (key) => { deleted.push(key) }, new Date())

    expect(count).toBe(1)
    expect(deleted).toContain(`requests/${m.id}/old.mp4`)

    const { data: oldAfter } = await admin.from('coaching_requests').select('video_object_key').eq('id', oldReq.id).single()
    const { data: newAfter } = await admin.from('coaching_requests').select('video_object_key').eq('id', newReq.id).single()
    expect(oldAfter!.video_object_key).toBeNull()
    expect(newAfter!.video_object_key).toBe(`requests/${m.id}/new.mp4`)
  })
})
```

- [ ] **Step 3: 실행 → 실패 확인**

Run: `npm test -- retention`
Expected: FAIL — `./retention` 없음

- [ ] **Step 4: 구현 작성** — `src/lib/retention.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

const RETENTION_DAYS = 90

/**
 * 90일 지난 영상을 만료시킨다: R2 객체 삭제 후 video_object_key를 null로.
 * deleteFn은 R2 삭제 함수(테스트에서 주입). admin(service_role) 클라이언트로 호출.
 * 반환: 만료 처리한 요청 수.
 */
export async function expireOldRequestVideos(
  supabase: SupabaseClient,
  deleteFn: (objectKey: string) => Promise<void>,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('id, video_object_key')
    .lt('video_uploaded_at', cutoff)
    .not('video_object_key', 'is', null)
  if (error) throw new Error(error.message)

  let count = 0
  for (const r of data ?? []) {
    const key = r.video_object_key as string
    try {
      await deleteFn(key)
    } catch (e) {
      // 객체 삭제 실패해도 DB는 비워 다음 실행에서 재시도되지 않도록(고아 객체는 R2 라이프사이클이 정리)
      console.error('R2 객체 삭제 실패:', key, e)
    }
    const { error: updError } = await supabase
      .from('coaching_requests')
      .update({ video_object_key: null })
      .eq('id', r.id)
    if (updError) throw new Error(updError.message)
    count++
  }
  return count
}
```

- [ ] **Step 5: 실행 → 통과 확인**

Run: `npm test -- retention`
Expected: PASS (1 test). 전체 `npm test`도 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/storage/r2.ts src/lib/retention.ts src/lib/retention.test.ts
git commit -m "feat: 90일 영상 보관 만료 도메인(R2 객체 삭제 + 키 제거)"
```

---

## Task 4: 보관 cron 라우트 + 문서

**Files:**
- Create: `src/app/api/cron/expire-videos/route.ts`
- Modify: `CLAUDE.md` 또는 README(설계 문서)에 cron·라이프사이클 안내 — 여기선 `docs`에 메모

- [ ] **Step 1: cron 라우트 작성** — `src/app/api/cron/expire-videos/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { expireOldRequestVideos } from '@/lib/retention'
import { deleteObject } from '@/lib/storage/r2'

/** 외부 스케줄러가 매일 1회 호출. Authorization: Bearer <CRON_SECRET> 필요. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const count = await expireOldRequestVideos(admin, deleteObject, new Date())
  return NextResponse.json({ expired: count })
}
```

- [ ] **Step 2: 타입체크 + 빌드 + 인증 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run build`
Expected: 빌드 성공 (`/api/cron/expire-videos` 포함)

개발 서버에서 시크릿 없이 호출 → 401 확인:
`curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/cron/expire-videos`
Expected: 401

- [ ] **Step 3: 운영 안내 메모 작성** — `docs/superpowers/specs/2026-06-15-online-coaching-system-design.md` 끝에 추가:

```markdown
## 운영 메모 (4단계)
- 영상 90일 보관: 외부 스케줄러(예: Vercel Cron, GitHub Actions, cron-job.org)가 매일 1회
  `POST /api/cron/expire-videos` 를 `Authorization: Bearer $CRON_SECRET` 헤더로 호출한다.
- 추가 안전망으로 Cloudflare R2 버킷에 90일 라이프사이클 규칙을 설정하면, 앱이 놓친 객체도 정리된다.
- 이메일 알림: Resend 키(`RESEND_API_KEY`)와 검증된 발신 도메인(`EMAIL_FROM`) 설정 시 활성화.
```

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/cron/expire-videos/route.ts docs/superpowers/specs/2026-06-15-online-coaching-system-design.md
git commit -m "feat: 보관 만료 cron 라우트(CRON_SECRET 보호) + 운영 메모"
```

---

## 4단계 완료 기준 (Definition of Done)

- [ ] `npm test` 전부 통과 (email 1, retention 1, 기존)
- [ ] `npx tsc --noEmit` 오류 없음
- [ ] `npm run build` 성공 (`/requests/[id]`, `/api/cron/expire-videos` 포함)
- [ ] 회원이 본인 요청 상세에서 영상·발행 피드백·이미지를 열람 (RLS로 발행된 것만)
- [ ] 90일 지난 영상은 만료 함수가 키를 null로, 최근 영상은 유지 (테스트로 검증)
- [ ] cron 라우트는 CRON_SECRET 없이는 401
- [ ] **(라이브, 키 필요)** 실제 이메일 발송(Resend) · 실제 R2 객체 삭제 · cron 스케줄 — 키/스케줄 준비 후 검증

---

## Self-Review (작성자 점검)

- **스펙 커버리지:** 설계 '회원 결과 확인 플로우'(알림→코칭함→피드백 열람) → Task 1·2. '영상 90일 자동삭제, 피드백 영구 보관' → Task 3·4. 이메일 알림 → Task 2.
- **플레이스홀더:** 없음. 모든 코드/명령 포함.
- **타입 일관성:** `getRequestDetail/getFeedbackForRequest/listFeedbackAssets`(기존)가 회원 페이지(Task 1)·발행 액션(Task 2)에서 재사용. `sendFeedbackPublishedEmail(to, requestId)`(Task 2)가 발행 액션에서 일치. `expireOldRequestVideos(supabase, deleteFn, now)`(Task 3)가 cron 라우트(Task 4)에서 일치. `deleteObject`(Task 3)가 cron에서 사용. `createPresignedDownloadUrl`(3a) 재사용.
- **보안:** 회원 페이지는 RLS로 본인+발행분만(별도 가드 불필요하나 미인증은 /login). cron은 CRON_SECRET. 이메일 발송 실패가 발행을 막지 않도록 try/catch.
- **라이브 의존:** 이메일/삭제/스케줄은 키·cron 준비 후. 테스트는 no-op(이메일)·주입 mock(삭제)로 로직 검증.
