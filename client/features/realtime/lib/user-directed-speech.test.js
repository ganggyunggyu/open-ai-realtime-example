import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyUserDirectedSpeech } from './user-directed-speech.js';

test('leaves sensitivity-qualified utterances unfiltered by transcript intent', () => {
  const utteranceDecision = {
    audioSignals: {
      averageDelta: 0.18,
      peakDelta: 0.26,
      speechDurationMs: 920,
    },
    isQualified: true,
    reason: 'sensitivity_audio_signal',
    transcript: '우리 지금 몇 시에 만나?',
  };

  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision,
  });

  assert.equal(decision, utteranceDecision);
  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'sensitivity_audio_signal');
});

test('preserves audio-threshold rejections without transcript checks', () => {
  const utteranceDecision = {
    audioSignals: {
      averageDelta: 0.01,
      peakDelta: 0.02,
      speechDurationMs: 120,
    },
    isQualified: false,
    reason: 'audio_below_sensitivity_threshold',
    transcript: '안녕하세요',
  };

  const decision = qualifyUserDirectedSpeech({
    now: 10_000,
    utteranceDecision,
  });

  assert.equal(decision, utteranceDecision);
  assert.equal(decision.isQualified, false);
  assert.equal(decision.reason, 'audio_below_sensitivity_threshold');
});
