import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyUserDirectedSpeech } from './user-directed-speech.js';

const buildUtteranceDecision = (overrides = {}) => ({
  audioSignals: {
    averageDelta: 0.18,
    isLikelyContinuousPlayback: false,
    peakDelta: 0.26,
    speechLevelConsistency: 0.692,
    speechDurationMs: 920,
  },
  isQualified: true,
  reason: 'direct_intent_with_near_field_audio',
  transcript: '오늘 일정 정리해줘',
  transcriptSignals: {
    hasDirectIntent: true,
    isContinuationResponse: false,
    isLongFormTranscript: true,
  },
  ...overrides,
});

test('accepts explicit device-directed queries without a wake word', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '지금 몇 시야?',
    }),
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'device_directed_request');
});

test('rejects nearby human conversation even when it sounds like a direct question', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '우리 지금 몇 시에 만나?',
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'nearby_conversation_not_device_directed');
});

test('rejects nearby human conversation that contains a request-shaped sentence', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '엄마, 오늘 일정 정리해줘',
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'nearby_conversation_not_device_directed');
});

test('rejects a human-name vocative before a direct-question phrase', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '민수야, 지금 몇 시야?',
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'nearby_conversation_not_device_directed');
});

test('keeps explicit device-addressed requests qualified after nearby conversation tightening', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '챗지피티야, 오늘 일정 정리해줘',
    }),
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'device_directed_request');
});

test('accepts assistant greetings even when transcription uses a nearby alias', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '안녕하세요, 도영?',
      transcriptSignals: {
        hasDirectIntent: true,
        hasGreetingIntent: true,
        isContinuationResponse: false,
        isLongFormTranscript: false,
      },
    }),
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'device_directed_greeting');
});

test('accepts standalone greetings as a device-directed opening', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '안녕하세요',
      transcriptSignals: {
        hasDirectIntent: true,
        hasGreetingIntent: true,
        isContinuationResponse: false,
        isLongFormTranscript: false,
      },
    }),
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'device_directed_greeting');
});

test('rejects schedule chatter that lacks a device-directed query or request', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '오늘 일정 얘기했어?',
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'ambiguous_not_device_directed');
});

test('rejects TV-like playback that briefly sounds like a direct question', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      audioSignals: {
        averageDelta: 0.19,
        isLikelyContinuousPlayback: true,
        peakDelta: 0.24,
        speechDurationMs: 3_400,
      },
      transcript: '지금 몇 시야?',
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'background_media_playback');
});

test('accepts short follow-up speech when there is recent assistant context', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    recentAssistantActivityAtMs: 9_500,
    utteranceDecision: buildUtteranceDecision({
      transcript: '응, 그 방향으로 진행해줘',
      transcriptSignals: {
        hasDirectIntent: true,
        isContinuationResponse: true,
        isLongFormTranscript: false,
      },
    }),
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'assistant_contextual_follow_up');
});

test('rejects short ambiguous follow-up speech without recent assistant context', () => {
  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision: buildUtteranceDecision({
      transcript: '응, 그 방향으로 진행해줘',
      transcriptSignals: {
        hasDirectIntent: true,
        isContinuationResponse: true,
        isLongFormTranscript: false,
      },
    }),
  });

  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'ambiguous_follow_up_without_device_context');
});
