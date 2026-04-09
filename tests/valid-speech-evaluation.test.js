import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHROME_VALIDATION_TEST_SET,
  CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
  CHROME_RESPONSE_LATENCY_VALIDATION_CASE_IDS,
  NON_TRIGGER_VALIDATION_TEST_SET,
  VALIDATION_CASE_EXPECTATION,
  VALID_UTTERANCE_PLATFORM_OPTIONS,
  VALID_UTTERANCE_TEST_SET,
} from '../client/features/realtime/lib/valid-utterance-test-set.js';
import {
  createEmptyPlatformRun,
  evaluateValidationAttempt,
  evaluateTranscriptMatch,
  parseValidSpeechExportPayload,
  summarizeCrossPlatformLatencyVerification,
  summarizeCrossPlatformValidSpeechVerification,
  summarizeValidSpeechRun,
  upsertValidSpeechResult,
  VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
} from '../client/features/realtime/lib/valid-speech-evaluation.js';

const createCompletedPlatformResults = ({
  missedTriggerIds = [],
  platformId,
  responseLatencyByTestCaseId = {},
}) =>
  CHROME_VALIDATION_TEST_SET.map((testCase, index) => {
    const isTrigger =
      testCase.expectedBehavior === VALIDATION_CASE_EXPECTATION.TRIGGER;
    const isMiss = isTrigger && missedTriggerIds.includes(testCase.id);
    const responseLatencyMs =
      responseLatencyByTestCaseId[testCase.id] ?? 800 + index * 10;

    return {
      expectedBehavior: testCase.expectedBehavior,
      failureReason: isMiss ? 'no_response' : null,
      platformId,
      recordedAt: `2026-03-31T10:${String(index).padStart(2, '0')}:00.000Z`,
      responseLatencyMs: isTrigger && !isMiss ? responseLatencyMs : null,
      status: isMiss ? 'miss' : 'pass',
      testCaseId: testCase.id,
    };
  });

test('all valid utterance cases target Chrome on Windows and macOS', () => {
  const platformIds = VALID_UTTERANCE_PLATFORM_OPTIONS.map(({ id }) => id);

  VALID_UTTERANCE_TEST_SET.forEach((testCase) => {
    assert.equal(Array.isArray(testCase.targetPlatforms), true);
    assert.deepEqual(testCase.targetPlatforms.sort(), platformIds.sort());
    assert.ok(testCase.prompt.length > 0);
    assert.ok(testCase.acceptedPhrases.length > 0);
    assert.ok(testCase.expectedKeywords.length > 0);
  });
});

test('chrome validation set covers auto-trigger and suppression scenarios on both platforms', () => {
  const platformIds = VALID_UTTERANCE_PLATFORM_OPTIONS.map(({ id }) => id);
  const expectedBehaviors = new Set(
    CHROME_VALIDATION_TEST_SET.map(({ expectedBehavior }) => expectedBehavior)
  );
  const suppressionTags = new Set(
    NON_TRIGGER_VALIDATION_TEST_SET.flatMap(({ tags }) => tags)
  );

  assert.deepEqual([...expectedBehaviors].sort(), [
    VALIDATION_CASE_EXPECTATION.SUPPRESS,
    VALIDATION_CASE_EXPECTATION.TRIGGER,
  ]);
  assert.ok(suppressionTags.has('tv-audio'));
  assert.ok(suppressionTags.has('incidental-speech'));
  assert.ok(suppressionTags.has('ambient-noise'));
  assert.ok(
    NON_TRIGGER_VALIDATION_TEST_SET.some(
      ({ id }) => id === 'short-laughter-burst'
    )
  );
  assert.ok(
    NON_TRIGGER_VALIDATION_TEST_SET.some(
      ({ id }) => id === 'brief-reaction-question'
    )
  );

  CHROME_VALIDATION_TEST_SET.forEach((testCase) => {
    assert.deepEqual(testCase.targetPlatforms.slice().sort(), platformIds.slice().sort());
    assert.ok(testCase.notes.length > 0);
    assert.ok(testCase.tags.length > 0);
  });
});

test('representative latency validation set covers Chrome Windows and macOS trigger cases only', () => {
  const platformIds = VALID_UTTERANCE_PLATFORM_OPTIONS.map(({ id }) => id);

  assert.deepEqual(
    CHROME_RESPONSE_LATENCY_VALIDATION_CASES.map(({ id }) => id),
    CHROME_RESPONSE_LATENCY_VALIDATION_CASE_IDS
  );
  assert.equal(CHROME_RESPONSE_LATENCY_VALIDATION_CASES.length > 0, true);

  CHROME_RESPONSE_LATENCY_VALIDATION_CASES.forEach((testCase) => {
    assert.equal(testCase.expectedBehavior, VALIDATION_CASE_EXPECTATION.TRIGGER);
    assert.deepEqual(testCase.targetPlatforms.slice().sort(), platformIds.slice().sort());
    assert.ok(testCase.notes.length > 0);
  });
});

