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

-- ===== API 역할에 테이블 접근 권한 부여 =====
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
