# 온라인 코칭 시스템 — 1단계(기반) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 카카오 로그인이 되는 Next.js 앱과, 코칭 시스템 전체 DB 스키마(분류 체계 포함)를 갖춘 기반을 만든다.

**Architecture:** Next.js(App Router, TypeScript) 단일 코드베이스. Supabase(Postgres + Auth + RLS)를 백엔드로, 영상은 추후 단계에서 Cloudflare R2 연동. 인증은 Supabase의 카카오 OAuth + `@supabase/ssr` 쿠키 세션. 첫 로그인 시 `profiles` 행을 만들고, 지정된 코치 이메일이면 `coach` 역할을 부여한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Supabase(Postgres/Auth), `@supabase/ssr`, `@supabase/supabase-js`, Vitest + Testing Library(테스트), Supabase CLI(로컬 DB·마이그레이션).

**Prerequisites (실행 환경):**
- Node.js 20+ / npm
- Docker Desktop 실행 중 (Supabase 로컬 스택 구동에 필요)
- Supabase CLI 설치: `npm i -g supabase` 또는 `brew install supabase/tap/supabase`

---

## File Structure (이 단계에서 생성/수정되는 파일)

```
package.json                       # 의존성·스크립트
next.config.ts                     # Next 설정
tsconfig.json                      # TS 설정
vitest.config.ts                   # 테스트 러너 설정
vitest.setup.ts                    # 테스트 전역 설정(jest-dom)
.env.example                       # 환경변수 템플릿(커밋됨)
.env.local                         # 실제 비밀값(커밋 안 함)
src/app/layout.tsx                 # 루트 레이아웃
src/app/page.tsx                   # 랜딩 페이지
src/app/login/page.tsx             # 로그인 페이지(카카오 버튼)
src/app/auth/callback/route.ts     # OAuth 콜백(코드→세션 교환 + 프로필 보장)
src/app/dashboard/page.tsx         # 로그인 후 진입 페이지(역할별 분기)
src/lib/supabase/client.ts         # 브라우저용 Supabase 클라이언트
src/lib/supabase/server.ts         # 서버용 Supabase 클라이언트
src/lib/supabase/middleware.ts     # 세션 갱신 헬퍼
src/lib/auth/roles.ts              # 역할 판정 로직(코치 이메일 판별)
middleware.ts                      # 전역 미들웨어(세션 갱신·보호 라우트)
supabase/config.toml               # Supabase 로컬 설정(supabase init 생성)
supabase/migrations/0001_init.sql  # 전체 스키마 + RLS
supabase/seed.sql                  # 분류 체계 초기 시드
src/lib/auth/roles.test.ts         # 역할 판정 단위 테스트
src/lib/db/schema.test.ts          # 스키마 통합 테스트(로컬 DB 대상)
```

---

## Task 1: 프로젝트 스캐폴드 + 테스트 인프라

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx` (create-next-app 생성)
- Create: `vitest.config.ts`, `vitest.setup.ts`
- Create: `src/lib/sanity.test.ts`

- [ ] **Step 1: Next.js 프로젝트 생성**

현재 디렉터리(프로젝트 루트)에서 실행:

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm
```

프롬프트가 나오면 기존 파일(CLAUDE.md 등) 유지를 선택. 생성 후 `src/app/page.tsx`, `src/app/layout.tsx`가 존재해야 함.

- [ ] **Step 2: 테스트 의존성 설치**

```bash
npm install -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Vitest 설정 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

`vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: package.json 테스트 스크립트 추가**

`package.json`의 `"scripts"`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 인프라 검증용 실패 테스트 작성**

`src/lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { greet } from './sanity'

describe('sanity', () => {
  it('테스트 러너가 동작한다', () => {
    expect(greet('coach')).toBe('Hello, coach')
  })
})
```

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `npm test`
Expected: FAIL — `./sanity` 모듈을 찾을 수 없음.

- [ ] **Step 7: 최소 구현 작성**

`src/lib/sanity.ts`:

```ts
export function greet(name: string): string {
  return `Hello, ${name}`
}
```

- [ ] **Step 8: 테스트 실행 → 통과 확인**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 9: .gitignore 확인 후 커밋**

`.gitignore`에 `.env.local`, `node_modules`, `.next`가 포함되어 있는지 확인(create-next-app이 추가함). 없으면 추가.

