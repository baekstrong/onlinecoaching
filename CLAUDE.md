# 온라인 코칭 시스템

## 작업 규칙

### 1. 작업 시작 전: git pull
- 모든 작업을 시작하기 전에 반드시 `git pull origin main`을 실행하여 원격 저장소의 최신 변경사항을 받아온다.

### 2. 작업 완료 후: 커밋 & 푸시
- 매 작업이 끝날 때마다 변경사항을 커밋하고 푸시한다.
- 커밋 메시지는 작업 내용을 명확하게 설명한다.
```bash
git add -A
git commit -m "작업 내용 요약"
git push origin main
```

### 3. 작업 완료 후: 작업 기록
- 매 작업이 끝날 때마다 `WORKLOG.md`에 작업 기록을 남긴다.
- 기록 형식:
```markdown
## YYYY-MM-DD
- 작업 내용 요약
- 변경된 파일 목록
- 특이사항 / 다음 작업 메모
```
- 작업 기록(WORKLOG.md)도 함께 커밋하여 푸시한다.

## 저장소
- GitHub: https://github.com/baekstrong/onlinecoaching
- 기본 브랜치: main
