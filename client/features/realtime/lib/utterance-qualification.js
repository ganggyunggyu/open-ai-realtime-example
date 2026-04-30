import {
  LOCAL_SPEECH_END_SILENCE_MS,
  LOCAL_SPEECH_LEVEL_THRESHOLD,
} from './constants.js';
import { getTranscriptText } from './session-events.js';

const MIN_DIRECT_INTENT_AUDIO_DURATION_MS = 320;
const MIN_STRONG_SHORT_INTENT_AUDIO_DURATION_MS = 520;
const MIN_LONG_FORM_AUDIO_DURATION_MS = 900;
const MIN_NEAR_FIELD_PEAK_DELTA = 0.08;
const MIN_NEAR_FIELD_AVERAGE_DELTA = 0.035;
const MIN_STRONG_SHORT_INTENT_PEAK_DELTA = 0.12;
const MAX_RECENT_AUDIO_ACTIVITY_AGE_MS = 4000;
const MIN_LONG_FORM_TRANSCRIPT_WORD_COUNT = 4;
const MIN_LONG_FORM_TRANSCRIPT_CHAR_COUNT = 14;
const MIN_VERY_LONG_TRANSCRIPT_CHAR_COUNT = 22;
const MAX_BRIEF_REACTION_WORD_COUNT = 4;
const MAX_BRIEF_REACTION_CHAR_COUNT = 12;
const MIN_CONTINUOUS_PLAYBACK_DURATION_MS = 2400;
const MIN_CONTINUOUS_PLAYBACK_AVERAGE_DELTA = 0.12;
const MIN_CONTINUOUS_PLAYBACK_CONSISTENCY = 0.78;
const LETTER_OR_NUMBER_PATTERN =
  /[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u3400-\u9FBF\uAC00-\uD7A3]/;
const NON_TEXT_PATTERN =
  /[^A-Za-z0-9\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u3400-\u9FBF\uAC00-\uD7A3\s]/g;

const SHORT_FILLER_TRANSCRIPTS = new Set([
  '아',
  '어',
  '음',
  '음음',
  '응',
  '네',
  '예',
  '아니',
  '아냐',
  '그래',
  '맞아',
  '오케이',
  'ok',
  'okay',
  '와',
  '헉',
  '헐',
  'wow',
  'oh',
  'ah',
  'uh',
  'um',
  'hmm',
]);

const HUMAN_CHATTER_PATTERNS = [
  /(대박|헐|어머|어휴|아이고|잠깐만|잠깐|진짜|정말)/i,
  /\b(wow|oh my god|seriously|no way|my god)\b/i,
];

