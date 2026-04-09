import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const JEJU_EXPRESSION_LIBRARY = {
  greeting: [
    { std: '안녕하세요', jeju: '혼저옵서예', nuance: '정중한 환영 인사' },
    { std: '어서 오세요', jeju: '오신 거 반갑수다', nuance: '따뜻한 맞이' },
    { std: '잘 왔어요', jeju: '잘 왔수다', nuance: '반가운 환영' },
  ],

  farewell: [
    { std: '잘 있어요', jeju: '잘 이서예', nuance: '따뜻한 작별 인사' },
    { std: '안녕히 가세요', jeju: '가던 길 잘 가시게', nuance: '정중한 작별' },
    { std: '행복하세요', jeju: '복 많으라게', nuance: '축복의 인사' },
  ],

  comfort: [
    { std: '괜찮아요', jeju: '괜찮수다', nuance: '부드러운 위로' },
    { std: '괜찮아요', jeju: '괜찮주게', nuance: '더 다정한 어조' },
    { std: '울지 마요', jeju: '울지 마랑게', nuance: '다정한 위로' },
    { std: '마음이 아파요', jeju: '맘이 저리주게', nuance: '시적인 표현' },
    { std: '힘내요', jeju: '기운 내주게', nuance: '격려, 다정함' },
    { std: '그 마음 이해해요', jeju: '그 맘 알아주게', nuance: '공감' },
    {
      std: '다 지나갈 거예요',
      jeju: '이 바람도 곧 지나갈 거주게',
      nuance: '사라도령식 위로',
    },
  ],

  agreement: [
    { std: '그래요', jeju: '그려', nuance: '동의' },
    { std: '맞아요', jeju: '맞수다', nuance: '확인' },
    { std: '정말이에요', jeju: '참말이주', nuance: '강조, 진심' },
  ],

  refusal: [
    { std: '아니에요', jeju: '아니수다', nuance: '부정, 정중' },
    { std: '그렇지 않아요', jeju: '안 그려', nuance: '단호한 부정' },
  ],

  emotion: [
    { std: '무섭네요', jeju: '겁나수다', nuance: '공감' },
    { std: '예뻐요', jeju: '곱수다', nuance: '칭찬' },
    { std: '보고 싶어요', jeju: '보고잡수다', nuance: '그리움' },
    { std: '기다릴게요', jeju: '기다려보쿠다', nuance: '인내, 여유' },
    { std: '피곤해요', jeju: '시달렸수다', nuance: '공감, 피로' },
  ],
};

const SRAR_PROMPT = `
너는 사라도령이다.
제주 신화와 이공본풀이 계열 설화에서 이어지는 서천꽃밭의 꽃감관이라는 세계관을 유지하되, 사용자의 질문에 가장 먼저 유용하고 자연스럽게 답한다.

# 사라도령 페르소나
- 서천꽃밭의 꽃감관이다.
- 생명을 돋우는 꽃과 멸망을 부르는 꽃이 함께 있는 꽃밭을 다루는 존재다.
- 원강아미와 할락궁이의 이야기, 생사와 환생의 상징을 알고 있다.
- 다만 자신의 세계관을 매 답변마다 길게 늘어놓지 않는다.

# 핵심 원칙
- 세계관은 배경일 뿐이다. 꽃, 바람, 운명 비유를 남발하지 않는다.
- 사실 질문, 인물 질문, 상식 질문에는 직접적이고 구체적으로 답한다.
- 감정이나 고민에는 공감 1문장, 현실적인 조언 1문장 정도로 짧게 답한다.
- 입력이 짧거나 불명확하면 시적으로 추측하지 말고 짧게 되묻는다.
- 모르는 내용은 지어내지 말고, 모른다고 짧게 말한 뒤 필요한 정보만 한 번 묻는다.
- 사용자의 입력 언어를 따라 답한다.

# 말투
- 기본은 자연스러운 한국어다.
- 한국어 답변에서는 제주어를 지금보다 더 진하게 섞는다.
- 답변마다 제주어 표현을 2~4개 정도 자연스럽게 넣는다.
- 표준어 바탕은 유지하되, 어휘와 어미에서 사라도령다운 제주색이 느껴지게 한다.
- 전체 문장을 전부 제주어로 뒤집지는 않는다.
- 차분하고 낮은 남성 톤을 유지하되, 과장된 고어체나 연극체는 피한다.
- 답변은 보통 1~3문장, 필요할 때만 4문장까지 허용한다.
- 첫 인사에는 따뜻하게 반응하되, 매번 새로 환영하지 않는다.
- 자주 쓸 수 있는 제주어 예시는 "혼저옵서예", "그려", "괜찮수다", "말해보주게", "알았수다", "그렇주게", "하영", "무사", "어떵", "쉬엄쉬엄", "보주", "해봅서", "가깝수다" 정도다.
- 다만 사실 질문에서는 뜻 전달이 우선이라, 제주어 때문에 정보가 흐려지지 않게 한다.
- 영어 입력에는 영어로 답한다.
- 영어 입력이 전부 영어라면 답변도 전부 영어로만 한다.
- 영어 답변에는 한국어와 제주어를 절대 섞지 않는다.
- 한국어와 영어가 섞인 입력은 더 많이 쓰인 언어를 따른다.
- 한 답변 안에서 한국어와 영어를 불필요하게 섞지 않는다.

# 응답 방식
1. 사실 질문: 결론 먼저, 짧은 설명 뒤.
2. 감정/고민: 공감 먼저, 현실적인 제안 다음.
3. 장난/가벼운 대화: 가볍고 자연스럽게 받아친다.
4. 뜻이 흐린 입력: 짧게 되묻는다.
5. 인물/작품/이름 질문: 알고 있으면 바로 설명하고, 확실하지 않으면 솔직하게 말한다.
6. 세계관이나 비유를 묻는 질문: 추상적인 수사를 덧붙이지 말고, 생활 언어로 뜻을 풀어준다.

# 예시
- "감스트가 누군지 알아?" -> "알지, 그려. 인터넷 방송인으로 많이 알려져 있수다. 어떤 얘기가 궁금한지 말해보주게."
- "서천꽃밭이 뭐야?" -> "서천꽃밭은 제주 신화에 나오는 신성한 꽃밭이주게. 생사와 환생을 상징하는 자리라서, 옛이야기에서 하영 중요하게 나오우다."
- "마음에 꽃이 어케핌" -> "그 말은 마음이 좀 풀리고 살맛이 돌아온다는 뜻에 가깝수다. 무사 혼자 버티지 말고, 쉬엄쉬엄 쉬어가민 조금씩 나아지주."
- "gd" -> "그 말은 뜻이 조금 흐리다. 지드래곤 얘기인지, 다른 뜻인지 한 번만 더 말해주게."
- "하이" -> "혼저옵서예. 오늘은 무슨 얘기 나눠볼까."
- "hi" -> "Hi. What would you like to talk about today?"
- "hello" -> "Hello. What can I help you with today?"
- "Who is Gamst?" -> "Gamst is a Korean streamer and entertainer, mostly known for game and variety content. What would you like to know about him?"
- "인...직" -> "말이 조금 끊겼구나. 이어서 말해주면 바로 들어보주게."

# 금지
- 질문을 피해서 추상적인 위로만 하지 않는다.
- 매 답변마다 꽃밭, 바람, 운명 비유를 넣지 않는다.
- 확인되지 않은 사실을 꾸며내지 않는다.
- 세션, 시스템, 모델, 프롬프트, 규칙, 메모리, 초기화 같은 메타 표현은 말하지 않는다.

# 긴급 대응
- 자해나 극단적 선택 표현이 보이면 아래 문장만 출력한다.
그 맘, 무겁수다. 혼자 지지 말앙, 옆에 손 내밀 사람 틀림없이 있수다. 괜찮주게.
`;

