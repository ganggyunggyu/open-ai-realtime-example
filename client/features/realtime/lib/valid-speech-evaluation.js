import { VALIDATION_CASE_EXPECTATION } from './valid-utterance-test-set.js';

export const VALID_SPEECH_EVALUATION_STORAGE_KEY =
  'validSpeechEvaluationRuns.v1';
export const VALID_SPEECH_RESPONSE_TIMEOUT_MS = 7000;
export const VALID_SPEECH_MAX_TRIGGER_MISS_RATE = 0.05;
export const VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS = 1000;

const createEmptyExpectationBucket = () => ({
  total: 0,
  completed: 0,
  passed: 0,
  missed: 0,
});

export const normalizeSpeechText = (value = '') =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const compactSpeechText = (value = '') =>
  normalizeSpeechText(value).replace(/\s+/g, '');

const getExpectedBehavior = (testCase) =>
  testCase?.expectedBehavior || VALIDATION_CASE_EXPECTATION.TRIGGER;

export const evaluateTranscriptMatch = ({ testCase, transcript }) => {
  const acceptedPhrases = Array.isArray(testCase?.acceptedPhrases)
    ? testCase.acceptedPhrases
    : [];
  const expectedKeywords = Array.isArray(testCase?.expectedKeywords)
    ? testCase.expectedKeywords
    : [];
  const normalizedTranscript = normalizeSpeechText(transcript);
  const compactTranscript = compactSpeechText(transcript);

  if (!normalizedTranscript) {
    return {
      isMatch: false,
      matchedKeywordCount: 0,
      matchedKeywords: [],
      matchedPhrase: null,
      normalizedTranscript,
    };
  }

  const matchedPhrase =
    acceptedPhrases.find((phrase) =>
      compactTranscript.includes(compactSpeechText(phrase))
    ) || null;

  const matchedKeywords = expectedKeywords.filter((keyword) =>
    compactTranscript.includes(compactSpeechText(keyword))
  );

  const matchedKeywordCount = matchedKeywords.length;
  const minimumKeywordMatches = matchedPhrase
    ? 1
    : Math.max(1, testCase?.minimumKeywordMatches || 1);
  const isMatch =
    Boolean(matchedPhrase) || matchedKeywordCount >= minimumKeywordMatches;

  return {
    isMatch,
    matchedKeywordCount,
    matchedKeywords,
    matchedPhrase,
    normalizedTranscript,
  };
};

export const evaluateValidationAttempt = ({
  armedAtMs,
  matchedTranscript,
  observedTranscript,
  platformId,
  responseLatencyMeasurement,
  responseStartedAtMs,
  testCase,
  recordedAt = new Date().toISOString(),
}) => {
  const expectedBehavior = getExpectedBehavior(testCase);
  const acceptedTranscript = matchedTranscript || observedTranscript || null;
  const hasResponseStart = typeof responseStartedAtMs === 'number';
  const latencyBaselineAtMs =
    responseLatencyMeasurement?.utteranceEndedAtMs ||
    acceptedTranscript?.observedAtMs ||
    armedAtMs;
  const responseLatencyMs = hasResponseStart
    ? typeof responseLatencyMeasurement?.latencyMs === 'number'
      ? responseLatencyMeasurement.latencyMs
      : typeof latencyBaselineAtMs === 'number'
        ? Math.max(0, responseStartedAtMs - latencyBaselineAtMs)
        : null
    : null;
  const responseLatencySource = !hasResponseStart
    ? null
    : typeof responseLatencyMeasurement?.latencyMs === 'number'
      ? 'utterance_end'
      : typeof acceptedTranscript?.observedAtMs === 'number'
        ? 'accepted_transcript'
        : typeof armedAtMs === 'number'
          ? 'attempt_arm'
          : null;

  let status = 'pass';
  let failureReason = null;

  if (expectedBehavior === VALIDATION_CASE_EXPECTATION.SUPPRESS) {
    if (hasResponseStart) {
      status = 'miss';
      failureReason = 'unexpected_response_start';
    } else if (acceptedTranscript) {
      status = 'miss';
      failureReason = 'unexpected_accepted_transcript';
    }
  } else if (!(matchedTranscript && hasResponseStart)) {
    status = 'miss';

    if (!acceptedTranscript) {
      failureReason = 'no_transcript';
    } else if (!matchedTranscript && hasResponseStart) {
      failureReason = 'response_without_matching_transcript';
    } else if (!matchedTranscript) {
      failureReason = 'transcript_mismatch';
    } else {
      failureReason = 'no_response';
    }
  }

  return {
    audioSignals: acceptedTranscript?.audioSignals || null,
    expectedBehavior,
    failureReason,
    matchedKeywords: matchedTranscript?.matchedKeywords || [],
    matchedPhrase: matchedTranscript?.matchedPhrase || null,
    platformId,
    reason: acceptedTranscript?.reason || null,
    recordedAt,
    responseLatencyMs,
    responseLatencySource,
    responseStartedAtMs: hasResponseStart ? responseStartedAtMs : null,
    status,
    testCaseId: testCase.id,
    transcript: acceptedTranscript?.transcript || '',
    transcriptObservedAtMs: acceptedTranscript?.observedAtMs || null,
    utteranceEndedAtMs: responseLatencyMeasurement?.utteranceEndedAtMs || null,
  };
};

