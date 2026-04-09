# AGENT.md

이 레포의 작업 기준 문서는 `AGENTS.md` 임냥.

## 빠른 요약
- 런타임은 Express + React(Vite) 조합임냥.
- 서버 실행은 사용자가 요청했을 때만 진행함냥.
- Realtime 세션은 OpenAI Realtime API 기준으로 다루고, 키·토큰·SDP 본문은 로그에 남기지 않음냥.
- 프론트 수정 시 기존 UI 톤을 유지하면서 구조 분리, 책임 축소, 최소 변경 원칙을 우선함냥.

세부 규칙과 파일 맵, 검증 절차는 [AGENTS.md](/Users/ganggyunggyu/Programing/30_archive/stale-30d-2026-02-24/gpt-realtime/openai-realtime-console/AGENTS.md) 를 우선 참고함냥.
