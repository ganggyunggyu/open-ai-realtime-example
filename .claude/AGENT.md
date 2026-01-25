# OpenAI Realtime Console - 개발 가이드

## 프로젝트 개요
- **타입**: React SSR + Express 실시간 음성 콘솔
- **패키지 매니저**: npm / pnpm
- **빌드 도구**: Vite 5
- **배포**: Railway

OpenAI Realtime API를 WebRTC로 구현한 음성 대화 애플리케이션

## 기술 스택

### 프론트엔드
- React 18.2
- TanStack Query 5 (서버 상태 관리)
- React Router DOM 6
- Tailwind CSS 3.4
- React Feather (아이콘)

### 백엔드
- Express 4
- Vite SSR (개발 모드)
- Helmet, CORS, compression (보안)

### 실시간 통신
- WebRTC (RTCPeerConnection, Data Channel)
- OpenAI Realtime API (`gpt-realtime`)

## 디렉토리 구조
```
openai-realtime-console/
├── server.js              # Express 서버 + Vite SSR
├── client/
│   ├── components/
│   │   ├── App.jsx        # WebRTC 핵심 로직
│   │   ├── SessionControls.jsx
│   │   ├── EventLog.jsx
│   │   ├── ToolPanel.jsx
│   │   └── Button.jsx
│   ├── pages/
│   │   └── index.jsx      # 메인 페이지
│   ├── assets/
│   ├── entry-client.jsx   # CSR 엔트리
│   ├── entry-server.jsx   # SSR 엔트리
│   ├── index.html
│   └── base.css
├── dist/                  # 빌드 결과물
├── vite.config.js
├── tailwind.config.js
└── .env                   # 환경 변수
```

## 핵심 파일

### 서버
| 파일 | 역할 |
|------|------|
| `server.js` | Express 서버, 라우팅, SSR |
| `server.js:GET /token` | OpenAI 임시 토큰 발급 |
| `server.js:POST /session` | SDP 교환 프록시 (선택적) |

### 클라이언트
| 파일 | 역할 |
|------|------|
| `App.jsx` | WebRTC 연결, 세션 관리, 이벤트 송수신 |
| `SessionControls.jsx` | 연결/종료 UI |
| `EventLog.jsx` | 이벤트 로그 표시, 텍스트 추출 |
| `ToolPanel.jsx` | function calling 도구 패널 |

## 개발 명령어
```bash
npm run dev      # 개발 서버 (nodemon + Vite)
npm run build    # 클라이언트 빌드
npm start        # 프로덕션 서버
npm run lint     # ESLint 검사 + 자동 수정
```

## 환경 변수
`.env` 필수:
```
OPENAI_API_KEY=sk-proj-...
```

## 개발 규칙

### 컴포넌트
- 함수형 컴포넌트 사용
- 구조분해할당 필수
- Props 타입 명시 권장

### 상태 관리
- 로컬 상태: `useState`
- 서버 상태: TanStack Query
- Ref: WebRTC 연결, 오디오 엘리먼트

### 스타일링
- Tailwind CSS 사용
- 모바일 우선 반응형
- `cn()` 유틸 사용 권장 (twMerge + clsx)

### 이벤트 통신
```javascript
// 클라이언트 이벤트 전송
sendClientEvent({ type: "...", ...data });

// 텍스트 메시지
sendTextMessage("사용자 메시지");
```

## WebRTC 연결 흐름
1. `/token` 엔드포인트에서 임시 키 획득
2. `RTCPeerConnection` 생성
3. 마이크 스트림 추가
4. Data Channel 생성 (`oai-events`)
5. SDP Offer 생성 → OpenAI API 전송
6. SDP Answer로 연결 완성

## 주의사항
1. WebRTC는 HTTPS 또는 localhost에서만 동작
2. 마이크 권한 필수
3. API 키/토큰 로그 노출 금지
4. Data Channel 상태 확인 후 이벤트 전송
5. 세션 종료 시 리소스 정리 필수

## OpenAI Realtime API
- **모델**: `gpt-realtime`
- **음성**: `marin`
- **엔드포인트**: `https://api.openai.com/v1/realtime/calls`
- **토큰 발급**: `https://api.openai.com/v1/realtime/client_secrets`

## 참고 문서
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- [WebRTC Guide](https://platform.openai.com/docs/guides/realtime-webrtc)