```bash
git add -A
git commit -m "chore: Next.js 스캐폴드 및 Vitest 테스트 인프라 구성"
```

---

## Task 2: 환경변수 + Supabase 로컬 스택

**Files:**
- Create: `.env.example`
- Create: `supabase/config.toml` (supabase init 생성)

- [ ] **Step 1: Supabase 로컬 프로젝트 초기화**

```bash
supabase init
```

`supabase/config.toml`이 생성됨. 프롬프트(VS Code 설정 등)는 기본값(N)으로.

- [ ] **Step 2: 로컬 스택 기동**

```bash
supabase start
```

출력되는 `API URL`(보통 `http://127.0.0.1:54321`)과 `anon key`, `service_role key`를 기록해 둠. (Docker 필요)

- [ ] **Step 3: 환경변수 템플릿 작성**

`.env.example` (커밋됨 — 실제 값 아님, 키 이름만):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 코치(관리자) 계정으로 지정할 이메일 — 이 이메일로 로그인하면 coach 역할 부여
COACH_EMAIL=

# (추후 단계) Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
```

- [ ] **Step 4: 실제 로컬 값으로 .env.local 작성**

`.env.local` (커밋 안 함). `supabase start`가 출력한 값으로 채움:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start가 출력한 anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start가 출력한 service_role key>
COACH_EMAIL=qortmdejr123@gmail.com
```

- [ ] **Step 5: 커밋**

```bash
git add .env.example supabase/config.toml
git commit -m "chore: Supabase 로컬 스택 초기화 및 환경변수 템플릿 추가"
```

---

## Task 3: 데이터베이스 스키마 마이그레이션 (전체 테이블 + RLS)

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `src/lib/db/schema.test.ts`

설계 문서(섹션 5)의 모든 테이블을 정의한다. 인증 사용자는 Supabase `auth.users`에 저장되고, 앱 프로필은 `profiles`가 `auth.users.id`를 참조한다.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/0001_init.sql`:

```sql
-- ===== 역할/상태 enum =====
create type user_role as enum ('member', 'coach');
create type request_status as enum ('in_review', 'completed', 'expired');

-- ===== profiles: auth.users 1:1 확장 =====
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'member',
  name text,
  email text,
  created_at timestamptz not null default now()
);

-- ===== 분류 체계 =====
create table classification_axes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_member_facing boolean not null default false,
  allow_multiple boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table classification_tags (
  id uuid primary key default gen_random_uuid(),
  axis_id uuid not null references classification_axes(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ===== 코칭 요청(케이스) =====
create table coaching_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id) on delete cascade,
  member_note text,
  video_object_key text,
  video_uploaded_at timestamptz,
  status request_status not null default 'in_review',
  price int,
  created_at timestamptz not null default now()
);

-- 케이스 ↔ 분류 태그 (N:M)
create table request_classifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references coaching_requests(id) on delete cascade,
  tag_id uuid not null references classification_tags(id) on delete cascade,
  unique (request_id, tag_id)
);

-- ===== 피드백 =====
create table feedbacks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references coaching_requests(id) on delete cascade,
  body_rich jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table feedback_assets (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedbacks(id) on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now()
);

-- ===== 피드백 템플릿(코치 전용) =====
create table feedback_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  category text,
  body_rich jsonb,
  created_at timestamptz not null default now()
);

-- ===== 결제(추후 구현, 스키마만 예약) =====
create table payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references coaching_requests(id) on delete cascade,
  amount int not null,
  provider text,
  status text,
  paid_at timestamptz
);

-- ===== 역할 판정 헬퍼 =====
create or replace function is_coach()
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'coach'
  );
$$;

-- ===== RLS 활성화 =====
alter table profiles enable row level security;
alter table classification_axes enable row level security;
alter table classification_tags enable row level security;
alter table coaching_requests enable row level security;
alter table request_classifications enable row level security;
alter table feedbacks enable row level security;
alter table feedback_assets enable row level security;
alter table feedback_templates enable row level security;
alter table payments enable row level security;

-- profiles: 본인 행 조회/수정, 코치는 전체 조회
create policy "본인 프로필 조회" on profiles for select using (id = auth.uid() or is_coach());
create policy "본인 프로필 수정" on profiles for update using (id = auth.uid());

-- 분류 체계: 모두 조회 가능, 코치만 변경
create policy "분류축 조회" on classification_axes for select using (true);
create policy "분류축 관리" on classification_axes for all using (is_coach()) with check (is_coach());
create policy "분류값 조회" on classification_tags for select using (true);
create policy "분류값 관리" on classification_tags for all using (is_coach()) with check (is_coach());

