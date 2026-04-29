import {
  LOCAL_INPUT_GATE_CLOSE_DELTA,
  LOCAL_INPUT_GATE_CLOSE_LEVEL_THRESHOLD,
  LOCAL_INPUT_GATE_HOLD_MS,
  LOCAL_INPUT_GATE_OPEN_DELTA,
  LOCAL_INPUT_GATE_OPEN_LEVEL_THRESHOLD,
  LOCAL_SPEECH_DELTA_THRESHOLD,
  LOCAL_SPEECH_LEVEL_THRESHOLD,
} from './constants.js';

const SOFT_SPEECH_OPEN_DELTA = 0.045;
const SOFT_SPEECH_OPEN_LEVEL_THRESHOLD = 0.165;
const SOFT_SPEECH_MAX_AMBIENT_FLOOR = 0.16;
const INPUT_LEVEL_NORMALIZATION_MIN_DELTA = 0.03;
const INPUT_LEVEL_NORMALIZATION_TARGET_PEAK = 0.28;
const INPUT_LEVEL_NORMALIZATION_MIN_REFERENCE_LEVEL = 0.16;
const INPUT_LEVEL_NORMALIZATION_MAX_GAIN = 1.75;
const INPUT_LEVEL_NORMALIZATION_MIN_SUSTAINED_MS = 150;
const INPUT_LEVEL_NORMALIZATION_GAIN_ALPHA = 0.5;
const INPUT_LEVEL_NORMALIZATION_PEAK_DECAY = 0.008;
const INPUT_LEVEL_NORMALIZATION_ACTIVITY_GAP_MS = 160;

const roundLevel = (value) => Number.parseFloat(value.toFixed(3));

const getNormalizedInputGain = (candidatePeakLevel) =>
  roundLevel(
    Math.min(
      INPUT_LEVEL_NORMALIZATION_MAX_GAIN,
      Math.max(
        1,
        INPUT_LEVEL_NORMALIZATION_TARGET_PEAK /
          Math.max(
            INPUT_LEVEL_NORMALIZATION_MIN_REFERENCE_LEVEL,
            candidatePeakLevel
          )
      )
    )
  );

export const createInputLevelNormalizerState = () => ({
  activeSince: null,
  candidatePeakLevel: 0,
  gain: 1,
  lastCandidateAt: 0,
});

export const updateInputLevelNormalizerState = ({
  ambientNoiseFloor,
  level,
  now,
  state,
}) => {
  const previousState = state || createInputLevelNormalizerState();
  const signalDelta = Math.max(0, level - ambientNoiseFloor);
  const isCandidateSignal = signalDelta >= INPUT_LEVEL_NORMALIZATION_MIN_DELTA;
  const isContinuousCandidate =
    isCandidateSignal &&
    previousState.lastCandidateAt > 0 &&
    now - previousState.lastCandidateAt <=
      INPUT_LEVEL_NORMALIZATION_ACTIVITY_GAP_MS;
  const activeSince = isCandidateSignal
    ? isContinuousCandidate && previousState.activeSince !== null
      ? previousState.activeSince
      : now
    : null;
  const candidateDurationMs = activeSince === null ? 0 : now - activeSince;
  const candidatePeakLevel = isCandidateSignal
    ? Math.max(level, previousState.candidatePeakLevel)
    : Math.max(
        0,
        previousState.candidatePeakLevel - INPUT_LEVEL_NORMALIZATION_PEAK_DECAY
      );
  const targetGain =
    candidateDurationMs >= INPUT_LEVEL_NORMALIZATION_MIN_SUSTAINED_MS
      ? getNormalizedInputGain(candidatePeakLevel)
      : 1;
  const gain = roundLevel(
    previousState.gain +
      (targetGain - previousState.gain) * INPUT_LEVEL_NORMALIZATION_GAIN_ALPHA
  );

  return {
    activeSince,
    candidatePeakLevel: roundLevel(candidatePeakLevel),
    gain,
    lastCandidateAt: isCandidateSignal ? now : previousState.lastCandidateAt,
  };
};

export const normalizeInputLevel = ({ level, normalizerState }) =>
  roundLevel(Math.max(0, Math.min(1, level * (normalizerState?.gain || 1))));

export const getDynamicSpeechThreshold = ({ ambientNoiseFloor }) =>
  roundLevel(
    Math.max(
      LOCAL_SPEECH_LEVEL_THRESHOLD,
      ambientNoiseFloor + LOCAL_SPEECH_DELTA_THRESHOLD
    )
  );

export const getInputGateDecision = ({
  ambientNoiseFloor,
  isGateOpen,
  lastGateSignalAt,
  level,
  now,
}) => {
  const speechDelta = Math.max(0, level - ambientNoiseFloor);
  const speechThreshold = getDynamicSpeechThreshold({
    ambientNoiseFloor,
  });
  const openDeltaThreshold = Math.max(
    LOCAL_INPUT_GATE_OPEN_DELTA,
    speechThreshold - ambientNoiseFloor
  );
  const openLevelThreshold = Math.max(
    LOCAL_INPUT_GATE_OPEN_LEVEL_THRESHOLD,
    ambientNoiseFloor + openDeltaThreshold
  );
  const closeLevelThreshold = Math.max(
    LOCAL_INPUT_GATE_CLOSE_LEVEL_THRESHOLD,
    ambientNoiseFloor + LOCAL_INPUT_GATE_CLOSE_DELTA
  );
  const softOpenLevelThreshold = Math.max(
    SOFT_SPEECH_OPEN_LEVEL_THRESHOLD,
    ambientNoiseFloor + SOFT_SPEECH_OPEN_DELTA
  );
  const hasFreshGateSignal =
    level >= openLevelThreshold && speechDelta >= openDeltaThreshold;
  const hasSoftSpeechSignal =
    ambientNoiseFloor <= SOFT_SPEECH_MAX_AMBIENT_FLOOR &&
    level >= softOpenLevelThreshold &&
    speechDelta >= SOFT_SPEECH_OPEN_DELTA;
  const isInsideHoldWindow =
    isGateOpen && now - lastGateSignalAt <= LOCAL_INPUT_GATE_HOLD_MS;
  const shouldHoldGate =
    isInsideHoldWindow &&
    level >= closeLevelThreshold &&
    speechDelta >= LOCAL_INPUT_GATE_CLOSE_DELTA;

  return {
    closeLevelThreshold,
    gateShouldBeOpen:
      hasFreshGateSignal || hasSoftSpeechSignal || shouldHoldGate,
    hasFreshGateSignal,
    hasGateSignal: hasFreshGateSignal || hasSoftSpeechSignal,
    hasSoftSpeechSignal,
    openDeltaThreshold: roundLevel(openDeltaThreshold),
    openLevelThreshold: roundLevel(openLevelThreshold),
    softOpenLevelThreshold: roundLevel(softOpenLevelThreshold),
    shouldTrackSpeech:
      hasFreshGateSignal ||
      hasSoftSpeechSignal ||
      (level >= speechThreshold &&
        speechDelta >= LOCAL_SPEECH_DELTA_THRESHOLD),
    speechDelta: roundLevel(speechDelta),
    speechThreshold,
  };
};