test('evaluateTranscriptMatch accepts phrase variants and keyword overlap', () => {
  const testCase = VALID_UTTERANCE_TEST_SET.find(
    ({ id }) => id === 'five-minute-follow-up'
  );

  const exactPhrase = evaluateTranscriptMatch({
    testCase,
    transcript: '오분 뒤에 다시 확인하자',
  });
  const keywordMatch = evaluateTranscriptMatch({
    testCase,
    transcript: '5분 뒤에 다시 확인하자고 말했어',
  });
  const mismatch = evaluateTranscriptMatch({
    testCase,
    transcript: 'TV 볼륨만 줄여줘',
  });

  assert.equal(exactPhrase.isMatch, true);
  assert.equal(keywordMatch.isMatch, true);
  assert.equal(mismatch.isMatch, false);
});

test('evaluateValidationAttempt passes a trigger case only when matching transcript and response both occur', () => {
  const testCase = VALID_UTTERANCE_TEST_SET.find(
    ({ id }) => id === 'daily-summary-request'
  );
  const passingResult = evaluateValidationAttempt({
    armedAtMs: 1_000,
    matchedTranscript: {
      matchedKeywords: ['오늘', '일정', '요약'],
      matchedPhrase: '오늘 일정 요약해줘',
      observedAtMs: 1_450,
      transcript: '오늘 일정 요약해줘',
    },
    platformId: 'chrome-macos',
    responseStartedAtMs: 1_980,
    testCase,
    recordedAt: '2026-03-31T10:00:00.000Z',
  });
  const missedResult = evaluateValidationAttempt({
    armedAtMs: 1_000,
    matchedTranscript: {
      matchedKeywords: ['오늘', '일정', '요약'],
      matchedPhrase: '오늘 일정 요약해줘',
      observedAtMs: 1_450,
      transcript: '오늘 일정 요약해줘',
    },
    platformId: 'chrome-macos',
    responseStartedAtMs: null,
    testCase,
    recordedAt: '2026-03-31T10:00:10.000Z',
  });

  assert.equal(passingResult.status, 'pass');
  assert.equal(passingResult.failureReason, null);
  assert.equal(passingResult.expectedBehavior, VALIDATION_CASE_EXPECTATION.TRIGGER);
  assert.equal(passingResult.responseLatencyMs, 530);
  assert.equal(passingResult.responseLatencySource, 'accepted_transcript');
  assert.equal(missedResult.status, 'miss');
  assert.equal(missedResult.failureReason, 'no_response');
});

test('evaluateValidationAttempt prefers utterance-end latency measurement when available', () => {
  const testCase = VALID_UTTERANCE_TEST_SET.find(
    ({ id }) => id === 'daily-summary-request'
  );
  const result = evaluateValidationAttempt({
    armedAtMs: 1_000,
    matchedTranscript: {
      matchedKeywords: ['오늘', '일정', '요약'],
      matchedPhrase: '오늘 일정 요약해줘',
      observedAtMs: 1_450,
      transcript: '오늘 일정 요약해줘',
    },
    platformId: 'chrome-macos',
    responseLatencyMeasurement: {
      latencyMs: 530,
      responseStartedAtMs: 1_980,
      utteranceEndedAtMs: 1_450,
    },
    responseStartedAtMs: 1_980,
    testCase,
    recordedAt: '2026-03-31T10:00:00.000Z',
  });

  assert.equal(result.status, 'pass');
  assert.equal(result.responseLatencyMs, 530);
  assert.equal(result.responseLatencySource, 'utterance_end');
  assert.equal(result.utteranceEndedAtMs, 1_450);
});