-- 코칭 요청: 본인 것 + 코치는 전체
create policy "요청 조회" on coaching_requests for select using (member_id = auth.uid() or is_coach());
create policy "요청 생성" on coaching_requests for insert with check (member_id = auth.uid());
create policy "요청 수정(코치)" on coaching_requests for update using (is_coach());

-- 요청-분류 매핑: 코치만 변경, 조회는 해당 요청 접근권 따름
create policy "요청분류 조회" on request_classifications for select using (
  exists (select 1 from coaching_requests r where r.id = request_id and (r.member_id = auth.uid() or is_coach()))
);
create policy "요청분류 관리(코치)" on request_classifications for all using (is_coach()) with check (is_coach());

-- 피드백: 발행된 것은 해당 요청 회원 + 코치, 작성/수정은 코치
create policy "피드백 조회" on feedbacks for select using (
  is_coach() or exists (
    select 1 from coaching_requests r
    where r.id = request_id and r.member_id = auth.uid() and published_at is not null
  )
);
create policy "피드백 관리(코치)" on feedbacks for all using (is_coach()) with check (is_coach());

-- 피드백 첨부: 피드백 접근권 따름, 변경은 코치
create policy "첨부 조회" on feedback_assets for select using (
  exists (select 1 from feedbacks f where f.id = feedback_id)
);
create policy "첨부 관리(코치)" on feedback_assets for all using (is_coach()) with check (is_coach());

-- 템플릿: 코치 전용
create policy "템플릿(코치)" on feedback_templates for all using (is_coach()) with check (is_coach());

-- 결제: 본인 것 조회, 변경은 코치(추후)
create policy "결제 조회" on payments for select using (
  is_coach() or exists (select 1 from coaching_requests r where r.id = request_id and r.member_id = auth.uid())
);
create policy "결제 관리(코치)" on payments for all using (is_coach()) with check (is_coach());
```

- [ ] **Step 2: 마이그레이션 적용**

```bash
supabase db reset
```

Expected: 마이그레이션과 (다음 Task의) seed가 오류 없이 적용됨. 이 시점엔 seed가 비어 있어도 무방.

- [ ] **Step 3: 스키마 통합 테스트 작성**

`src/lib/db/schema.test.ts` (로컬 Supabase에 service_role로 접속해 테이블 존재·기본 동작 확인):

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('DB 스키마', () => {
  let admin: ReturnType<typeof createClient>
  beforeAll(() => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  })

  it('핵심 테이블이 존재하고 select 가능하다', async () => {
    for (const table of [
      'profiles', 'classification_axes', 'classification_tags',
      'coaching_requests', 'request_classifications',
      'feedbacks', 'feedback_assets', 'feedback_templates', 'payments',
    ]) {
      const { error } = await admin.from(table).select('*').limit(1)
      expect(error, `${table} select 오류`).toBeNull()
    }
  })
})
```

- [ ] **Step 4: 테스트 의존성·환경 로드 설정**

`@supabase/supabase-js`와, 테스트에서 `.env.local`을 읽도록 `dotenv` 설치:

```bash
npm install @supabase/supabase-js
npm install -D dotenv
```

`vitest.config.ts`의 `test` 객체에 `.env.local` 로드를 추가:

```ts
import { config } from 'dotenv'
config({ path: '.env.local' })
```

(파일 상단 import 구역에 추가하고, `defineConfig` 호출 전에 `config(...)`를 실행)

- [ ] **Step 5: 테스트 실행 → 통과 확인**

`supabase start`가 떠 있는 상태에서:

Run: `npm test -- schema`
Expected: PASS — 9개 테이블 모두 select 성공.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0001_init.sql src/lib/db/schema.test.ts vitest.config.ts package.json package-lock.json
git commit -m "feat: 전체 DB 스키마 및 RLS 정책 마이그레이션 추가"
```

---

## Task 4: 분류 체계 초기 시드

**Files:**
- Create/Modify: `supabase/seed.sql`
- Test: `src/lib/db/seed.test.ts`

- [ ] **Step 1: 시드 SQL 작성**

`supabase/seed.sql`:

```sql
-- 분류 축
insert into classification_axes (name, is_member_facing, allow_multiple, sort_order) values
  ('운동 종목', true,  false, 1),
  ('문제 유형', false, true,  2),
  ('신체 부위', false, true,  3),
  ('회원 수준', false, false, 4);