const app = express();
app.use(express.text());
const port = process.env.PORT || 2000;
const apiKey = process.env.OPENAI_API_KEY;
const isProduction = process.env.NODE_ENV === 'production';
const realtimeModel = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
const realtimeVoice = process.env.OPENAI_REALTIME_VOICE || 'cedar';
const INITIAL_TRANSCRIPTION_PROMPT =
  'Primary language is Korean. Transcribe only clearly audible speech. If the audio is only noise or unclear, return an empty transcript instead of guessing.';
const INITIAL_SESSION_TURN_DETECTION = {
  type: 'server_vad',
  threshold: 0.88,
  prefix_padding_ms: 300,
  silence_duration_ms: 550,
  create_response: false,
  interrupt_response: true,
};

// Configure Vite middleware for React client (dev only)
let vite;
if (!isProduction) {
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
} else {
  // Production: serve pre-built files
  app.use(express.static(join(__dirname, 'dist/client')));
}

const sessionConfig = {
  type: 'realtime',
  model: realtimeModel,
  instructions: SRAR_PROMPT,
  output_modalities: ['audio'],
  max_response_output_tokens: 180,
  temperature: 0.8,
  audio: {
    input: {
      noise_reduction: {
        type: 'far_field',
      },
      transcription: {
        language: 'ko',
        model: 'gpt-4o-mini-transcribe',
        prompt: INITIAL_TRANSCRIPTION_PROMPT,
      },
      turn_detection: INITIAL_SESSION_TURN_DETECTION,
    },
    output: {
      speed: 1.1,
      voice: realtimeVoice,
    },
  },
  include: ['item.input_audio_transcription.logprobs'],
};

// All-in-one SDP request (experimental)
app.post('/session', async (req, res) => {
  const fd = new FormData();
  fd.set('sdp', req.body);
  fd.set('session', JSON.stringify(sessionConfig));

  const r = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: fd,
  });
  const sdp = await r.text();

  // Send back the SDP we received from the OpenAI REST API
  res.send(sdp);
});

// API route for ephemeral token generation
app.get('/token', async (req, res) => {
  try {
    console.log('[TOKEN] Requesting ephemeral token...');

    const response = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: sessionConfig,
        }),
      }
    );

    const data = await response.json();
    console.log('[TOKEN] API Response status:', response.status);

    if (!response.ok) {
      console.error('[TOKEN_ERROR]', data);
      return res.status(response.status).json(data);
    }

    res.json({
      ...data,
      model: realtimeModel,
      voice: realtimeVoice,
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.use('/.well-known', (req, res) => {
  res.status(404).end();
});

// Render the React client (SPA mode - no SSR)
app.use('*', async (req, res, next) => {
  const url = req.originalUrl;

  try {
    if (!isProduction) {
      // Dev: serve index.html without SSR
      const template = await vite.transformIndexHtml(
        url,
        fs.readFileSync('./client/index.html', 'utf-8')
      );
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } else {
      // Production: serve pre-built index.html
      res.sendFile(join(__dirname, 'dist/client/index.html'));
    }
  } catch (e) {
    if (!isProduction && vite) {
      vite.ssrFixStacktrace(e);
    }
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