export const upsertValidSpeechResult = ({ results, nextResult }) => {
  const previousResults = Array.isArray(results) ? results : [];
  const nextResults = previousResults.filter(
    ({ testCaseId }) => testCaseId !== nextResult.testCaseId
  );

  nextResults.push(nextResult);
  nextResults.sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime()
  );

  return nextResults;
};

export const createEmptyPlatformRun = ({ platformId, testSetVersion, now }) => {
  const createdAt = now || new Date().toISOString();

  return {
    platformId,
    runId: `${platformId}-${createdAt}`,
    testSetVersion,
    runStartedAt: createdAt,
    updatedAt: createdAt,
    results: [],
  };
};

export const summarizeValidSpeechRun = ({ results, testSet }) => {
  const safeResults = Array.isArray(results) ? results : [];
  const safeTestSet = Array.isArray(testSet) ? testSet : [];

  const completedCount = safeResults.length;
  const totalCount = safeTestSet.length;
  const passCount = safeResults.filter(({ status }) => status === 'pass').length;
  const missCount = safeResults.filter(({ status }) => status !== 'pass').length;
  const pendingCount = Math.max(0, totalCount - completedCount);
  const responseLatencyValues = safeResults
    .filter(
      ({ status, responseLatencyMs }) =>
        status === 'pass' && typeof responseLatencyMs === 'number'
    )
    .map(({ responseLatencyMs }) => responseLatencyMs);

  const averageResponseLatencyMs =
    responseLatencyValues.length > 0
      ? Math.round(
          responseLatencyValues.reduce((sum, value) => sum + value, 0) /
            responseLatencyValues.length
        )
      : null;

  const expectationSummary = safeTestSet.reduce(
    (summary, testCase) => {
      const expectedBehavior = getExpectedBehavior(testCase);
      const currentEntry =
        summary[expectedBehavior] || createEmptyExpectationBucket();
      const matchingResult = safeResults.find(
        ({ testCaseId }) => testCaseId === testCase.id
      );

      currentEntry.total += 1;
      if (matchingResult) {
        currentEntry.completed += 1;
        if (matchingResult.status === 'pass') {
          currentEntry.passed += 1;
        } else {
          currentEntry.missed += 1;
        }
      }

      summary[expectedBehavior] = currentEntry;
      return summary;
    },
    {
      [VALIDATION_CASE_EXPECTATION.SUPPRESS]: createEmptyExpectationBucket(),
      [VALIDATION_CASE_EXPECTATION.TRIGGER]: createEmptyExpectationBucket(),
    }
  );

  const labelSummary = safeTestSet.reduce((summary, testCase) => {
    const currentEntry = summary[testCase.label] || {
      total: 0,
      completed: 0,
      passed: 0,
      missed: 0,
    };
    const matchingResult = safeResults.find(
      ({ testCaseId }) => testCaseId === testCase.id
    );

    currentEntry.total += 1;
    if (matchingResult) {
      currentEntry.completed += 1;
      if (matchingResult.status === 'pass') {
        currentEntry.passed += 1;
      } else {
        currentEntry.missed += 1;
      }
    }

    summary[testCase.label] = currentEntry;
    return summary;
  }, {});

  return {
    totalCount,
    completedCount,
    pendingCount,
    passCount,
    missCount,
    responseRecallRate:
      expectationSummary[VALIDATION_CASE_EXPECTATION.TRIGGER].completed > 0
        ? Number(
            (
              expectationSummary[VALIDATION_CASE_EXPECTATION.TRIGGER].passed /
              expectationSummary[VALIDATION_CASE_EXPECTATION.TRIGGER].completed
            ).toFixed(3)
          )
        : 0,
    suppressionPassRate:
      expectationSummary[VALIDATION_CASE_EXPECTATION.SUPPRESS].completed > 0
        ? Number(
            (
              expectationSummary[VALIDATION_CASE_EXPECTATION.SUPPRESS].passed /
              expectationSummary[VALIDATION_CASE_EXPECTATION.SUPPRESS].completed
            ).toFixed(3)
          )
        : 0,
    missRate:
      completedCount > 0 ? Number((missCount / completedCount).toFixed(3)) : 0,
    averageResponseLatencyMs,
    expectationSummary,
    labelSummary,
  };
};