-- 분류 값
insert into classification_tags (axis_id, label, sort_order)
select a.id, t.label, t.ord
from classification_axes a
join (values
  ('운동 종목','스쿼트',1),('운동 종목','데드리프트',2),('운동 종목','벤치프레스',3),
  ('운동 종목','푸시업',4),('운동 종목','런지',5),('운동 종목','플랭크',6),
  ('문제 유형','무릎 모임',1),('문제 유형','허리 말림',2),('문제 유형','가동범위 부족',3),
  ('문제 유형','중심 불안정',4),('문제 유형','속도 과다',5),
  ('신체 부위','무릎',1),('신체 부위','허리',2),('신체 부위','어깨',3),
  ('신체 부위','고관절',4),('신체 부위','발목',5),
  ('회원 수준','초급',1),('회원 수준','중급',2),('회원 수준','고급',3)
) as t(axis_name, label, ord) on a.name = t.axis_name;
```

- [ ] **Step 2: 시드 재적용**

```bash
supabase db reset
```

Expected: 마이그레이션 + 시드가 오류 없이 적용됨.

- [ ] **Step 3: 시드 검증 테스트 작성**

`src/lib/db/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

describe('분류 체계 시드', () => {
  it('축 4개가 존재한다', async () => {
    const { data } = await admin.from('classification_axes').select('name')
    expect(data?.map((a) => a.name).sort()).toEqual(
      ['문제 유형', '신체 부위', '운동 종목', '회원 수준'].sort(),
    )
  })

  it('운동 종목 축만 회원 노출이다', async () => {
    const { data } = await admin
      .from('classification_axes')
      .select('name, is_member_facing')
      .eq('is_member_facing', true)
    expect(data).toHaveLength(1)
    expect(data?.[0].name).toBe('운동 종목')
  })

  it('태그가 모든 축에 연결되어 있다', async () => {
    const { count } = await admin
      .from('classification_tags')
      .select('*', { count: 'exact', head: true })
    expect(count).toBe(19)
  })
})
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- seed`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add supabase/seed.sql src/lib/db/seed.test.ts
git commit -m "feat: 분류 체계(축·값) 초기 시드 추가"
```

---

## Task 5: Supabase 클라이언트(브라우저/서버)

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`

- [ ] **Step 1: ssr 패키지 설치**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: 브라우저 클라이언트 작성**

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: 서버 클라이언트 작성**

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component에서 호출 시 무시(미들웨어가 세션 갱신 담당)
          }
        },
      },
    },
  )
}
```

- [ ] **Step 4: 미들웨어 세션 헬퍼 작성**

`src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 보호 라우트: 미로그인 시 /login 으로
  const protectedPrefixes = ['/dashboard']
  const path = request.nextUrl.pathname
  if (!user && protectedPrefixes.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
```

- [ ] **Step 5: 빌드 타입 검증 + 커밋**

(테스트 없음 — 환경 의존 클라이언트. 타입체크로 검증)

Run: `npx tsc --noEmit`
Expected: 오류 없음

```bash
git add src/lib/supabase package.json package-lock.json
git commit -m "feat: Supabase 브라우저/서버/미들웨어 클라이언트 추가"
```

---

## Task 6: 역할 판정 로직

**Files:**
- Create: `src/lib/auth/roles.ts`
- Test: `src/lib/auth/roles.test.ts`

코치 지정은 `COACH_EMAIL` 환경변수와 일치하는 이메일로 판정한다(순수 함수로 테스트 가능).

- [ ] **Step 1: 실패 테스트 작성**

`src/lib/auth/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveRole } from './roles'

describe('resolveRole', () => {
  it('코치 이메일과 일치하면 coach', () => {
    expect(resolveRole('boss@x.com', 'boss@x.com')).toBe('coach')
  })

  it('대소문자/공백 무시하고 일치 판정', () => {
    expect(resolveRole('  Boss@X.com ', 'boss@x.com')).toBe('coach')
  })

  it('일치하지 않으면 member', () => {
    expect(resolveRole('user@x.com', 'boss@x.com')).toBe('member')
  })

  it('코치 이메일 미설정이면 member', () => {
    expect(resolveRole('user@x.com', undefined)).toBe('member')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- roles`
