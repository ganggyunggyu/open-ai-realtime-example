# 사라도령 프로젝트 실행 가이드

처음부터 프로젝트 세팅하고 실행하는 방법 정리해놨습니다.

## 필요한 것들

- Node.js (v18 이상)
- pnpm
- Git
- OpenAI API Key (Realtime API 써야 함)

---

## Windows에서 설치하기

### Node.js 설치

[nodejs.org](https://nodejs.org/)에서 LTS 버전 다운받아서 설치하면 됩니다.
기본 설정 그대로 Next 눌러서 설치하시면 돼요.

Chocolatey 쓰시는 분들은:
```powershell
choco install nodejs-lts
```

제대로 깔렸는지 확인:
```powershell
node -v
```

### pnpm 설치

```powershell
npm install -g pnpm
```

확인:
```powershell
pnpm -v
```

### Git 설치

[git-scm.com](https://git-scm.com/download/win)에서 다운받아서 설치.

### 프로젝트 받기

```powershell
cd Desktop
git clone https://github.com/ganggyunggyu/open-ai-realtime-example.git
cd open-ai-realtime-example
```

---

## Mac에서 설치하기

### Homebrew 설치 (선택)

brew 없으면 먼저 설치:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js 설치

brew로 설치하는 게 제일 편함:
```bash
brew install node@18
```

아니면 [nodejs.org](https://nodejs.org/)에서 다운받아서 설치.

확인:
```bash
node -v
```

### pnpm 설치

```bash
npm install -g pnpm
```

확인:
```bash
pnpm -v
```

### Git 설치

Mac은 Git이 기본으로 깔려있음. 최신 버전 원하면:
```bash
brew install git
```

### 프로젝트 받기

```bash
cd ~
git clone https://github.com/ganggyunggyu/open-ai-realtime-example.git
cd open-ai-realtime-example
```

---

## 프로젝트 세팅

### 의존성 설치

```bash
pnpm install
```

### 환경변수 설정

Windows:
```powershell
copy .env.example .env
notepad .env
```

Mac:
```bash
cp .env.example .env
open .env
```

### OpenAI API Key 넣기

`.env` 파일 열어서 API Key 입력:

```env
OPENAI_API_KEY="여기에_실제_키_입력"
```

API Key 발급은 [platform.openai.com](https://platform.openai.com/)에서:
1. 로그인
2. API keys 메뉴
3. Create new secret key
4. 생성된 키 복사해서 넣기

참고:
- Realtime API는 별도 신청 필요할 수도 있음
- API Key 절대 공유하지 말 것
- .env 파일은 Git에 올리면 안됨

---

## 실행하기

### 개발 모드로 실행

```bash
pnpm dev
```

브라우저에서 `http://localhost:2000` 열기

### 프로덕션 빌드

빌드:
```bash
pnpm build
```

실행 (Windows):
```powershell
$env:NODE_ENV="production"
pnpm start
```

실행 (Mac):
```bash
NODE_ENV=production pnpm start
```

---

## 기능 설명

### AI 음성 대화
- 마이크 권한 허용 필요
- "시작하기" 버튼 누르면 시작
- AI가 말하는 동안엔 입력 막힘

### 텍스트 입력
- 하단 입력창에 입력 가능
- Enter 또는 "전송" 버튼
- AI 말하는 중엔 입력 안됨

### 자동 스케줄링
- 08:00 자동 접속
- 18:00 자동 종료
- 브라우저 탭 열려있어야 작동함

### 이벤트 로그
- Messages: 대화 내용만
- All: 전체 서버 이벤트

---

## 트러블슈팅

### node 명령어를 찾을 수 없음
Node.js 재설치하고 터미널/PowerShell 재시작

### pnpm install 실패
```bash
pnpm install --no-frozen-lockfile
```

### 401 Unauthorized (OpenAI API)
- `.env` 파일에서 API Key 확인
- OpenAI Platform에서 키 유효성 확인
- Realtime API 권한 있는지 확인

### 마이크 권한 오류
Chrome: 주소창 왼쪽 자물쇠 → 마이크 → 허용
Safari: 환경설정 → 웹사이트 → 마이크 → localhost 허용

### 포트 2000 이미 사용 중

Windows:
```powershell
netstat -ano | findstr :2000
taskkill /PID [PID번호] /F
```

Mac:
```bash
lsof -i :2000
kill -9 [PID번호]
```

또는 `.env`에서 포트 변경:
```env
PORT=3000
```

### 빌드 실패
```bash
rm -rf node_modules
pnpm store prune
pnpm install
pnpm build
```

---

## 사용 가능한 명령어

```bash
pnpm dev       # 개발 서버
pnpm start     # 프로덕션 서버
pnpm build     # 빌드
pnpm lint      # 린트
```

---

문제 생기면 [GitHub Issues](https://github.com/ganggyunggyu/open-ai-realtime-example/issues)에 올려주세요.
