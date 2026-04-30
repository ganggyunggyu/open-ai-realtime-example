import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyUserDirectedSpeech } from './user-directed-speech.js';

test('leaves realtime transcription completions unfiltered by transcript intent', () => {
  const utteranceDecision = {
    audioSignals: {
      averageDelta: 0.18,
      peakDelta: 0.26,
      speechDurationMs: 920,
    },
    isQualified: true,
    reason: 'realtime_transcription_completed',
    transcript: '우리 지금 몇 시에 만나?',
  };

  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision,
  });

  assert.equal(decision, utteranceDecision);
  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});

test('preserves upstream rejections without adding transcript checks', () => {
  const utteranceDecision = {
    audioSignals: {
      averageDelta: 0.01,
      peakDelta: 0.02,
      speechDurationMs: 120,
    },
    isQualified: false,
    reason: 'upstream_rejection',
    transcript: '안녕하세요',
  };

  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision,
  });

  assert.equal(decision, utteranceDecision);
  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'upstream_rejection');
});
