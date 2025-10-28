# AGENTS.md — openai-realtime-console (baseline)

이 문서는 레포 전체에 적용되는 작업 지침서다. 직접 서버를 켜거나 배포 작업은 사용자가 요청했을 때만 수행한다.

**요약**
- 런타임: Express 서버(`server.js`) + React(Vite) 클라이언트.
- 개발: Vite 미들웨어로 SSR, 프로덕션: 정적 빌드 서빙.
- 실시간: OpenAI Realtime API(WebRTC). 클라이언트는 브라우저 WebRTC, 서버는 token 발급 프록시.
- UI: Tailwind v3, react-feather 사용. 이모지 지양.

## 스크립트/환경
- 개발: `npm run dev`
- 빌드: `npm run build`
- 시작: `npm start`
- 린트: `npm run lint`
- 필수 환경: `.env`에 `OPENAI_API_KEY`(예: `.env.example`). 키/토큰은 로그로 노출 금지.

## 파일 맵(핵심)
- 서버
  - `server.js:1` Express/Vite 초기화, dev/prod 분기
  - `server.js` 내 `sessionConfig`/세션 페이로드(JSON 문자열)
  - `server.js` `POST /session` SDP 올인원(실험용, 클라에서 직접 REST 호출 사용 시 대안)
  - `server.js` `GET /token` 에페메럴 키 발급 프록시
  - `server.js` 마지막 라우팅: dev SSR vs prod 정적 파일
- 클라이언트
  - `client/index.html` SSR 아웃렛: `<!--ssr-outlet-->`
  - `client/entry-server.jsx` SSR 렌더러
  - `client/entry-client.jsx` 하이드레이션
  - `client/components/App.jsx` 세션 수립/해제, 이벤트 송수신 핵심
  - `client/components/SessionControls.jsx` 연결/전송 UI
  - `client/components/EventLog.jsx` 이벤트 로그, 텍스트 추출
  - `client/components/ToolPanel.jsx` function calling 데모
  - `client/base.css`, `tailwind.config.js`, `vite.config.js`

## 동작 순서(엔드투엔드)
1) 서버 기동
- dev: Vite 미들웨어(`createViteServer`) 장착 → `transformIndexHtml` + `ssrLoadModule`로 SSR.
- prod: `dist/client` 정적 서빙.

2) 토큰 발급(`/token`)
- 서버가 OpenAI `POST /v1/realtime/client_secrets` 호출.
- 본문은 세션 설정(JSON 문자열). 응답 JSON에 `client_secret.value` 포함.

3) 클라이언트 세션 수립(`client/components/App.jsx`)
- `startSession()` 수행 순서
  - `GET /token` → `EPHEMERAL_KEY` 획득.
  - `const pc = new RTCPeerConnection()` 생성.
  - `getUserMedia({ audio: true })`로 마이크 트랙 추가.
  - `pc.ontrack`에서 모델 오디오 스트림을 `<audio>`에 연결.
  - `pc.createDataChannel('oai-events')`로 데이터 채널 준비.
  - `createOffer()` → `setLocalDescription(offer)`.
  - `POST https://api.openai.com/v1/realtime/calls?model=gpt-realtime`
    - 헤더: `Authorization: Bearer <EPHEMERAL_KEY>`, `Content-Type: application/sdp`
    - 바디: `offer.sdp`
  - 응답 SDP 텍스트를 `answer`로 `setRemoteDescription`.

4) 이벤트 송수신(데이터 채널)
- 열림(`open`) 시 세션 활성화 플래그 세팅, 로그 초기화.
- 수신(`message`) 시 JSON 파싱 → `events` 상태 맨 앞에 적재.
- 송신: `sendClientEvent(json)`이 데이터 채널로 그대로 전송.
- 텍스트 전송: `sendTextMessage(text)`
  - `conversation.item.create`(user message) → `response.create` 순으로 2건 전송.

5) UI/로깅
- `EventLog.jsx`
  - `response.done`의 `response.output[*].content[*].transcript`,
    `conversation.item.create.item.content[*].text`,
    `response.output_audio_transcript.done.transcript`를 추출해 한 줄 요약 표시.
- `ToolPanel.jsx`
  - `session.created` 이후 `session.update`로 function(tool) 등록.
  - `response.done`에서 `function_call` 출력이 오면 패널에 결과 렌더 → 추가로 `response.create`로 후속 질문 유도.

## 서버 라우트 요약
- `GET /token`
  - OpenAI `client_secrets`에 서버 측에서 요청해 에페메럴 키 발급.
  - 실패 시 상태코드 그대로 반환.
- `POST /session`(선택)
  - 바디: `sdp`, `session`(JSON 문자열). 서버에서 OpenAI `realtime/calls`로 대리 전송.
  - 기본 클라이언트는 직통 REST를 사용하므로, 프록시가 필요할 때만 사용.
- 클라이언트 라우팅
  - dev: Vite SSR, prod: `dist/client/index.html` 서빙.

## 개발 지침(React/TS)
- 새 코드 TS 권장: `.tsx`/`.ts` 파일로 작성.
- 절대 경로 import: Vite `resolve.alias`에 `@` → `client`.
- `cn()` 유틸 필수
  - `client/shared/lib/cn.ts` 예시: `twMerge(clsx(...))` 조합.
- Fragment는 `React.Fragment` 사용.
- Tailwind: v3, 모바일 우선. 클래스 결합은 `cn()`으로.
- 상태: Jotai(에페메럴 UI), TanStack Query(비동기 캐시) 도입 권장. 루트 Provider로 감싸서 사용.

## 운영 팁(옵션)
- 실서비스에서 헬멧/CORS/압축/레이트리밋 등 보안 미들웨어는 별도 PR로 추가.
- CSP는 dev에선 느슨, prod에선 빡빡하게. HMR(WebSocket) 예외 필요.
- 키/토큰/SDP 본문은 로그에 덤프하지 말 것.

## 검증 절차(수동)
- `.env` 설정 → 서버 시작 → `GET /token`으로 키 정상 확인.
- UI에서 “시작” → 브라우저 마이크 허용 → 오디오 스트림 수신 확인.
- 텍스트 입력 → `conversation.item.create`,`response.create` 순으로 이벤트가 EventLog에 쌓이는지 확인.

## 체크리스트
- [ ] `.env`에 `OPENAI_API_KEY` 설정
- [ ] dev/prod SSR/정적 라우팅 정상
- [ ] `/token` 200, JSON 수신
- [ ] 데이터 채널 open/메시지 수신
- [ ] EventLog 텍스트 추출 동작

