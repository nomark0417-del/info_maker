# A4 스마트 맞춤형 안내판 스튜디오 웹앱 설계서 (Spec)

## 1. 목적 및 배경 (Intent & Why)
- **사용자 및 용도**: 기관·학교·기업 등 실무에서 개인이 **행사 안내판, 연수 안내, 협의회 안내** 및 일반 시설 안내문을 A4 규격(세로/가로)에 맞춰 빠르고 품격 있게 제작·인쇄·이미지 저장하기 위한 웹앱.
- **데이터베이스 목적**: 한 번 만든 안내판을 클라우드 데이터베이스(Cloudflare D1)에 저장해 두고, 추후 일시·장소·세부 문구나 글자 크기를 변경했을 때 **기존 안내판을 수정 저장(덮어쓰기)** 하거나 **새 안내판으로 복제 저장(다른 이름으로 저장)** 하여 반복적인 안내판 제작 업무를 단축함.

## 2. 목표 및 비목표 (Goals & Non-Goals)
### Goals
1. **1단계 (프론트엔드 고도화 및 세부 제어)**:
   - 실무 맞춤형 프리셋(🎓 연수 안내, 🤝 협의회 안내, 🎉 행사·세미나 안내, ➡️ 회의실/행사장 방향 안내, 📋 접수/등록처 안내 등) 및 방향 화살표·실무 아이콘 확충.
   - 영역별 개별 글자 크기 슬라이더(상단 뱃지, 메인 타이틀, 보조 설명, 세부 사항/체크리스트, 하단 발행처/연락처) 및 전체 글자 크기 일괄 스케일(작게/기본/크게/특대) 지원.
   - 줄간격(행간), 자간, 항목 간격, 용지 안쪽 여백(Padding), 타이틀 굵기 등 세밀한 타이포그래피·레이아웃 제어.
   - 체크리스트(세부 항목) 기호 스타일 선택(점, 번호, 체크, 화살표, 경고) 및 항목 위/아래 순서 이동(↑/↓).
   - 하단 날짜 직접 수정/표시 토글, QR 코드 삽입(와이파이/행사 안내 URL 등), 프리뷰 캔버스 배율(Zoom) 조절, 실행 취소/다시 실행(Undo/Redo).
   - 기존 [`applyFrameStyles`](file:///d:/codingtest/info_maker/a4.html#L995-L1025)의 해저드 프레임 해제 시 배경 줄무늬 잔류 버그 수정 및 가로/세로 전환 시 `@page` 인쇄 방향 동적 반영.
2. **2단계 (Cloudflare D1 데이터베이스 및 백엔드 API 연동)**:
   - Cloudflare Pages Functions(`functions/api/signs`)와 Cloudflare D1(SQLite)을 연동하여 안내판 목록 조회, 검색, 새로 저장(`POST`), 수정 덮어쓰기(`PUT`), 복제 저장, 삭제(`DELETE`) 구현.
   - 오프라인/로컬 환경에서도 즉시 동작하도록 `localStorage` 백업 및 클라우드 D1 동기화 하이브리드 지원.
3. **3단계 (Cloudflare 배포)**:
   - `wrangler.toml` 및 D1 마이그레이션(`schema.sql`) 구성 후 Cloudflare Pages를 통해 프로덕션 배포.

### Non-Goals
- 복잡한 다중 사용자 회원가입/결제 시스템 (개인 업무용이므로 직관적이고 즉각적인 저장·불러오기 경험에 집중).

## 3. 아키텍처 및 기술 선택 (Approaches)
- **선택된 방식 (방식 A)**: 단일 페이지 웹앱(`a4.html` 및 배포용 `public/index.html`) + **Cloudflare Pages Functions** + **Cloudflare D1 (SQLite)**.
- **데이터 모델 (`signs` 테이블)**:
  - `id` (TEXT PRIMARY KEY)
  - `title` (TEXT NOT NULL) — 안내판 제목 (검색/목록 표시용)
  - `category` (TEXT) — 분류 (연수, 협의회, 행사, 방향, 일반 등)
  - `orientation` (TEXT) — `portrait` | `landscape`
  - `state_json` (TEXT NOT NULL) — 글자 크기, 테마, 문구, 체크리스트, 여백, QR 등 전체 상태 JSON
  - `created_at` (TEXT), `updated_at` (TEXT)