test('evaluateValidationAttempt passes suppression cases only when no accepted transcript or response appears', () => {
  const testCase = NON_TRIGGER_VALIDATION_TEST_SET.find(
    ({ id }) => id === 'tv-background-dialogue'
  );
  const passingResult = evaluateValidationAttempt({
    armedAtMs: 2_000,
    platformId: 'chrome-windows',
    responseStartedAtMs: null,
    testCase,
    recordedAt: '2026-03-31T11:00:00.000Z',
  });
  const failedResult = evaluateValidationAttempt({
    armedAtMs: 2_000,
    observedTranscript: {
      observedAtMs: 2_420,
      transcript: '오늘 경기 진짜 치열하네요',
    },
    platformId: 'chrome-windows',
    responseStartedAtMs: 2_780,
    testCase,
    recordedAt: '2026-03-31T11:00:10.000Z',
  });

  assert.equal(passingResult.status, 'pass');
  assert.equal(passingResult.failureReason, null);
  assert.equal(
    passingResult.expectedBehavior,
    VALIDATION_CASE_EXPECTATION.SUPPRESS
  );
  assert.equal(failedResult.status, 'miss');
  assert.equal(failedResult.failureReason, 'unexpected_response_start');
  assert.equal(failedResult.transcript, '오늘 경기 진짜 치열하네요');
});

test('upsertValidSpeechResult replaces prior result for the same test case', () => {
  const firstResult = {
    expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
    testCaseId: 'short-time-question',
    status: 'miss',
    recordedAt: '2026-03-31T10:00:00.000Z',
  };
  const replacementResult = {
    expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
    testCaseId: 'short-time-question',
    status: 'pass',
    recordedAt: '2026-03-31T10:00:10.000Z',
  };

  const nextResults = upsertValidSpeechResult({
    results: [firstResult],
    nextResult: replacementResult,
  });

  assert.equal(nextResults.length, 1);
  assert.equal(nextResults[0].status, 'pass');
});

test('summarizeValidSpeechRun calculates recall and miss counts', () => {
  const results = [
    {
      expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
      testCaseId: 'short-time-question',
      status: 'pass',
      recordedAt: '2026-03-31T10:00:00.000Z',
      responseLatencyMs: 820,
    },
    {
      expectedBehavior: VALIDATION_CASE_EXPECTATION.SUPPRESS,
      testCaseId: 'tv-background-dialogue',
      status: 'pass',
      recordedAt: '2026-03-31T10:00:05.000Z',
      responseLatencyMs: null,
    },
    {
      expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
      testCaseId: 'daily-summary-request',
      status: 'miss',
      recordedAt: '2026-03-31T10:00:10.000Z',
      responseLatencyMs: null,
    },
  ];

  const summary = summarizeValidSpeechRun({
    results,
    testSet: [
      VALID_UTTERANCE_TEST_SET[0],
      NON_TRIGGER_VALIDATION_TEST_SET[0],
      VALID_UTTERANCE_TEST_SET[1],
      NON_TRIGGER_VALIDATION_TEST_SET[1],
    ],
  });

  assert.equal(summary.totalCount, 4);
  assert.equal(summary.completedCount, 3);
  assert.equal(summary.passCount, 2);
  assert.equal(summary.missCount, 1);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.responseRecallRate, 0.5);
  assert.equal(summary.suppressionPassRate, 1);
  assert.equal(summary.missRate, 0.333);
  assert.equal(summary.averageResponseLatencyMs, 820);
  assert.deepEqual(summary.expectationSummary.trigger, {
    completed: 2,
    missed: 1,
    passed: 1,
    total: 2,
  });
  assert.deepEqual(summary.expectationSummary.suppress, {
    completed: 1,
    missed: 0,
    passed: 1,
    total: 2,
  });
});

test('summarizeCrossPlatformValidSpeechVerification passes when valid speech miss rate stays within 5 percent', () => {
  const verification = summarizeCrossPlatformValidSpeechVerification({
    platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
    platformRuns: {
      'chrome-macos': {
        platformId: 'chrome-macos',
        results: createCompletedPlatformResults({
          platformId: 'chrome-macos',
        }),
      },
      'chrome-windows': {
        platformId: 'chrome-windows',
        results: createCompletedPlatformResults({
          missedTriggerIds: ['task-priority-request'],
          platformId: 'chrome-windows',
        }),
      },
    },
    testSet: CHROME_VALIDATION_TEST_SET,
  });

  assert.equal(verification.verdict, 'pass');
  assert.equal(verification.isTriggerCoverageComplete, true);
  assert.equal(verification.completedTriggerCaseCount, 24);
  assert.equal(verification.validUtteranceMissCount, 1);
  assert.equal(verification.validUtteranceMissRate, 0.042);
});

