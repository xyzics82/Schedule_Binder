# loop.md — Schedule Binder 자율 개발 루프

이 파일은 AI 코딩 에이전트(Claude Code, Codex 등)가 **매 반복(iteration)마다 처음부터 읽고 그대로 따르는 지시서**다.
한 반복 = 작업 1개 선택 → 구현 → 검증 → 커밋 → 기록. 그 이상 하지 않는다.

---

## 1. 프로젝트 핵심 사실 (먼저 숙지)

- **앱**: Schedule Binder (구 Life Binder Web) — 3P바인더 개념의 자기경영 캘린더. Plan(계획)과 Do(실행)를 같은 시간표에서 비교하는 것이 핵심.
- **이름 규칙**: 사용자에게 보이는 모든 이름은 "Schedule Binder". 단 localStorage 키(`life-binder-*`)와 GCal `lifeBinderId` extendedProperty는 기존 데이터 호환을 위해 그대로 둔다 — 절대 바꾸지 말 것.
- **구성**: 빌드 도구·프레임워크 없음. 정적 파일 3개가 전부.
  - `index.html` — 진입점 (수정할 일 거의 없음)
  - `app.js` — 전체 로직. 단일 IIFE, 상태 변경 후 `render()` 재호출 방식. 약 4,000줄.
  - `styles.css` — 전체 스타일. 약 7,700줄.
- **상태 저장**: `localStorage` 키 `life-binder-web-state-v1` (`app.js` 상단 `STORE_KEY`) + Supabase 동기화(`app_states` 테이블, 이메일 로그인). Supabase URL/publishable key는 `app.js` 상단에 하드코딩 — publishable key라 노출 허용, **service key나 OAuth secret은 절대 코드에 넣지 말 것.**
- **배포**: `main`에 push → `.github/workflows/pages.yml`이 GitHub Pages로 자동 배포. **push = 즉시 배포**임을 항상 의식할 것.
- **시간대**: Asia/Seoul. 일정 객체는 Plan(`start`,`end`,`categoryId`)과 Do(`actualStart`,`actualEnd`,`actualCategoryId`,`actualText`)를 한 객체에 가짐.

## 2. 작업 우선순위

1. **Google 캘린더 연동** — `GCAL_INTEGRATION_REQUEST.md`가 단일 사양서다. 이 문서의 ✅ 결정사항을 그대로 따른다 (Plan만 / 양방향 / 전용 "Schedule Binder" 캘린더 / GIS OAuth / 폴링 5분).
   - 미정 항목(`[ 입력: ... ]`)은 문서에 "추천"이 적혀 있으면 추천값을 채택하고, 채택 사실을 사양서에 직접 기입한다.
   - OAuth Client ID는 코드에 박지 말고 **앱 설정 UI에서 입력받아 localStorage에 저장**하는 구조로 구현한다.
   - 연동 작업을 작은 단위로 쪼개 한 반복에 하나씩: 설정 UI → OAuth 연결 → LB→GCal 단방향 → GCal→LB 가져오기 → 폴링/충돌 처리 → 오류 표시.
2. **백로그** — GCal 연동 완료 후 `BACKLOG.md`에서 최상단 미완료 항목을 선택한다. 파일이 없으면 `DEVELOPMENT_PLAN.md`의 미구현 항목으로 첫 `BACKLOG.md`를 생성하는 것이 그 반복의 작업이다.

## 3. 한 반복의 절차

1. **점검**: `git status` 확인. 줄바꿈(CRLF) 차이만 있는 대량 변경은 무시한다. 실제 미커밋 변경이 있으면 먼저 커밋하거나 되돌린 후 시작.
2. **선택**: `PROGRESS.md`(없으면 생성)에서 마지막 기록을 읽고, §2 우선순위에 따라 **작업 1개**를 고른다. 직전 반복이 실패로 기록돼 있으면 그 수습이 최우선.
3. **구현**: 기존 코드 스타일(IIFE 내부 함수, `render()` 패턴)을 따른다. 최소 변경.
4. **검증** (모두 통과해야 커밋):
   - `node --check app.js` — 문법 오류 없음
   - 로컬 서버(`python3 -m http.server`)로 열어 콘솔 에러 없이 로드되는지, 주간 탭에서 일정 생성/수정이 되는지 확인
   - 상태 구조를 바꿨다면: 기존 `STORE_KEY` 데이터로 로드해도 깨지지 않는지(마이그레이션) 확인
5. **커밋**: 작업 1개당 커밋 1개. 메시지는 영어 한 줄(기존 컨벤션). **push는 하지 않는다** — push는 사용자가 직접 하거나 명시적으로 지시했을 때만.
6. **기록**: `PROGRESS.md` 맨 아래에 날짜, 한 일, 다음 할 일, 막힌 점을 3~5줄로 append. 그리고 종료.

## 4. 금지 사항

- 프레임워크/번들러/npm 의존성 도입 금지. 순수 정적 파일 구조 유지.
- `app.js`/`styles.css` 파일 분할, 대규모 리팩터링 금지 (명시 지시 없는 한).
- 줄바꿈 변환 금지 — 파일은 CRLF. 전체 파일 재작성 대신 부분 수정 사용.
- 기존 사용자 데이터를 파괴하는 상태 구조 변경 금지. 바꾸면 반드시 마이그레이션 코드 동반.
- secret(서비스 키, OAuth secret) 하드코딩 금지.
- 한 반복에 여러 작업 금지. 검증 실패 상태로 커밋 금지.

## 5. 중단 조건

다음 경우 작업을 멈추고 `PROGRESS.md`에 질문을 남긴 뒤 종료한다:
- 사용자 결정 없이는 진행 불가한 사양 공백 (예: OAuth Client ID 미발급)
- 검증 실패를 2회 시도에도 해결 못함
- 사용자 데이터 손실 위험이 있는 변경이 필요해 보일 때
