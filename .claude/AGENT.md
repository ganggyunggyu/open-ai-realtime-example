# OpenAI Realtime Console - Agent Guide

## 프로젝트 개요
OpenAI Realtime API를 WebRTC로 구현한 음성 대화 콘솔 애플리케이션

## 기술 스택
- React 18 + Vite
- Express.js + SSR
- TailwindCSS
- WebRTC (RTCPeerConnection, Data Channel)
- OpenAI Realtime API (gpt-realtime)

## 아키텍처

### 서버 (server.js)
```
Express + Vite SSR
├─ POST /session - WebRTC SDP 교환 엔드포인트
├─ GET /token - OpenAI 임시 토큰 발급
└─ Vite SSR 미들웨어
```

### 클라이언트
```
client/
├─ pages/index.jsx - 메인 페이지
├─ components/
│  ├─ App.jsx - WebRTC 로직, 이벤트 관리
│  ├─ SessionControls.jsx - 세션 시작/종료 UI
│  ├─ EventLog.jsx - 이벤트 로그
│  ├─ ToolPanel.jsx - 도구 패널
│  └─ Button.jsx - 공통 버튼
└─ entry-server.jsx / entry-client.jsx - SSR/CSR 엔트리
```

## 핵심 로직

### WebRTC 연결 (App.jsx)
1. `/token` 엔드포인트에서 OpenAI 임시 키 획득
2. RTCPeerConnection 생성
3. 마이크 스트림 추가
4. Data Channel 생성 (`oai-events`)
5. SDP Offer 생성 및 OpenAI API 전송
6. SDP Answer로 연결 완성

### 이벤트 통신
- Data Channel을 통한 JSON 이벤트 송수신
- 클라이언트 → 서버: `conversation.item.create`, `response.create` 등
- 서버 → 클라이언트: 응답 이벤트
- 타임스탬프 자동 추가

### 세션 관리
- 시작: WebRTC 연결 + Data Channel 오픈
- 종료: 트랙 중지 + 연결 정리

## 개발 규칙

### React 컴포넌트
- 함수형 컴포넌트 사용
- Hooks: useState, useRef, useEffect
- 구조분해할당 적극 활용

### 상태 관리
- 로컬 상태: useState
- 세션 상태: `isSessionActive`, `events`, `dataChannel`
- Ref: `peerConnection`, `audioElement`

### 이벤트 처리
```javascript
// 클라이언트 이벤트 전송
sendClientEvent({ type: "...", ...data });

// 텍스트 메시지
sendTextMessage("사용자 메시지");
```

## 환경 변수
`.env` 필수:
```
OPENAI_API_KEY=sk-proj-...
```

## 개발 명령어
```bash
npm run dev      # 개발 서버 (localhost:2000)
npm start        # 프로덕션 서버
npm run build    # 클라이언트 + 서버 빌드
```

## 주의사항
1. WebRTC는 HTTPS 또는 localhost에서만 동작
2. 마이크 권한 필요
3. OpenAI API 키 보안 유지
4. Data Channel 상태 확인 후 이벤트 전송
5. 세션 종료 시 리소스 정리 필수

## OpenAI Realtime API
- 모델: `gpt-realtime`
- 음성: `marin`
- 엔드포인트: `https://api.openai.com/v1/realtime/calls`
- 인증: Bearer 토큰 (임시 키)

## 참고
- [OpenAI Realtime API Docs](https://platform.openai.com/docs/guides/realtime)
- [WebRTC Docs](https://platform.openai.com/docs/guides/realtime-webrtc)
