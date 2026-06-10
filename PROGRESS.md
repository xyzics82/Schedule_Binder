# PROGRESS

> loop.md의 반복 기록. 최신 항목이 맨 아래.

## 2026-06-10

- 한 일: Google 캘린더 양방향 동기화(설정 탭, GIS OAuth, 전용 "Life Binder" 캘린더 자동 생성, 저장 즉시 push, 5분 폴링 pull, 충돌=최신 우선, 삭제 양방향 전파) + 모바일 최적화(상단 고정 내비, 하루 단위 주간표 스와이프, 하단 시트 팝업, 16px 입력) 구현. jsdom 스모크 테스트로 인증 화면/설정 탭/동기화 왕복(push·pull·writeback) 검증 통과. 커밋 a9bb825.
- 다음 할 일: 사용자가 OAuth Client ID 발급(README 절차) 후 실기기에서 연결 테스트. 이상 없으면 push하여 GitHub Pages 배포. 이후 모바일 실기기에서 주간표 스와이프 UX 확인.
- 막힌 점: Client ID 미발급 상태라 실제 Google 계정 연동은 미검증(모킹 테스트만 통과).