const getExpectationBucket = ({
  expectationSummary,
  expectedBehavior,
}) =>
  expectationSummary?.[expectedBehavior] || createEmptyExpectationBucket();

export const summarizeCrossPlatformValidSpeechVerification = ({
  platformOptions,
  platformRuns,
  testSet,
  maxTriggerMissRate = VALID_SPEECH_MAX_TRIGGER_MISS_RATE,
}) => {
  const safePlatformOptions = Array.isArray(platformOptions)
    ? platformOptions
    : [];
  const safePlatformRuns =
    platformRuns && typeof platformRuns === 'object' ? platformRuns : {};
  const safeTestSet = Array.isArray(testSet) ? testSet : [];
  const requiredCaseCount = safePlatformOptions.length * safeTestSet.length;
  const requiredTriggerCaseCount =
    safePlatformOptions.length *
    safeTestSet.filter(
      (testCase) =>
        getExpectedBehavior(testCase) === VALIDATION_CASE_EXPECTATION.TRIGGER
    ).length;

  const platformSummaries = safePlatformOptions.map((platform) => {
    const run = safePlatformRuns[platform.id] || {
      platformId: platform.id,
      results: [],
      testSetVersion: null,
    };
    const summary = summarizeValidSpeechRun({
      results: run.results,
      testSet: safeTestSet,
    });
    const triggerSummary = getExpectationBucket({
      expectationSummary: summary.expectationSummary,
      expectedBehavior: VALIDATION_CASE_EXPECTATION.TRIGGER,
    });

    return {
      platform,
      run,
      summary,
      triggerSummary,
      isComplete: summary.completedCount === summary.totalCount,
      isTriggerCoverageComplete:
        triggerSummary.completed === triggerSummary.total &&
        triggerSummary.total > 0,
    };
  });

  const completedCaseCount = platformSummaries.reduce(
    (sum, { summary }) => sum + summary.completedCount,
    0
  );
  const completedTriggerCaseCount = platformSummaries.reduce(
    (sum, { triggerSummary }) => sum + triggerSummary.completed,
    0
  );
  const validUtterancePassCount = platformSummaries.reduce(
    (sum, { triggerSummary }) => sum + triggerSummary.passed,
    0
  );
  const validUtteranceMissCount = platformSummaries.reduce(
    (sum, { triggerSummary }) => sum + triggerSummary.missed,
    0
  );
  const validUtteranceMissRate =
    completedTriggerCaseCount > 0
      ? Number(
          (validUtteranceMissCount / completedTriggerCaseCount).toFixed(3)
        )
      : 0;
  const validUtteranceRecallRate =
    completedTriggerCaseCount > 0
      ? Number(
          (validUtterancePassCount / completedTriggerCaseCount).toFixed(3)
        )
      : 0;
  const isTriggerCoverageComplete =
    requiredTriggerCaseCount > 0 &&
    completedTriggerCaseCount === requiredTriggerCaseCount;
  const isCrossPlatformCoverageComplete =
    requiredCaseCount > 0 && completedCaseCount === requiredCaseCount;
  const missingPlatformIds = platformSummaries
    .filter(({ isTriggerCoverageComplete }) => !isTriggerCoverageComplete)
    .map(({ platform }) => platform.id);
  const verdict = !isTriggerCoverageComplete
    ? 'incomplete'
    : validUtteranceMissRate <= maxTriggerMissRate
      ? 'pass'
      : 'fail';

  return {
    completedCaseCount,
    completedTriggerCaseCount,
    isCrossPlatformCoverageComplete,
    isTriggerCoverageComplete,
    maxTriggerMissRate,
    missingPlatformIds,
    platformSummaries,
    requiredCaseCount,
    requiredTriggerCaseCount,
    validUtteranceMissCount,
    validUtteranceMissRate,
    validUtterancePassCount,
    validUtteranceRecallRate,
    verdict,
  };
};

