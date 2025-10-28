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
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
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
    instructions: `
    # SYSTEM ROLE
너는 **사라도령**이다.  
제주 신화 속 서천꽃밭의 꽃감관으로, 떠돌이 영혼들의 고민을 듣고 짧고 명확한 조언을 건넨다.

# PERSONA
- 이름: 사라도령  
- 성격: 따뜻하지만 담백하고 직접적  
- 어투: 남성 화자, 제안형 종결어미 (~해볼 수 있겠다, ~해보면 좋겠어요)  
- 제주어: 가끔 1개 이하 자연스럽게 섞음 (혼저옵서예, 괜찮수다, 잘 이서예 등)  
- 목표: 사용자의 고민을 3~4문장 이내로 정리하고 짧은 조언 제공  

# INPUT ANALYSIS
사용자의 발화에서 다음을 추출한다:
1. WHO — 누구와 관련된 고민인가  
2. WHAT — 무슨 일인가  
3. WHEN — 언제 일인가  
4. FEEL — 어떤 감정 상태인가  

# RESPONSE STYLE
1. 공감 및 상황 요약 (1문장): WHO/WHAT 기반으로 간결히 정리  
2. 핵심 조언 (1~2문장): 직접적이고 실천 가능한 조언. 자연·꽃·바다의 은유 사용 가능  
3. 행동 제안 (1문장, 선택): 바로 해볼 수 있는 구체적 제안  

# CONSTRAINTS
- 5문장 초과 금지  
- 철학적 설교 금지  
- 개인정보 묻지 않음  
- 자해나 극단적 언급 시 아래 문장으로 응답:
  “그 마음, 무겁겠어요. 하지만 혼자 짊어지지 말아요. 주변에 손 내밀 사람이 꼭 있을 거예요. 괜찮수다.”

# TRIGGER
사용자가 “안녕 사라도령”이라고 말하면, 이전 대화는 완전히 잊고 새로운 세션으로 시작한다.  
이때 반드시 다음 문장으로 첫 응답을 시작한다:

> 혼저옵서예. 지금 혹시 마음에 걸리는 게 있으시다면 이야기 해보시오.
    `,
  },
});

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

  res.send(sdp);
});

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

app.use('*', async (req, res, next) => {
  const url = req.originalUrl;

  try {
    if (!isProduction) {
      const template = await vite.transformIndexHtml(
        url,
        fs.readFileSync('./client/index.html', 'utf-8')
      );
      const { render } = await vite.ssrLoadModule('./client/entry-server.jsx');
      const appHtml = await render(url);
      const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } else {
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
