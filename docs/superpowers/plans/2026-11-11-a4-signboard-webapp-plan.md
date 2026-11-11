# A4 스마트 맞춤형 안내판 스튜디오 웹앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [`a4.html`](file:///d:/codingtest/info_maker/a4.html)을 기반으로 글자 크기·세부 레이아웃 조절과 행사/연수/협의회 맞춤 기능을 갖춘 웹앱을 완성하고, Cloudflare D1 데이터베이스 연동 및 Cloudflare Pages 배포까지 단계별로 구축한다.

**Architecture:** 프론트엔드는 정교한 상태 관리(`state`)와 탭 기반 편집 UI를 갖춘 HTML/JS 웹앱으로 구성하며, 백엔드는 Cloudflare Pages Functions(`functions/api/signs`)와 Cloudflare D1(SQLite)을 사용하여 안내판의 생성·조회·수정(덮어쓰기)·복제·삭제를 처리한다.

**Tech Stack:** HTML5, Tailwind CSS, Google Fonts / Pretendard, html2canvas, QRCode SVG/Canvas, Cloudflare Pages Functions, Cloudflare D1, Wrangler CLI.

**Spec:** `docs/superpowers/specs/2026-11-11-a4-signboard-webapp-design.md`

## Global Constraints
- 인쇄 시 A4 세로(`210mm x 297mm`) 및 가로(`297mm x 210mm`) 규격과 `@page` 방향이 정확히 일치해야 함.
- 영역별 글자 크기(`badgeSize`, `titleSize`, `subtitleSize`, `bulletSize`, `footerSize`)가 테마 변경(`applyThemeStyles`) 시 초기화되거나 덮어씌워지지 않고 유지되어야 함.
- 한번 저장한 안내판을 불러와 세부 문구·글자 크기를 수정한 뒤 **수정 저장(덮어쓰기)** 과 **새로 복제 저장(다른 이름으로 저장)** 이 모두 가능해야 함.

## Review Focus
1. `hazard-stripe` 테두리 선택 후 다른 테두리(`double-line`, `none` 등)로 변경 시 인라인 `backgroundImage`가 남아있는 버그 방지.
2. 프리뷰 캔버스 Zoom 배율(예: 75%)이 적용된 상태에서 PNG 내보내기(`html2canvas`)나 인쇄(`window.print()`) 실행 시 잘리거나 축소되지 않고 원본 A4 고해상도로 출력되어야 함.
3. 글자 크기를 크게 키웠을 때 긴 제목이 자연스럽게 줄바꿈(`break-keep`)되고 줄간격(`titleLineHeight`)이 깨지지 않아야 함.
4. 저장된 안내판을 불러와 수정한 뒤 '수정 저장(덮어쓰기)' 시 새 레코드가 중복 생성되지 않고 기존 `id`가 업데이트되어야 함.
5. Cloudflare D1 API가 연결되지 않은 로컬 파일(`file://`) 실행 환경에서도 로컬 스토리지 기반으로 저장/불러오기/수정이 오류 없이 동작해야 함.

---

### Task 1: 1단계 — 프론트엔드 화면 고도화, 글자 크기 조정 및 실무 기능 완성
**Files:**
- Modify: `d:\codingtest\info_maker\a4.html`

- [ ] **Step 1: 상태 모델(`state`) 확장 및 버그 수정**
  - 영역별 글자 크기(`badgeSize`, `titleSize`, `subtitleSize`, `bulletSize`, `footerSize`), 간격(`titleLineHeight`, `bulletGap`, `canvasPadding`), 불릿 스타일(`bulletStyle`: `dot` | `number` | `check` | `arrow`), 날짜 표시/커스텀(`showDate`, `customDate`), 직인 배지(`stampText`), QR 코드(`showQr`, `qrText`, `qrLabel`), 프리뷰 줌(`zoom`) 상태 추가.
  - `applyFrameStyles`에서 `fo.style.backgroundImage = ''` 초기화 및 테마 배경색 동기화, `@page { size: A4 portrait/landscape; margin: 0; }` 동적 반영.
- [ ] **Step 2: 업무 특화 프리셋(연수, 협의회, 행사, 방향, 등록처) 및 화살표/실무 아이콘 추가**
  - `PRESETS`에 `training`(연수 안내), `council`(협의회 안내), `seminar`(행사/세미나 안내), `direction`(행사장 방향 안내), `registration`(등록/접수처 안내) 추가 및 `ICONS`에 방향 화살표(`arrow-right`, `arrow-left`, `arrow-up`, `users`, `calendar`, `map-pin`, `award`, `clipboard-check`) 추가.
- [ ] **Step 3: 좌측 컨트롤 패널 탭 UI 및 글자 크기·세부 조절 컨트롤 구현**
  - `📝 내용 편집`, `🔤 글자·서체`, `🎨 테마·디자인`, `🗂️ 보관함(저장/수정)` 4개 탭 UI 구성.
  - 전체 글자 크기 스케일 버튼(85%, 100%, 115%, 130%) + 영역별 슬라이더(px 실시간 표시 및 개별/전체 초기화) 구현.
  - 체크리스트 순서 이동(↑/↓), Undo/Redo(`Ctrl+Z`/`Ctrl+Y`), 프리뷰 배율 조절 바 구현.
- [ ] **Step 4: 브라우저 프리뷰 및 동작 검증**
  - 브라우저에서 렌더링, 글자 크기 조절, 프레임 전환, 프리셋 로드, 로컬 보관함 저장/수정 덮어쓰기 동작 확인.

### Task 2: 2단계 — Cloudflare D1 데이터베이스 및 Pages Functions API 구축
**Files:**
- Create: `d:\codingtest\info_maker\schema.sql`
- Create: `d:\codingtest\info_maker\functions\api\signs\index.js`
- Create: `d:\codingtest\info_maker\functions\api\signs\[id].js`
- Create: `d:\codingtest\info_maker\public\index.html` (동기화)

- [ ] **Step 1: D1 SQL 스키마(`schema.sql`) 작성**
  - `signs` 테이블(`id`, `title`, `category`, `orientation`, `state_json`, `created_at`, `updated_at`) 및 인덱스 정의.
- [ ] **Step 2: Cloudflare Pages Functions CRUD 엔드포인트 작성**
  - `GET /api/signs` (목록/검색), `POST /api/signs` (새 안내판 저장), `PUT /api/signs/:id` (기존 안내판 수정 덮어쓰기), `DELETE /api/signs/:id` (삭제) 구현.
- [ ] **Step 3: 프론트엔드 보관함과 Cloudflare API 연동**
  - 서버 API 가용 시 Cloudflare D1에 저장·수정·조회하고, 오프라인 시 `localStorage`와 자동 폴백/동기화되도록 연결.

### Task 3: 3단계 — Cloudflare 설정 및 배포
**Files:**
- Create: `d:\codingtest\info_maker\wrangler.toml`
- Create: `d:\codingtest\info_maker\package.json`

- [ ] **Step 1: Wrangler 및 D1 바인딩 설정, 로컬 D1 테스트**
- [ ] **Step 2: Cloudflare D1 원격 생성 및 Cloudflare Pages 배포 실행**

