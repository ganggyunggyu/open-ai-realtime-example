import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAudioActivityState,
  finalizeAudioActivityState,
  isLocalSpeechLevelActive,
  qualifyUtterance,
  recordAudioActivitySample,
  shouldFinalizeAudioActivity,
  shouldWakeFromLocalSpeech,
} from './utterance-qualification.js';

const buildTranscriptionEvent = (transcript, logprob = -0.15) => ({
  transcript,
  logprobs: [{ logprob }],
  type: 'conversation.item.input_audio_transcription.completed',
});

const buildAudioActivity = ({
  durationMs = 1200,
  peakLevel = 0.34,
  averageSpeechLevel = 0.26,
  noiseFloorLevel = 0.08,
  now = 10_000,
} = {}) => ({
  averageLevel: averageSpeechLevel,
  averageSpeechLevel,
  completedAt: now,
  lastSpeechAt: now,
  noiseFloorLevel,
  peakLevel,
  speechDurationMs: durationMs,
  speechSampleCount: Math.max(1, Math.round(durationMs / 16)),
  startedAt: now - durationMs,
});

test('records and finalizes browser audio activity for an utterance', () => {
  const startAt = 1_000;
  let activity = createAudioActivityState({
    now: startAt,
    noiseFloorLevel: 0.05,
  });

  activity = recordAudioActivitySample({
    activity,
    isAboveSpeechThreshold: true,
    level: 0.24,
    noiseFloorLevel: 0.05,
    now: startAt,
  });
  activity = recordAudioActivitySample({
    activity,
    isAboveSpeechThreshold: true,
    level: 0.31,
    noiseFloorLevel: 0.05,
    now: startAt + 150,
  });
  activity = recordAudioActivitySample({
    activity,
    isAboveSpeechThreshold: false,
    level: 0.09,
    noiseFloorLevel: 0.05,
    now: startAt + 320,
  });

  const finalized = finalizeAudioActivityState(activity);

  assert.equal(finalized.peakLevel, 0.31);
  assert.equal(finalized.noiseFloorLevel, 0.05);
  assert.ok(finalized.speechDurationMs >= 150);
  assert.ok(finalized.averageSpeechLevel > finalized.noiseFloorLevel);
});

test('treats quieter continuation frames as speech after local speech has started', () => {
  const noiseFloorLevel = 0.12;
  const level = 0.146;

  assert.equal(
    isLocalSpeechLevelActive({
      activity: null,
      level,
      noiseFloorLevel,
    }),
    false
  );
  assert.equal(
    isLocalSpeechLevelActive({
      activity: createAudioActivityState({
        now: 1_000,
        noiseFloorLevel,
      }),
      level,
      noiseFloorLevel,
    }),
    true
  );
});

test('keeps a short quiet utterance active across a natural pause before finalizing', () => {
  const noiseFloorLevel = 0.12;
  let activity = null;

  const appendSample = (level, now) => {
    const isAboveSpeechThreshold = isLocalSpeechLevelActive({
      activity,
      level,
      noiseFloorLevel,
    });

    activity = recordAudioActivitySample({
      activity,
      isAboveSpeechThreshold,
      level,
      noiseFloorLevel,
      now,
    });
  };

  appendSample(0.18, 1_000);
  appendSample(0.172, 1_180);
  appendSample(0.146, 1_360);
  appendSample(0.124, 1_520);

  assert.equal(
    shouldFinalizeAudioActivity({
      activity,
      now: 2_180,
    }),
    false
  );
  assert.equal(
    shouldFinalizeAudioActivity({
      activity,
      now: 2_700,
    }),
    true
  );
});

test('accepts close-range speech based on microphone sensitivity', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent('오늘 일정 정리해줘'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});

test('accepts a short assistant greeting with near-field audio', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent('안녕하세요, 도령.'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.transcriptSignals.hasGreetingIntent, true);
});

test('does not drop direct commands solely because transcription confidence is low', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent('오늘 일정 정리해줘', -3.5),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});

test('accepts empty transcripts when microphone sensitivity qualifies', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent(''),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});

test('treats short soft local speech as a valid wake signal', () => {
  const shouldWake = shouldWakeFromLocalSpeech({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.155,
      durationMs: 420,
      noiseFloorLevel: 0.13,
      peakLevel: 0.19,
    }),
    now: 10_000,
  });

  assert.equal(shouldWake, true);
});

test('treats short strong local speech as a valid wake signal', () => {
  const shouldWake = shouldWakeFromLocalSpeech({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.15,
      durationMs: 220,
      noiseFloorLevel: 0.12,
      peakLevel: 0.21,
    }),
    now: 10_000,
  });

  assert.equal(shouldWake, true);
});

test('accepts short filler transcripts when microphone sensitivity qualifies', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.18,
      durationMs: 420,
      peakLevel: 0.22,
    }),
    event: buildTranscriptionEvent('대박이네'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});

test('accepts short laughter transcripts when microphone sensitivity qualifies', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.2,
      durationMs: 640,
      peakLevel: 0.24,
    }),
    event: buildTranscriptionEvent('하하하'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.transcriptSignals.isBriefReaction, true);
});

test('accepts short reaction questions when microphone sensitivity qualifies', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.22,
      durationMs: 760,
      peakLevel: 0.28,
    }),
    event: buildTranscriptionEvent('뭐야?'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.transcriptSignals.isBriefReaction, true);
});

test('keeps longer intentional speech even when it starts with laughter', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent('하하 농담이고 오늘 일정 알려줘'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.transcriptSignals.isBriefReaction, false);
});

test('accepts transcription completion even without local audio support', () => {
  const decision = qualifyUtterance({
    activity: null,
    event: buildTranscriptionEvent('안녕, 살아두령?'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.audioSignals.isMissing, true);
});

test('marks sustained compressed audio as likely continuous playback', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity({
      averageSpeechLevel: 0.255,
      durationMs: 3_200,
      noiseFloorLevel: 0.08,
      peakLevel: 0.285,
    }),
    event: buildTranscriptionEvent('지금 몇 시야?'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
  assert.equal(decision.audioSignals.isLikelyContinuousPlayback, true);
  assert.ok(decision.audioSignals.speechLevelConsistency >= 0.8);
});

test('accepts duplicate transcripts when microphone sensitivity qualifies', () => {
  const decision = qualifyUtterance({
    activity: buildAudioActivity(),
    event: buildTranscriptionEvent('오늘  일정   정리해줘'),
    now: 10_000,
  });

  assert.equal(decision.isQualified, true);
  assert.equal(decision.reason, 'realtime_transcription_completed');
});
