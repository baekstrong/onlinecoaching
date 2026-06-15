# 작업 기록

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