Expected: FAIL — `./roles` 없음

- [ ] **Step 3: 구현 작성**

`src/lib/auth/roles.ts`:

```ts
export type Role = 'member' | 'coach'

export function resolveRole(email: string | null | undefined, coachEmail: string | null | undefined): Role {
  if (!email || !coachEmail) return 'member'
  const norm = (s: string) => s.trim().toLowerCase()
  return norm(email) === norm(coachEmail) ? 'coach' : 'member'
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- roles`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts
git commit -m "feat: 코치/회원 역할 판정 로직 추가"
```

---

## Task 7: 카카오 로그인 + 콜백 + 프로필 보장

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `middleware.ts`
- Create: `src/app/dashboard/page.tsx`
- Modify: `src/app/page.tsx` (랜딩에 로그인 링크)

**사전 설정(수동, 코드 아님):** Supabase 대시보드(또는 로컬 `config.toml`)에서 카카오 OAuth 활성화. 카카오 개발자 콘솔에서 REST API 키/시크릿 발급, Redirect URI에 `http://127.0.0.1:54321/auth/v1/callback`(로컬) 등록. 로컬은 `supabase/config.toml`의 `[auth.external.kakao]`에 `enabled = true`, `client_id`, `secret`을 환경변수로 지정.

- [ ] **Step 1: 로그인 페이지 작성**

`src/app/login/page.tsx`:

```tsx
'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()

  async function signInWithKakao() {
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
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
    </main>
  )
}
```

- [ ] **Step 2: 콜백 라우트 작성(코드→세션 + 프로필 upsert)**

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { resolveRole } from '@/lib/auth/roles'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // service_role로 프로필 보장(없으면 생성)
        const admin = createAdmin(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        )
        const role = resolveRole(user.email, process.env.COACH_EMAIL)
        await admin.from('profiles').upsert(
          {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name ?? null,
            role,
          },
          { onConflict: 'id' },
        )
      }
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

- [ ] **Step 3: 전역 미들웨어 작성**

`middleware.ts` (프로젝트 루트):

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 4: 대시보드 페이지 작성(역할별 분기)**

`src/app/dashboard/page.tsx`:

```tsx
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
    </main>
  )
}
```

- [ ] **Step 5: 랜딩에 로그인 링크 추가**

`src/app/page.tsx` 내용을 교체:

```tsx
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
```

- [ ] **Step 6: 타입체크 + 개발 서버 수동 확인**

Run: `npx tsc --noEmit`
Expected: 오류 없음

Run: `npm run dev` 후 브라우저에서 `http://localhost:3000` → "코칭 시작하기" → 로그인 페이지 노출 확인. (카카오 실제 로그인은 카카오 키 설정 후 동작 — 미설정 시 콘솔 에러는 정상)

- [ ] **Step 7: 커밋**

```bash
git add src/app middleware.ts
git commit -m "feat: 카카오 로그인·OAuth 콜백·프로필 보장·역할별 대시보드 추가"
```

---

## 1단계 완료 기준 (Definition of Done)

- [ ] `npm test`가 모두 통과 (sanity, schema, seed, roles)
- [ ] `npx tsc --noEmit` 오류 없음
- [ ] `supabase db reset`으로 스키마+시드가 깨끗이 재구성됨
- [ ] `npm run dev`로 랜딩→로그인→(카카오 설정 후)대시보드 흐름이 동작
- [ ] 코치 이메일로 로그인 시 `profiles.role = coach`, 그 외 `member`

---

## Self-Review (작성자 점검 결과)

- **스펙 커버리지:** 설계 섹션 5(데이터 모델) 전체 테이블 → Task 3에서 생성. 분류 체계 시드 → Task 4. 카카오 로그인 → Task 7. 역할(코치/회원) → Task 6·7. 영상 업로드·피드백 UI·알림·자동삭제는 2~4단계 계획에서 다룸(이 단계 범위 외).
- **플레이스홀더:** 없음. 모든 코드/명령 실제 내용 포함.
- **타입 일관성:** `resolveRole(email, coachEmail)` 시그니처가 Task 6 정의와 Task 7 호출에서 일치. `profiles.role` enum(`member`/`coach`)이 마이그레이션·역할 로직·대시보드에서 일관.
- **다음 단계 전제:** 2단계는 R2 환경변수(.env.example에 이미 키 예약)와 `coaching_requests.video_object_key`(Task 3에 존재)를 사용.