test('summarizeCrossPlatformValidSpeechVerification fails when valid speech miss rate exceeds 5 percent', () => {
  const verification = summarizeCrossPlatformValidSpeechVerification({
    platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
    platformRuns: {
      'chrome-macos': {
        platformId: 'chrome-macos',
        results: createCompletedPlatformResults({
          missedTriggerIds: ['task-priority-request'],
          platformId: 'chrome-macos',
        }),
      },
      'chrome-windows': {
        platformId: 'chrome-windows',
        results: createCompletedPlatformResults({
          missedTriggerIds: ['short-time-question'],
          platformId: 'chrome-windows',
        }),
      },
    },
    testSet: CHROME_VALIDATION_TEST_SET,
  });

  assert.equal(verification.verdict, 'fail');
  assert.equal(verification.completedTriggerCaseCount, 24);
  assert.equal(verification.validUtteranceMissCount, 2);
  assert.equal(verification.validUtteranceMissRate, 0.083);
});

test('summarizeCrossPlatformLatencyVerification passes when representative utterances stay within 1 second on both Chrome platforms', () => {
  const verification = summarizeCrossPlatformLatencyVerification({
    maxFirstResponseStartDelayMs:
      VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
    platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
    platformRuns: {
      'chrome-macos': {
        platformId: 'chrome-macos',
        results: createCompletedPlatformResults({
          platformId: 'chrome-macos',
        }),
      },
      'chrome-windows': {
        platformId: 'chrome-windows',
        results: createCompletedPlatformResults({
          platformId: 'chrome-windows',
        }),
      },
    },
    testSet: CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
  });

  assert.equal(verification.verdict, 'pass');
  assert.equal(verification.completedCaseCount, 10);
  assert.equal(verification.passingCaseCount, 10);
  assert.equal(verification.failedCaseCount, 0);
  assert.equal(verification.maxObservedFirstResponseStartDelayMs, 910);
});

test('summarizeCrossPlatformLatencyVerification fails when a representative utterance exceeds the 1 second budget', () => {
  const verification = summarizeCrossPlatformLatencyVerification({
    maxFirstResponseStartDelayMs:
      VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
    platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
    platformRuns: {
      'chrome-macos': {
        platformId: 'chrome-macos',
        results: createCompletedPlatformResults({
          platformId: 'chrome-macos',
        }),
      },
      'chrome-windows': {
        platformId: 'chrome-windows',
        results: createCompletedPlatformResults({
          platformId: 'chrome-windows',
          responseLatencyByTestCaseId: {
            'task-priority-request': 1_180,
          },
        }),
      },
    },
    testSet: CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
  });

  assert.equal(verification.verdict, 'fail');
  assert.equal(verification.failedCaseCount, 1);
  assert.equal(verification.overBudgetCaseCount, 1);
  assert.equal(verification.maxObservedFirstResponseStartDelayMs, 1_180);
});

test('summarizeCrossPlatformLatencyVerification stays incomplete until both Chrome platforms finish the representative cases', () => {
  const verification = summarizeCrossPlatformLatencyVerification({
    maxFirstResponseStartDelayMs:
      VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
    platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
    platformRuns: {
      'chrome-macos': {
        platformId: 'chrome-macos',
        results: createCompletedPlatformResults({
          platformId: 'chrome-macos',
        }).filter(({ testCaseId }) =>
          CHROME_RESPONSE_LATENCY_VALIDATION_CASE_IDS
            .filter((id) => id !== 'task-priority-request')
            .includes(testCaseId)
        ),
      },
    },
    testSet: CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
  });

  assert.equal(verification.verdict, 'incomplete');
  assert.equal(verification.completedCaseCount, 4);
  assert.equal(verification.requiredCaseCount, 10);
  assert.deepEqual(verification.missingPlatformIds, [
    'chrome-macos',
    'chrome-windows',
  ]);
});

test('parseValidSpeechExportPayload restores the exported platform run metadata', () => {
  const parsed = parseValidSpeechExportPayload(
    JSON.stringify({
      platform: {
        id: 'chrome-windows',
        label: 'Chrome Windows',
      },
      run: {
        platformId: 'chrome-windows',
        results: [],
      },
      testSetVersion: '2026-03-31-chrome-validation-v2',
    })
  );

  assert.equal(parsed.ok, true);
  assert.equal(parsed.platformId, 'chrome-windows');
  assert.equal(parsed.run.testSetVersion, '2026-03-31-chrome-validation-v2');
});

test('createEmptyPlatformRun seeds a repeatable per-platform run shape', () => {
  const run = createEmptyPlatformRun({
    platformId: 'chrome-macos',
    testSetVersion: 'v1',
    now: '2026-03-31T10:00:00.000Z',
  });

  assert.equal(run.platformId, 'chrome-macos');
  assert.equal(run.testSetVersion, 'v1');
  assert.equal(run.results.length, 0);
  assert.equal(run.runStartedAt, '2026-03-31T10:00:00.000Z');
});