const BRIEF_REACTION_PATTERNS = [
  /^(뭐야|뭐지|뭔데|왜\s*이래|왜\s*그래|이거\s*뭐야|이게\s*뭐야|어\s*뭐야|어\s*뭐지|헐\s*뭐야|와\s*뭐야|아\s*진짜|어\s*진짜)([!?.,\s]*)$/i,
  /^(what(?:\s+was|\s+is|'s)\s+that|what the heck|what the hell|seriously)([!?.,\s]*)$/i,
];

const LAUGHTER_PATTERNS = [
  /^(하){2,}$/i,
  /^(헤){2,}$/i,
  /^(히){2,}$/i,
  /^(호){2,}$/i,
  /^(ha){2,}$/i,
  /^(he){2,}$/i,
  /^(hi){2,}$/i,
  /^lol(?:lol)*$/i,
  /^lmao$/i,
];

const CONTINUATION_PATTERNS = [
  /^(응|네|예|맞아|아니|그래)(\s|$)/i,
  /^(yeah|yep|nope|okay|ok|sure|right)(\s|$)/i,
];

const GREETING_INTENT_PATTERNS = [
  /^(안녕|안녕하세요|안녕하십니까|반가워|반갑습니다)(?:[\s,!.?]+(?:챗\s*gpt|챗지피티|chatgpt|지피티|gpt|assistant|어시스턴트|비서|컴퓨터|냥냥돌쇠|돌쇠|도령|도영)(?:야|아|님)?)?[\s,!.?]*$/i,
  /^(hello|hi|hey)(?:[\s,!.?]+(?:chatgpt|gpt|assistant|computer))?[\s,!.?]*$/i,
];

const LOCAL_SPEECH_START_THRESHOLD_RATIO = 0.72;
const LOCAL_SPEECH_CONTINUE_THRESHOLD_RATIO = 0.6;
const MIN_LOCAL_SPEECH_START_DELTA = 0.024;
const MIN_LOCAL_SPEECH_CONTINUE_DELTA = 0.015;
const MIN_LOCAL_SPEECH_STANDARD_WAKE_DURATION_MS = 260;
const MIN_LOCAL_SPEECH_STANDARD_WAKE_AVERAGE_DELTA = 0.018;
const MIN_LOCAL_SPEECH_STANDARD_WAKE_PEAK_DELTA = 0.05;
const MIN_LOCAL_SPEECH_SOFT_WAKE_DURATION_MS = 360;
const MIN_LOCAL_SPEECH_SOFT_WAKE_AVERAGE_DELTA = 0.022;
const MIN_LOCAL_SPEECH_SHORT_WAKE_DURATION_MS = 180;
const MIN_LOCAL_SPEECH_STRONG_WAKE_PEAK_DELTA = 0.075;
const MAX_LOCAL_SPEECH_WAKE_ACTIVITY_AGE_MS = 1100;
const LOCAL_SPEECH_SHORT_UTTERANCE_DURATION_MS = 1400;
const LOCAL_SPEECH_MIN_PAUSE_EXTENSION_MS = 180;
const LOCAL_SPEECH_MAX_PAUSE_EXTENSION_MS = 360;
const MAX_LOCAL_SPEECH_PEAK_DELTA_WITHOUT_EXTRA_PAUSE = 0.075;
const MAX_LOCAL_SPEECH_AVERAGE_DELTA_WITHOUT_EXTRA_PAUSE = 0.03;

const DIRECT_INTENT_PATTERNS = [
  /\?$/,
  /(뭐|왜|어디|언제|누구|어떻게|몇\s*시|얼마|무슨)\s*\??$/i,
  /(알려줘|말해줘|해줘|해주세요|해줄래|해\s+줄래|도와줘|도와줄래|보여줘|찾아줘|정리해줘|요약해줘|설명해줘|추천해줘|확인해줘|예약해줘|기록해줘|메모해줘|전화해줘|문자해줘|꺼줘|켜줘|열어줘|닫아줘|틀어줘|멈춰줘|바꿔줘|변경해줘|시작해줘|계속해줘|읽어줘)$/i,
  /\b(can you|could you|would you|please|tell me|show me|open|close|play|stop|start|turn on|turn off|set|call|message|summarize|explain|translate|what(?:'s| is)|how|why|when|where|who)\b/i,
];

const normalizeTranscript = (transcript) =>
  transcript.toLowerCase().replace(/\s+/g, ' ').trim();

const getAudioActivitySnapshot = (activity) => {
  if (!activity) {
    return null;
  }

  if (
    typeof activity.speechDurationMs === 'number' &&
    typeof activity.averageSpeechLevel === 'number'
  ) {
    return activity;
  }

  return finalizeAudioActivityState(activity);
};

const getAudioActivityMetrics = (activity, now = Date.now()) => {
  const snapshot = getAudioActivitySnapshot(activity);

  if (!snapshot) {
    return {
      activityAgeMs: Number.POSITIVE_INFINITY,
      averageDelta: 0,
      peakDelta: 0,
      speechDurationMs: 0,
    };
  }

  return {
    activityAgeMs: now - snapshot.lastSpeechAt,
    averageDelta: Math.max(
      0,
      snapshot.averageSpeechLevel - snapshot.noiseFloorLevel
    ),
    peakDelta: Math.max(0, snapshot.peakLevel - snapshot.noiseFloorLevel),
    speechDurationMs: snapshot.speechDurationMs,
  };
};

const getWordCount = (transcript) => {
  const plainTranscript = transcript.replace(NON_TEXT_PATTERN, ' ');

  return plainTranscript.split(/\s+/).filter(Boolean).length;
};

const getTranscriptSignals = (transcript) => {
  const normalizedTranscript = normalizeTranscript(transcript);
  const compactTranscript = normalizedTranscript.replace(/\s+/g, '');
  const textOnlyTranscript = normalizedTranscript.replace(NON_TEXT_PATTERN, ' ');
  const compactTextTranscript = textOnlyTranscript.replace(/\s+/g, '');
  const wordCount = getWordCount(normalizedTranscript);
  const hasLettersOrNumbers = LETTER_OR_NUMBER_PATTERN.test(normalizedTranscript);
  const hasGreetingIntent = GREETING_INTENT_PATTERNS.some((pattern) =>
    pattern.test(normalizedTranscript)
  );
  const hasDirectIntent =
    hasGreetingIntent ||
    DIRECT_INTENT_PATTERNS.some((pattern) => pattern.test(normalizedTranscript));
  const isShortFiller = SHORT_FILLER_TRANSCRIPTS.has(normalizedTranscript);
  const isHumanChatter =
    !hasDirectIntent &&
    wordCount <= 4 &&
    HUMAN_CHATTER_PATTERNS.some((pattern) => pattern.test(normalizedTranscript));
  const isContinuationResponse =
    !hasDirectIntent &&
    wordCount <= 3 &&
    CONTINUATION_PATTERNS.some((pattern) => pattern.test(normalizedTranscript));
  const isBriefReaction =
    wordCount <= MAX_BRIEF_REACTION_WORD_COUNT &&
    compactTextTranscript.length <= MAX_BRIEF_REACTION_CHAR_COUNT &&
    (BRIEF_REACTION_PATTERNS.some((pattern) =>
      pattern.test(normalizedTranscript)
    ) ||
      LAUGHTER_PATTERNS.some((pattern) =>
        pattern.test(compactTextTranscript)
      ));
  const isLongFormTranscript =
    wordCount >= MIN_LONG_FORM_TRANSCRIPT_WORD_COUNT ||
    compactTranscript.length >= MIN_LONG_FORM_TRANSCRIPT_CHAR_COUNT;
  const isVeryLongTranscript =
    compactTranscript.length >= MIN_VERY_LONG_TRANSCRIPT_CHAR_COUNT;

  return {
    compactTranscript,
    hasDirectIntent,
    hasGreetingIntent,
    hasLettersOrNumbers,
    isBriefReaction,
    isContinuationResponse,
    isHumanChatter,
    isLongFormTranscript,
    isShortFiller,
    isVeryLongTranscript,
    normalizedTranscript,
    wordCount,
  };
};

export const createAudioActivityState = ({ now, noiseFloorLevel }) => ({
  startedAt: now,
  lastSampleAt: now,
  lastSpeechAt: now,
  levelTotal: 0,
  noiseFloorLevel,
  peakLevel: 0,
  sampleCount: 0,
  speechLevelTotal: 0,
  speechSampleCount: 0,
});

export const getLocalSpeechDetectionThresholds = ({ noiseFloorLevel }) => {
  const safeNoiseFloorLevel = Number.isFinite(noiseFloorLevel)
    ? noiseFloorLevel
    : 0;

  return {
    continueThreshold: Math.max(
      LOCAL_SPEECH_LEVEL_THRESHOLD * LOCAL_SPEECH_CONTINUE_THRESHOLD_RATIO,
      safeNoiseFloorLevel + MIN_LOCAL_SPEECH_CONTINUE_DELTA
    ),
    startThreshold: Math.max(
      LOCAL_SPEECH_LEVEL_THRESHOLD * LOCAL_SPEECH_START_THRESHOLD_RATIO,
      safeNoiseFloorLevel + MIN_LOCAL_SPEECH_START_DELTA
    ),
  };
};

export const isLocalSpeechLevelActive = ({
  activity,
  level,
  noiseFloorLevel,
}) => {
  const { continueThreshold, startThreshold } = getLocalSpeechDetectionThresholds(
    {
      noiseFloorLevel,
    }
  );

  return level >= (activity ? continueThreshold : startThreshold);
};

export const recordAudioActivitySample = ({
  activity,
  isAboveSpeechThreshold,
  level,
  noiseFloorLevel,
  now,
}) => {
  const nextActivity =
    activity || createAudioActivityState({ now, noiseFloorLevel });

  nextActivity.lastSampleAt = now;
  nextActivity.levelTotal += level;
  nextActivity.sampleCount += 1;
  nextActivity.noiseFloorLevel = Math.min(
    nextActivity.noiseFloorLevel,
    noiseFloorLevel
  );

  if (level > nextActivity.peakLevel) {
    nextActivity.peakLevel = level;
  }

  if (isAboveSpeechThreshold) {
    nextActivity.lastSpeechAt = now;
    nextActivity.speechLevelTotal += level;
    nextActivity.speechSampleCount += 1;
  }

  return nextActivity;
};

export const shouldFinalizeAudioActivity = ({ activity, now }) =>
  Boolean(activity) &&
  now - activity.lastSpeechAt >= getLocalSpeechEndSilenceMs(activity);

export const finalizeAudioActivityState = (activity) => {
  if (!activity) {
    return null;
  }

  const { lastSampleAt, lastSpeechAt, sampleCount, speechSampleCount, startedAt } =
    activity;
  const totalDurationMs = Math.max(0, lastSampleAt - startedAt);
  const averageFrameDurationMs =
    sampleCount > 1 ? totalDurationMs / (sampleCount - 1) : 16;
  const speechDurationMs = Math.max(
    lastSpeechAt - startedAt,
    averageFrameDurationMs * speechSampleCount
  );

  return {
    averageLevel:
      sampleCount > 0 ? activity.levelTotal / sampleCount : 0,
    averageSpeechLevel:
      speechSampleCount > 0
        ? activity.speechLevelTotal / speechSampleCount
        : 0,
    completedAt: lastSampleAt,
    lastSpeechAt,
    noiseFloorLevel: activity.noiseFloorLevel,
    peakLevel: activity.peakLevel,
    speechDurationMs,
    speechSampleCount,
    startedAt,
  };
};

export const getLocalSpeechEndSilenceMs = (activity) => {
  const {
    averageDelta,
    peakDelta,
    speechDurationMs,
  } = getAudioActivityMetrics(activity);

  let silenceDurationMs = LOCAL_SPEECH_END_SILENCE_MS;

  if (speechDurationMs <= LOCAL_SPEECH_SHORT_UTTERANCE_DURATION_MS) {
    silenceDurationMs += LOCAL_SPEECH_MIN_PAUSE_EXTENSION_MS;
  }

  if (
    peakDelta <= MAX_LOCAL_SPEECH_PEAK_DELTA_WITHOUT_EXTRA_PAUSE ||
    averageDelta <= MAX_LOCAL_SPEECH_AVERAGE_DELTA_WITHOUT_EXTRA_PAUSE
  ) {
    silenceDurationMs += LOCAL_SPEECH_MIN_PAUSE_EXTENSION_MS;
  }

  return Math.min(
    silenceDurationMs,
    LOCAL_SPEECH_END_SILENCE_MS + LOCAL_SPEECH_MAX_PAUSE_EXTENSION_MS
  );
};

export const shouldWakeFromLocalSpeech = ({
  activity,
  now = Date.now(),
}) => {
  const {
    activityAgeMs,
    averageDelta,
    peakDelta,
    speechDurationMs,
  } = getAudioActivityMetrics(activity, now);

  if (activityAgeMs > MAX_LOCAL_SPEECH_WAKE_ACTIVITY_AGE_MS) {
    return false;
  }

  if (
    peakDelta >= MIN_LOCAL_SPEECH_STRONG_WAKE_PEAK_DELTA &&
    speechDurationMs >= MIN_LOCAL_SPEECH_SHORT_WAKE_DURATION_MS
  ) {
    return true;
  }

  if (
    averageDelta >= MIN_LOCAL_SPEECH_SOFT_WAKE_AVERAGE_DELTA &&
    speechDurationMs >= MIN_LOCAL_SPEECH_SOFT_WAKE_DURATION_MS
  ) {
    return true;
  }

  return (
    averageDelta >= MIN_LOCAL_SPEECH_STANDARD_WAKE_AVERAGE_DELTA &&
    peakDelta >= MIN_LOCAL_SPEECH_STANDARD_WAKE_PEAK_DELTA &&
    speechDurationMs >= MIN_LOCAL_SPEECH_STANDARD_WAKE_DURATION_MS
  );
};

export const selectRecentAudioActivity = ({
  activeActivity,
  completedActivity,
}) => {
  const candidates = [];

  if (activeActivity) {
    const activeSnapshot = finalizeAudioActivityState(activeActivity);

    if (activeSnapshot) {
      candidates.push(activeSnapshot);
    }
  }

  if (completedActivity) {
    candidates.push(completedActivity);
  }

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort(
    (left, right) => right.lastSpeechAt - left.lastSpeechAt
  )[0];
};

const getAudioSignals = (activity, now) => {
  if (!activity) {
    return {
      activityAgeMs: Number.POSITIVE_INFINITY,
      averageDelta: 0,
      hasDirectIntentSignal: false,
      hasLongFormSignal: false,
      hasNearFieldSignal: false,
      hasStrongShortIntentSignal: false,
      isLikelyContinuousPlayback: false,
      isMissing: true,
      isStale: true,
      peakDelta: 0,
      speechLevelConsistency: 0,
      speechDurationMs: 0,
    };
  }

  const activityAgeMs = now - activity.lastSpeechAt;
  const peakDelta = Math.max(0, activity.peakLevel - activity.noiseFloorLevel);
  const averageDelta = Math.max(
    0,
    activity.averageSpeechLevel - activity.noiseFloorLevel
  );
  const speechLevelConsistency =
    peakDelta > 0
      ? Number.parseFloat((averageDelta / peakDelta).toFixed(3))
      : 0;
  const hasNearFieldSignal =
    peakDelta >= MIN_NEAR_FIELD_PEAK_DELTA ||
    averageDelta >= MIN_NEAR_FIELD_AVERAGE_DELTA;
  const isLikelyContinuousPlayback =
    activity.speechDurationMs >= MIN_CONTINUOUS_PLAYBACK_DURATION_MS &&
    averageDelta >= MIN_CONTINUOUS_PLAYBACK_AVERAGE_DELTA &&
    speechLevelConsistency >= MIN_CONTINUOUS_PLAYBACK_CONSISTENCY;

  return {
    activityAgeMs,
    averageDelta,
    hasDirectIntentSignal:
      activity.speechDurationMs >= MIN_DIRECT_INTENT_AUDIO_DURATION_MS &&
      hasNearFieldSignal,
    hasLongFormSignal:
      activity.speechDurationMs >= MIN_LONG_FORM_AUDIO_DURATION_MS &&
      hasNearFieldSignal,
    hasNearFieldSignal,
    hasStrongShortIntentSignal:
      activity.speechDurationMs >= MIN_STRONG_SHORT_INTENT_AUDIO_DURATION_MS &&
      peakDelta >= MIN_STRONG_SHORT_INTENT_PEAK_DELTA,
    isLikelyContinuousPlayback,
    isMissing: false,
    isStale: activityAgeMs > MAX_RECENT_AUDIO_ACTIVITY_AGE_MS,
    peakDelta,
    speechLevelConsistency,
    speechDurationMs: activity.speechDurationMs,
  };
};

const createAcceptedDecision = ({
  audioSignals,
  reason,
  transcript,
  transcriptSignals,
}) => ({
  audioSignals,
  isQualified: true,
  reason,
  transcript,
  transcriptSignals,
});

export const qualifyUtterance = ({
  activity,
  event,
  now = Date.now(),
}) => {
  const transcript = getTranscriptText(event);
  const transcriptSignals = getTranscriptSignals(transcript);
  const audioSignals = getAudioSignals(activity, now);

  return createAcceptedDecision({
    audioSignals,
    reason: 'realtime_transcription_completed',
    transcript,
    transcriptSignals,
  });
};