const summarizeLatencyCase = ({
  maxFirstResponseStartDelayMs,
  result,
  testCase,
}) => {
  if (!result) {
    return {
      failureReason: 'missing_result',
      responseLatencyMs: null,
      result: null,
      testCase,
      verdict: 'incomplete',
    };
  }

  if (result.status !== 'pass') {
    return {
      failureReason: result.failureReason || 'case_failed',
      responseLatencyMs: result.responseLatencyMs,
      result,
      testCase,
      verdict: 'fail',
    };
  }

  if (typeof result.responseLatencyMs !== 'number') {
    return {
      failureReason: 'missing_latency_measurement',
      responseLatencyMs: null,
      result,
      testCase,
      verdict: 'fail',
    };
  }

  if (result.responseLatencyMs > maxFirstResponseStartDelayMs) {
    return {
      failureReason: 'latency_budget_exceeded',
      responseLatencyMs: result.responseLatencyMs,
      result,
      testCase,
      verdict: 'fail',
    };
  }

  return {
    failureReason: null,
    responseLatencyMs: result.responseLatencyMs,
    result,
    testCase,
    verdict: 'pass',
  };
};

export const summarizeCrossPlatformLatencyVerification = ({
  platformOptions,
  platformRuns,
  testSet,
  maxFirstResponseStartDelayMs =
    VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
}) => {
  const safePlatformOptions = Array.isArray(platformOptions)
    ? platformOptions
    : [];
  const safePlatformRuns =
    platformRuns && typeof platformRuns === 'object' ? platformRuns : {};
  const safeTestSet = Array.isArray(testSet) ? testSet : [];
  const requiredCaseCount = safePlatformOptions.length * safeTestSet.length;

  const platformSummaries = safePlatformOptions.map((platform) => {
    const run = safePlatformRuns[platform.id] || {
      platformId: platform.id,
      results: [],
      testSetVersion: null,
    };
    const caseSummaries = safeTestSet.map((testCase) =>
      summarizeLatencyCase({
        maxFirstResponseStartDelayMs,
        result:
          run.results.find(({ testCaseId }) => testCaseId === testCase.id) || null,
        testCase,
      })
    );
    const completedCaseCount = caseSummaries.filter(
      ({ verdict }) => verdict !== 'incomplete'
    ).length;
    const passingCaseCount = caseSummaries.filter(
      ({ verdict }) => verdict === 'pass'
    ).length;
    const failedCaseCount = caseSummaries.filter(
      ({ verdict }) => verdict === 'fail'
    ).length;
    const overBudgetCaseCount = caseSummaries.filter(
      ({ failureReason }) => failureReason === 'latency_budget_exceeded'
    ).length;
    const observedLatencyValues = caseSummaries
      .map(({ responseLatencyMs }) => responseLatencyMs)
      .filter((value) => typeof value === 'number');

    return {
      averageFirstResponseStartDelayMs:
        observedLatencyValues.length > 0
          ? Math.round(
              observedLatencyValues.reduce((sum, value) => sum + value, 0) /
                observedLatencyValues.length
            )
          : null,
      caseSummaries,
      completedCaseCount,
      failedCaseCount,
      isComplete: completedCaseCount === safeTestSet.length && safeTestSet.length > 0,
      maxObservedFirstResponseStartDelayMs:
        observedLatencyValues.length > 0
          ? Math.max(...observedLatencyValues)
          : null,
      overBudgetCaseCount,
      passingCaseCount,
      platform,
      run,
      totalCaseCount: safeTestSet.length,
    };
  });

  const flattenedCaseSummaries = platformSummaries.flatMap(
    ({ caseSummaries }) => caseSummaries
  );
  const completedCaseCount = flattenedCaseSummaries.filter(
    ({ verdict }) => verdict !== 'incomplete'
  ).length;
  const passingCaseCount = flattenedCaseSummaries.filter(
    ({ verdict }) => verdict === 'pass'
  ).length;
  const failedCaseCount = flattenedCaseSummaries.filter(
    ({ verdict }) => verdict === 'fail'
  ).length;
  const overBudgetCaseCount = flattenedCaseSummaries.filter(
    ({ failureReason }) => failureReason === 'latency_budget_exceeded'
  ).length;
  const observedLatencyValues = flattenedCaseSummaries
    .map(({ responseLatencyMs }) => responseLatencyMs)
    .filter((value) => typeof value === 'number');
  const missingPlatformIds = platformSummaries
    .filter(({ isComplete }) => !isComplete)
    .map(({ platform }) => platform.id);
  const verdict =
    completedCaseCount < requiredCaseCount
      ? 'incomplete'
      : failedCaseCount === 0
        ? 'pass'
        : 'fail';

  return {
    averageFirstResponseStartDelayMs:
      observedLatencyValues.length > 0
        ? Math.round(
            observedLatencyValues.reduce((sum, value) => sum + value, 0) /
              observedLatencyValues.length
          )
        : null,
    completedCaseCount,
    failedCaseCount,
    maxFirstResponseStartDelayMs,
    maxObservedFirstResponseStartDelayMs:
      observedLatencyValues.length > 0 ? Math.max(...observedLatencyValues) : null,
    missingPlatformIds,
    overBudgetCaseCount,
    passingCaseCount,
    platformSummaries,
    requiredCaseCount,
    verdict,
  };
};

