# 작업 기록

## 2026-06-15 (Phase 2 Task 7 - 내 신청 목록 페이지 + 대시보드 링크)
- src/app/requests/page.tsx 생성: 서버 컴포넌트 - 미인증 시 /login 리다이렉트, listMemberRequests로 본인 요청 목록 로드, STATUS_LABEL로 상태 한국어 표시, 빈 목록 안내문 + 새 신청 링크
- src/app/dashboard/page.tsx 교체: 기존 인증 체크·프로필 조회·역할별 제목 유지 + '코칭 신청하기'(/request/new)·'내 신청 보기'(/requests) 링크 블록 추가
- npx tsc --noEmit: 에러 없음
- npm run build: 성공, 라우트 테이블에 /requests(Dynamic ƒ) 포함 확인
- npm test: 8 files, 20 tests 모두 통과
- curl 스모크 테스트: GET /requests → 307 http://localhost:3000/login (미인증 리다이렉트 정상)
- 변경된 파일: src/app/requests/page.tsx, src/app/dashboard/page.tsx
- 커밋: 19c328a (NOT pushed)
- 다음 작업: Phase 3 - 코치 워크플로우

## 2026-06-15 (Phase 2 Task 6 - 코칭 신청 폼 UI)
- src/app/request/new/page.tsx 생성: 서버 컴포넌트 - 미인증 시 /login 리다이렉트, getMemberFacingAxisWithTags로 운동 종목 축+태그 로드 후 RequestForm에 전달
- src/app/request/new/request-form.tsx 생성: 클라이언트 컴포넌트 - 종목 선택(select), 메모(textarea), 영상 첨부(input[type=file]) + requestUploadUrl/submitCoachingRequest 호출 → /requests 이동
- 클라이언트 검증: 종목 미선택·파일 미첨부·video/* 타입·200MB 초과 모두 차단
- npx tsc --noEmit: 에러 없음
- npm run build: 성공, /request/new 라우트 Dynamic(ƒ) 포함 확인
- npm test: 8 files, 20 tests 모두 통과 (기존 테스트 깨지지 않음)
- 변경된 파일: src/app/request/new/page.tsx, src/app/request/new/request-form.tsx
- 커밋: b21fc6b (NOT pushed)
- 다음 작업: Phase 2 Task 7 이후 진행

## 2026-06-15 (Phase 2 Task 5 - 영상 업로드 URL 발급/요청 제출 Server Action)
- src/app/request/actions.ts 생성: 'use server' 파일, 두 Server Action 구현
  - requestUploadUrl(filename, contentType): 로그인 회원의 본인 prefix presigned PUT URL + objectKey 반환
  - submitCoachingRequest({ tagId, note, objectKey }): 업로드된 영상 key로 코칭 요청 생성, { id } 반환
- 두 Action 모두 supabase.auth.getUser() 검증 → 미인증 시 '로그인이 필요합니다.' 예외 (auth boundary)
- 기존 모듈 그대로 연결: createClient (server.ts), buildVideoObjectKey + createPresignedUploadUrl (r2.ts), createCoachingRequest (requests.ts)
- npx tsc --noEmit: 에러 없음
- npm run build: 성공 (컴파일 1741ms, 정적 7페이지 생성 완료)
- npm test: 8 files, 20 tests 모두 통과 (기존 테스트 깨지지 않음, Server Action은 request-context 의존으로 단위 테스트 없음)
- 변경된 파일: src/app/request/actions.ts
- 커밋: 6b5bfe1 (NOT pushed)
- 다음 작업: Phase 2 Task 6 - 회원 신청 폼 UI (Server Action 호출)

## 2026-06-15 (Phase 2 Task 4 Bugfix - 코칭 요청 원자적 RPC 전환, 고아 요청 방지)
- 버그: createCoachingRequest의 수동 롤백 DELETE가 RLS에 막혀 고아 요청 행이 남는 문제 수정
- supabase/migrations/0003_atomic_request.sql: create_coaching_request(p_tag_id, p_note, p_object_key) PL/pgSQL 함수 추가 (security invoker, 두 INSERT 원자적 트랜잭션, authenticated에만 EXECUTE 권한)
- npx supabase db reset: 0001+0002+0003 마이그레이션 + 시드 에러 없이 완료
- src/lib/requests.ts: createCoachingRequest를 supabase.rpc('create_coaching_request', ...) 호출로 전환 / CoachingRequest 타입에 video_uploaded_at 필드 추가
- src/lib/requests.test.ts: 기존 3개 테스트 유지 + 원자성 테스트 추가(코치 전용 축 태그 사용 시 분류 INSERT가 RLS에 막혀 전체 롤백 → 고아 요청 count=0 검증)
- npm test -- "requests.test": 4/4 통과 (원자성 테스트 포함) / npm test: 8 files, 20 tests 전체 통과
- npx tsc --noEmit: 에러 없음
- 변경된 파일: supabase/migrations/0003_atomic_request.sql, src/lib/requests.ts, src/lib/requests.test.ts
- 커밋: c6753a1 (NOT pushed)
- 다음 작업: Phase 2 Task 5 - 회원 신청 폼 UI / Server Action

## 2026-06-15 (Phase 2 Task 4 - 코칭 요청 생성/목록 도메인 로직)
- TDD: 테스트 먼저 작성(모듈 없음 → FAIL), 구현 후 PASS 확인
- src/lib/requests.test.ts: 3개 테스트 (요청 생성+분류 연결 / 타인 prefix 영상키 거부 / 본인 목록 최신순)
- src/lib/requests.ts: isOwnedObjectKey, createCoachingRequest, listMemberRequests 구현
  - 영상키 소유 prefix 검증 (requests/<memberId>/) — 불일치 시 즉시 예외
  - 요청 삽입 후 분류 태그 연결; 태그 연결 실패 시 요청 롤백(고아 방지)
  - listMemberRequests: RLS 기반 member_id 필터 + 최신순
- npm test -- requests.test: 3/3 통과 / npm test: 8 files, 19 tests 전체 통과
- 변경된 파일: src/lib/requests.ts, src/lib/requests.test.ts
- 커밋: b175b8d (NOT pushed)
- 다음 작업: Phase 2 Task 5 - 회원 신청 폼 UI / Server Action

## 2026-06-15 (Phase 2 Task 3 - 회원 노출 분류 축+태그 조회 헬퍼)
- TDD: 테스트 먼저 작성(모듈 없음 → FAIL), 구현 후 PASS 확인
- src/lib/classification.test.ts: getMemberFacingAxisWithTags가 '운동 종목' 축과 정렬된 태그 6개를 반환하는지 검증
- src/lib/classification.ts: MemberFacingAxis 타입, getMemberFacingAxisWithTags(supabase) 구현 (is_member_facing=true 축 조회 → 태그 sort_order 정렬)
- npm test -- classification: 1/1 통과 / npm test: 7 files, 16 tests 전체 통과
- 변경된 파일: src/lib/classification.ts, src/lib/classification.test.ts
- 커밋: b8dd1df (NOT pushed)
- 다음 작업: Phase 2 Task 4 - 회원 신청 폼 UI

## 2026-06-15 (Phase 2 Task 2 - 회원 종목 분류 RLS 정책 추가)
- migration 0002: 회원이 자기 요청에 회원 노출 축(운동 종목) 태그만 삽입할 수 있는 RLS 정책 추가
- src/test-helpers/users.ts: 재사용 가능한 테스트 헬퍼 (adminClient, createSignedInMember, deleteUser)
- src/lib/requests-rls.test.ts: 회원 RLS 검증 테스트 2건 (회원 노출 태그 허용 / 코치 전용 태그 차단)
- npx supabase db reset: 0001+0002 마이그레이션 + 시드 오류 없이 완료
- npm test -- requests-rls: 2/2 통과 / npm test: 6 files, 15 tests 전체 통과
- 변경된 파일: supabase/migrations/0002_member_classification.sql, src/test-helpers/users.ts, src/lib/requests-rls.test.ts

## 2026-06-15 (Phase 2 Task 1 - R2 presigned 업로드 유틸리티)
- TDD로 R2 presigned PUT URL 생성 유틸리티 구현
- @aws-sdk/client-s3, @aws-sdk/s3-request-presigner 설치 (v3.1068.0)
- .env.local에 R2 더미 환경변수 4개 추가 (gitignored - 커밋 제외)
- src/lib/storage/r2.test.ts: 테스트 먼저 작성 → 실패 확인(모듈 없음)
- src/lib/storage/r2.ts: buildVideoObjectKey(userId, filename) + createPresignedUploadUrl(key, contentType, expiresIn) 구현
- 검증: npm test -- r2: 4/4 통과 / npm test: 5 files, 13 tests 모두 통과
- 변경된 파일: src/lib/storage/r2.ts, src/lib/storage/r2.test.ts, package.json, package-lock.json
- 커밋: 7ab4ccd (NOT pushed)
- 다음 작업: Phase 2 Task 2 - 회원 신청 폼 / 영상 업로드 UI

## 2026-06-15 (2단계 계획 수립)
- 2단계(회원 신청 + 영상 업로드) 구현 계획서 작성 (TDD 7개 Task)
- 핵심 결정: R2 presigned PUT 직접 업로드, 도메인 로직 분리(통합 테스트), 회원이 자기 요청에 종목(회원 노출 축) 태그 삽입 허용 RLS 추가(0002)
- 영상 키 소유 prefix 검증·Server Action 인증 등 보안 포함. presign은 더미 키로 구조 검증, 실제 업로드는 R2 키 준비 후 라이브 검증.
- 변경된 파일: docs/superpowers/plans/2026-06-15-phase2-member-request-upload.md
- 다음 작업: 2단계 Task 1(R2 유틸)부터 서브에이전트 구동 실행

## 2026-06-15 (1단계 기반 완료)
- Phase 1(Foundation) 7개 Task 전부 완료·푸시. 서브에이전트 구동 + 2단계 검토(스펙·품질) + 자동 보안 리뷰 2회 반영.
- 결과물: Next.js 16+TS+Tailwind+Vitest, Supabase 로컬 스택, DB 스키마 9테이블+RLS(보안 강화), 분류 시드(축4·태그19), Supabase SSR 클라이언트, 역할 판정, 카카오 로그인/콜백/역할별 대시보드.
- 보안: RLS 자가권한상승 차단·테넌트 격리·최소권한 grant, 콜백 role 최초1회 설정+재로그인 보존+확인된 이메일만 코치, APP_URL 기준 리다이렉트. 라이브 검증 스크립트로 실증.
- 검증: npm test 9/9, tsc 클린, npm run build 성공, 통합 검토 READY.
- 환경 셋업: Docker Desktop 설치(brew)·실행, supabase CLI(devDep), 로컬 스택 기동.
- **남은 일(사용자 액션)**: 카카오 개발자 키 발급 + Supabase Auth 카카오 활성화 → 실제 OAuth 로그인 라이브 검증. 이후 2단계(회원 신청+영상 업로드)로 진행.

## 2026-06-15 (Task 7)
- 카카오 로그인 UI, OAuth 콜백, 프로필 보장, 역할별 대시보드 구현
- src/app/login/page.tsx: 카카오 OAuth 시작 버튼 (클라이언트 컴포넌트)
- src/app/auth/callback/route.ts: 코드 교환 → 프로필 upsert(service_role) → /dashboard 리디렉트
- middleware.ts (프로젝트 루트): updateSession 래핑, /dashboard 미인증 접근 차단
- src/app/dashboard/page.tsx: 서버 컴포넌트, 미인증 시 /login 리디렉트, role별 타이틀 표시
- src/app/page.tsx: 기본 랜딩 페이지 교체 (코칭 시작하기 → /login 링크)
- 검증: npx tsc --noEmit 에러 없음 / npm test 4 files 9 tests 모두 통과 / npm run build 성공 (/, /login, /dashboard, /auth/callback 라우트 포함)
- 스모크 테스트: GET /dashboard → 307 http://localhost:3000/login (미인증 차단 정상) / GET /login → 200
- 변경된 파일: src/app/login/page.tsx, src/app/auth/callback/route.ts, middleware.ts, src/app/dashboard/page.tsx, src/app/page.tsx
- 다음 작업: Kakao 개발자 키 설정 후 실제 OAuth 플로우 테스트

## 2026-06-15 (Task 4)
- 분류 체계(축·값) 초기 시드 추가
- supabase/seed.sql 작성: 4개 축(운동 종목/문제 유형/신체 부위/회원 수준), 19개 태그
- src/lib/db/seed.test.ts 작성: 축 4개 존재, 회원 노출 축 1개, 태그 총 19개 검증
- npx supabase db reset 성공 (migration + seed 에러 없음)
- npm test -- seed: 1 file, 3 tests 모두 통과
- npm test: 4 files, 9 tests 모두 통과
- 변경된 파일: supabase/seed.sql, src/lib/db/seed.test.ts
- 커밋: 479e099
- 다음 작업: Task 5 - Supabase 클라이언트 팩토리 (완료됨)

## 2026-06-15 (Task 3 - Security Fix)
- RLS 정책 보안 강화: role 자가변경 차단, 첨부 파일 게이트, 요청 필드 고정, 템플릿 소유 한정, 최소권한 GRANT
- is_coach() 함수에 security definer 추가 (RLS 재귀 스택 오버플로우 방지)
- 본인 프로필 수정 정책에 with check 추가 (role 필드 자가변경 차단)
- 요청 생성 정책에 status='in_review' and price is null 조건 고정
- 피드백 첨부 조회 정책에 발행 여부 + 소유권 게이트 추가
- 템플릿 정책을 코치 전용에서 코치 본인 소유만으로 강화 (coach_id = auth.uid())
- GRANT를 최소권한 원칙으로 교체 (anon: select만, authenticated: CRUD, service_role: all)
- npx supabase db reset 성공 (경고: seed.sql 없음 - 정상)
- npm test: 3 files, 6 tests 모두 통과
- rls_verify.mjs 6개 검사 전체 PASS (anon 차단, role 자가변경 차단, 멤버 격리, 필드 주입 차단)
- 변경된 파일: supabase/migrations/0001_init.sql
- 커밋: 961bee2
- 다음 작업: Task 4 - 분류 시드

## 2026-06-15 (Task 3)
- 전체 DB 스키마 및 RLS 정책 마이그레이션 추가
- supabase/migrations/0001_init.sql 작성: enum 2개, 테이블 9개, is_coach() 헬퍼 함수, RLS 정책 전체
- vitest.config.ts: dotenv로 .env.local 자동 로드 추가
- src/lib/db/schema.test.ts: 9개 핵심 테이블 select 가능 여부 테스트
- dotenv 패키지 dev 의존성 설치
- npx supabase db reset 성공 (에러 없음)
- npm test -- schema: 1 passed / npm test: 3 files, 6 tests 모두 통과
- 특이사항: Supabase 신버전에서 auto_expose_new_tables 기본값이 비활성화되어 service_role에 GRANT 구문을 마이그레이션에 추가함
- 변경된 파일: supabase/migrations/0001_init.sql, src/lib/db/schema.test.ts, vitest.config.ts, package.json, package-lock.json
- 커밋: f70382b
- 다음 작업: Task 4 - 분류 시드

## 2026-06-15 (Task 5)
- Supabase 브라우저/서버/미들웨어 클라이언트 팩토리 구현
- @supabase/ssr, @supabase/supabase-js 패키지 설치
- src/lib/supabase/client.ts: createBrowserClient 래퍼 (브라우저용)
- src/lib/supabase/server.ts: createServerClient 래퍼 (서버 컴포넌트용, await cookies())
- src/lib/supabase/middleware.ts: updateSession 헬퍼 (세션 갱신 + /dashboard 보호 라우트)
- npx tsc --noEmit 에러 없음 / npm test 5개 테스트 모두 통과
- 변경된 파일: src/lib/supabase/client.ts, src/lib/supabase/server.ts, src/lib/supabase/middleware.ts, package.json, package-lock.json
- 커밋: 2a1dbfd
- 다음 작업: Task 6 - 역할 판정 로직

## 2026-06-15 (Task 6)
- 역할 판정 로직(resolveRole) TDD로 구현
- 테스트 먼저 작성 후 실패 확인(모듈 없음), 구현 후 4개 테스트 통과 확인
- 케이스: 이메일 일치 → coach / 대소문자·공백 무시 일치 → coach / 불일치 → member / coachEmail 미설정 → member
- npx tsc --noEmit 타입 에러 없음
- 변경된 파일: src/lib/auth/roles.ts, src/lib/auth/roles.test.ts
- 다음 작업: Task 7 - 카카오 로그인 + 콜백 + 대시보드

## 2026-06-15 (Task 1)
- Next.js 스캐폴드 및 Vitest 테스트 인프라 구성 완료
- create-next-app@latest (next 16.2.9, React 19, TypeScript, Tailwind v4, App Router, src-dir) 설치
- 테스트 의존성 설치: vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event
- vitest.config.ts, vitest.setup.ts 작성
- package.json에 "test", "test:watch" 스크립트 추가
- TDD 사이클: src/lib/sanity.test.ts 작성(실패 확인) → src/lib/sanity.ts 구현 → npm test 1 passed 확인
- npx tsc --noEmit 타입 에러 없음
- 변경된 파일: package.json, vitest.config.ts, vitest.setup.ts, src/lib/sanity.ts, src/lib/sanity.test.ts, .gitignore, eslint.config.mjs, next.config.ts, next-env.d.ts, postcss.config.mjs, tsconfig.json, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css
- 다음 작업: Task 2 - Supabase 로컬 환경 및 DB 스키마 구성

## 2026-06-15
- 온라인 코칭 시스템 초기 아이디어 회의 및 설계 확정
- 핵심 결정: 비동기 영상 피드백 / 1인 코치 / 회당 결제(연동은 추후) / 템플릿 텍스트 피드백 / R2 직접 업로드(90일 자동삭제) / 모바일 웹 / 카카오 로그인 / Next.js+Supabase+R2
- 케이스 분류 체계 추가: 다차원 구조화 분류(운동종목/문제유형/부위/수준), 회원=종목만·코치=나머지 태깅, 축/값 코치 관리, 추후 케이스 DB 활용
- 구현 계획 4단계 로드맵 수립(기반 / 회원 신청 / 코치 워크플로우 / 열람·알림·보관)
- 1단계(기반) 구현 계획서 작성: Next.js 스캐폴드+Vitest, Supabase 로컬, 전체 DB 스키마+RLS, 분류 시드, Supabase 클라이언트, 역할 판정, 카카오 로그인+콜백+대시보드 (TDD 7개 Task)
- 변경된 파일: docs/superpowers/specs/2026-06-15-online-coaching-system-design.md, docs/superpowers/plans/2026-06-15-phase1-foundation.md
- 다음 작업: 1단계 계획 실행(구현 시작) 또는 사용자 검토

## 2026-06-12
- 프로젝트 초기 설정: git 저장소 초기화 및 GitHub 원격 저장소(baekstrong/onlinecoaching) 연결
- CLAUDE.md 작성 (작업 규칙: 작업 전 git pull, 작업 후 커밋/푸시, 작업 기록)
- 변경된 파일: CLAUDE.md, WORKLOG.md
- 다음 작업: 온라인 코칭 시스템 기획 및 개발 시작
