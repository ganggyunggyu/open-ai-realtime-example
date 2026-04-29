import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInputLevelNormalizerState,
  getInputGateDecision,
  getDynamicSpeechThreshold,
  normalizeInputLevel,
  updateInputLevelNormalizerState,
} from './input-gate.js';

test('raises the speech threshold above the ambient floor', () => {
  const threshold = getDynamicSpeechThreshold({
    ambientNoiseFloor: 0.18,
  });

  assert.equal(threshold, 0.25);
});

test('keeps the gate closed for low ambient room noise', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.06,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: 0.11,
    now: 5_000,
  });

  assert.equal(decision.gateShouldBeOpen, false);
  assert.equal(decision.shouldTrackSpeech, false);
  assert.ok(decision.speechDelta < decision.openDeltaThreshold);
});

test('keeps the gate closed for steady TV-like playback near the floor', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.17,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: 0.22,
    now: 5_000,
  });

  assert.equal(decision.gateShouldBeOpen, false);
  assert.equal(decision.shouldTrackSpeech, false);
  assert.equal(decision.speechThreshold, 0.24);
});

test('opens the gate immediately for close-range speech', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.05,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: 0.31,
    now: 5_000,
  });

  assert.equal(decision.gateShouldBeOpen, true);
  assert.equal(decision.hasFreshGateSignal, true);
  assert.equal(decision.shouldTrackSpeech, true);
});

test('opens the gate for soft near-field speech in a quiet room', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.13,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: 0.19,
    now: 5_000,
  });

  assert.equal(decision.gateShouldBeOpen, true);
  assert.equal(decision.hasGateSignal, true);
  assert.equal(decision.hasSoftSpeechSignal, true);
  assert.equal(decision.shouldTrackSpeech, true);
});

test('holds the gate open after a soft near-field speech frame', () => {
  const softSpeechDecision = getInputGateDecision({
    ambientNoiseFloor: 0.13,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: 0.19,
    now: 5_000,
  });
  const holdDecision = getInputGateDecision({
    ambientNoiseFloor: 0.13,
    isGateOpen: true,
    lastGateSignalAt: 5_000,
    level: 0.165,
    now: 5_350,
  });

  assert.equal(softSpeechDecision.hasFreshGateSignal, false);
  assert.equal(softSpeechDecision.hasGateSignal, true);
  assert.equal(holdDecision.gateShouldBeOpen, true);
  assert.equal(holdDecision.hasFreshGateSignal, false);
});

test('briefly holds the gate open across a short pause', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.05,
    isGateOpen: true,
    lastGateSignalAt: 4_800,
    level: 0.14,
    now: 5_050,
  });

  assert.equal(decision.gateShouldBeOpen, true);
  assert.equal(decision.hasFreshGateSignal, false);
});

test('holds the gate open across a naturally paced pause', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.05,
    isGateOpen: true,
    lastGateSignalAt: 4_300,
    level: 0.14,
    now: 5_050,
  });

  assert.equal(decision.gateShouldBeOpen, true);
  assert.equal(decision.hasFreshGateSignal, false);
});

test('closes the gate after the hold window expires', () => {
  const decision = getInputGateDecision({
    ambientNoiseFloor: 0.05,
    isGateOpen: true,
    lastGateSignalAt: 4_000,
    level: 0.13,
    now: 5_000,
  });

  assert.equal(decision.gateShouldBeOpen, false);
});

test('keeps adaptive input normalization neutral during idle ambient noise', () => {
  let normalizerState = createInputLevelNormalizerState();
  const samples = [0.042, 0.046, 0.044, 0.047, 0.045];

  samples.forEach((level, index) => {
    normalizerState = updateInputLevelNormalizerState({
      ambientNoiseFloor: 0.04,
      level,
      now: 1_000 + index * 50,
      state: normalizerState,
    });
  });

  assert.equal(normalizerState.gain, 1);
  assert.equal(
    normalizeInputLevel({
      level: 0.047,
      normalizerState,
    }),
    0.047
  );
});

test('adapts low-level microphone input so sustained speech still opens the gate', () => {
  const rawAmbientNoiseFloor = 0.035;
  const rawSpeechLevel = 0.15;
  const rawDecision = getInputGateDecision({
    ambientNoiseFloor: rawAmbientNoiseFloor,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: rawSpeechLevel,
    now: 5_000,
  });
  let normalizerState = createInputLevelNormalizerState();

  [0.112, 0.128, 0.141, 0.152, 0.158, 0.15].forEach((level, index) => {
    normalizerState = updateInputLevelNormalizerState({
      ambientNoiseFloor: rawAmbientNoiseFloor,
      level,
      now: 5_000 + index * 70,
      state: normalizerState,
    });
  });

  const normalizedAmbientNoiseFloor = normalizeInputLevel({
    level: rawAmbientNoiseFloor,
    normalizerState,
  });
  const normalizedSpeechLevel = normalizeInputLevel({
    level: rawSpeechLevel,
    normalizerState,
  });
  const normalizedDecision = getInputGateDecision({
    ambientNoiseFloor: normalizedAmbientNoiseFloor,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: normalizedSpeechLevel,
    now: 5_420,
  });

  assert.equal(rawDecision.gateShouldBeOpen, false);
  assert.ok(normalizerState.gain > 1);
  assert.ok(normalizedSpeechLevel > rawSpeechLevel);
  assert.equal(normalizedDecision.gateShouldBeOpen, true);
  assert.equal(normalizedDecision.shouldTrackSpeech, true);
});

test('does not over-amplify a brief low-level burst', () => {
  const rawAmbientNoiseFloor = 0.04;
  let normalizerState = createInputLevelNormalizerState();

  [0.109, 0.118].forEach((level, index) => {
    normalizerState = updateInputLevelNormalizerState({
      ambientNoiseFloor: rawAmbientNoiseFloor,
      level,
      now: 8_000 + index * 60,
      state: normalizerState,
    });
  });

  const normalizedAmbientNoiseFloor = normalizeInputLevel({
    level: rawAmbientNoiseFloor,
    normalizerState,
  });
  const normalizedBurstLevel = normalizeInputLevel({
    level: 0.118,
    normalizerState,
  });
  const burstDecision = getInputGateDecision({
    ambientNoiseFloor: normalizedAmbientNoiseFloor,
    isGateOpen: false,
    lastGateSignalAt: 0,
    level: normalizedBurstLevel,
    now: 8_120,
  });

  assert.ok(normalizerState.gain <= 1.1);
  assert.equal(burstDecision.gateShouldBeOpen, false);
  assert.equal(burstDecision.shouldTrackSpeech, false);
});