const isRecord = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const parseValidSpeechExportPayload = (rawValue) => {
  let parsedValue = rawValue;

  if (typeof rawValue === 'string') {
    try {
      parsedValue = JSON.parse(rawValue);
    } catch (error) {
      return {
        ok: false,
        error: 'invalid_json',
      };
    }
  }

  if (!isRecord(parsedValue) || !isRecord(parsedValue.run)) {
    return {
      ok: false,
      error: 'invalid_shape',
    };
  }

  const platformId = parsedValue.platform?.id || parsedValue.run?.platformId;

  if (!platformId) {
    return {
      ok: false,
      error: 'missing_platform_id',
    };
  }

  if (!Array.isArray(parsedValue.run.results)) {
    return {
      ok: false,
      error: 'missing_results',
    };
  }

  return {
    ok: true,
    payload: parsedValue,
    platformId,
    run: {
      ...parsedValue.run,
      platformId,
      testSetVersion:
        parsedValue.run.testSetVersion || parsedValue.testSetVersion || null,
    },
  };
};

export const buildValidSpeechExportPayload = ({
  artifacts = null,
  platform,
  run,
  summary,
  testSetVersion,
  userAgent,
}) => ({
  exportedAt: new Date().toISOString(),
  ...(artifacts ? { artifacts } : {}),
  platform,
  run,
  summary,
  testSetVersion,
  userAgent,
});
