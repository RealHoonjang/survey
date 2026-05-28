# 학생 활동 선착순 조사 시스템

학교 현장에서 교사가 활동별 정원을 설정하고, 학생이 선착순으로 참여 활동을 신청하는 웹 애플리케이션입니다.

## 주요 기능

### 교사 (관리자)
- 조사 생성: 명칭, 대상 학생 수, 인증 방식(랜덤 코드 / 학번), 중복 참여 허용, 일정
- 활동 관리: 활동명, 설명, 정원
- 실시간 대시보드: 활동별 신청·잔여 인원 (SSE, 2초 간격)
- 참여자 명단 및 엑셀(.xlsx)보내기
- 코드 모드 시 참여 코드 목록 다운로드

### 학생
- 코드 또는 학번으로 인증
- 시작 전/종료 후 안내 메시지
- 활동 선택 (정원 마감 시 선택 불가)
- 선착순 정원 처리 (DB 트랜잭션 + 조건부 UPDATE)

## 기술 스택

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: SQLite (Prisma ORM) — 운영 시 PostgreSQL로 전환 가능
- **실시간**: Server-Sent Events (SSE)
- **엑셀**: ExcelJS

## 시작하기

```bash
npm install
npm run db:migrate
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

1. **교사**: 「새 조사 만들기」 → 설정 후 생성 → 표시되는 **관리 링크** 저장
2. **학생**: 관리 대시보드의 「학생 링크 복사」로 배포

> 생성 시 표시되는 관리자 토큰이 포함된 URL을 잃어버리면 대시보드에 다시 접속할 수 없습니다. 북마크하세요.

## API 개요

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/surveys` | 조사 생성 |
| GET | `/api/surveys/:id` | 조사 조회 (학생용 공개 정보) |
| GET | `/api/surveys/:id?token=` | 조사 조회 (교사, 참여자 포함) |
| POST | `/api/surveys/:id/register` | 활동 신청 |
| GET | `/api/surveys/:id/stream` | 실시간 현황 SSE |
| GET | `/api/surveys/:id/export?token=` | 엑셀 다운로드 |
| GET | `/api/surveys/:id/codes?token=` | 코드 목록 (txt) |

교사 API는 쿼리 `token` 또는 헤더 `x-admin-token`으로 인증합니다.

## 데이터 모델

- **Survey**: 조사 설정, 일정, 인증 방식
- **Activity**: 활동별 정원 및 현재 인원
- **AccessCode**: 코드 모드 시 발급 코드
- **Participant**: 참여 기록

## 선착순 정합성

동시 다발 신청 시 정원 초과를 막기 위해, 트랜잭션 내에서 다음 SQL로 원자적 증가를 수행합니다.

```sql
UPDATE Activity SET currentCount = currentCount + 1
WHERE id = ? AND currentCount < maxCapacity
```

영향 받은 행이 0이면 정원 마감으로 처리합니다.

## PostgreSQL로 전환

`prisma/schema.prisma`의 `provider`를 `postgresql`로 변경하고 `.env`의 `DATABASE_URL`을 설정한 뒤 `npm run db:migrate`를 실행하세요.
