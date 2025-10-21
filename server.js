import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.text());
const port = process.env.PORT || 2000;
const apiKey = process.env.OPENAI_API_KEY;
const isProduction = process.env.NODE_ENV === 'production';

let vite;
if (!isProduction) {
  // 개발 환경: Vite 미들웨어 사용
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  // 프로덕션 환경: 빌드된 정적 파일 서빙
  app.use(express.static(join(__dirname, 'dist/client')));
}

const sessionConfig = JSON.stringify({
  session: {
    type: 'realtime',
    model: 'gpt-realtime',
    audio: {
      output: {
        voice: 'cedar',
      },
    },
    instructions: `# 시스템 역할

당신은 사라도령입니다. 제주 신화 속 서천꽃밭의 꽃감관으로, 영혼들의 고민을 듣고 짧고 명확한 조언을 건네는 역할을 합니다.

## 페르소나
- 이름: 사라도령
- 역할: 서천꽃밭 꽃감관, 영혼의 길잡이
- 성격: 따뜻하지만 담백하고 직접적
- 어투: 남성 화자, 제안형 종결어미 (~해볼 수 있겠다, ~해보면 좋겠어요)
- 제주어: 가끔 제주어 단어 1개 내외 자연스럽게 섞음 (혼저옵서예, 괜찮수다, 잘 이서예 등)
- 목표: 사용자의 고민을 3-4문장 이내로 정리하고 짧은 조언 제공

## 발화 분석
사용자 발화에서 다음을 추출하세요:
1. WHO (관계/등장자): 누구와 관련된 고민인가?
2. WHAT (사건/결정): 무슨 일이 있었는가?
3. WHEN (시점): 언제의 일인가?
4. FEEL (감정): 어떤 감정 상태인가?

## 응답 규칙
1. 공감 및 상황 정리 (1문장): WHO/WHAT 기반으로 상황 간단히 정리
2. 핵심 조언 (1-2문장): 직접적이고 실천 가능한 조언. 자연/꽃/바다 은유 활용 가능
3. 액션 아이템 (1문장, 선택적): 구체적으로 해볼 수 있는 행동 제안

## 제약 사항
- 개인정보 수집 금지 (이름, 연락처 등 물어보지 않기)
- 5문장 이상 말하지 않기
- 철학적 설교 금지
- 자해/자살 의도 감지 시: "그 마음, 무겁겠어요. 하지만 혼자 짊어지지 말아요. 주변에 손 내밀 사람이 꼭 있을 거예요. 괜찮수다."

## 응답 예시
사용자: "친구랑 다투었어."
사라도령: "친구와의 거리는 늘 파도 같지요. 너무 밀려들지도, 너무 멀어지지도 말아요. 먼저 작은 말 한마디 건네보면 좋겠수다."

이제 서천꽃밭의 꽃감관으로서 영혼들의 고민을 들어주세요.`,
  },
});

// All-in-one SDP request (experimental)
app.post('/session', async (req, res) => {
  const fd = new FormData();
  console.log(req.body);
  fd.set('sdp', req.body);
  fd.set('session', sessionConfig);

  const r = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      'OpenAI-Beta': 'realtime=v1',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: fd,
  });
  const sdp = await r.text();
  console.log(sdp);

  // Send back the SDP we received from the OpenAI REST API
  res.send(sdp);
});

// API route for ephemeral token generation
app.get('/token', async (req, res) => {
  try {
    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: sessionConfig,
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Render the React client
app.use('*', async (req, res, next) => {
  const url = req.originalUrl;

  try {
    if (!isProduction) {
      // 개발 환경: SSR with Vite
      const template = await vite.transformIndexHtml(
        url,
        fs.readFileSync('./client/index.html', 'utf-8')
      );
      const { render } = await vite.ssrLoadModule('./client/entry-server.jsx');
      const appHtml = await render(url);
      const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } else {
      // 프로덕션 환경: 빌드된 index.html 제공
      res.sendFile(join(__dirname, 'dist/client/index.html'));
    }
  } catch (e) {
    if (!isProduction) {
      vite.ssrFixStacktrace(e);
    }
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
