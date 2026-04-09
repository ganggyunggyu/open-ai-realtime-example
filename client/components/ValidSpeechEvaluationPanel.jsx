import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Mic,
  Play,
  RotateCcw,
  Upload,
} from 'react-feather';
import {
  CHROME_RESPONSE_LATENCY_EVALUATION_NOTES,
  CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
  CHROME_VALIDATION_EVALUATION_NOTES,
  CHROME_VALIDATION_TEST_SET,
  CHROME_VALIDATION_TEST_SET_VERSION,
  VALIDATION_CASE_EXPECTATION,
  VALID_UTTERANCE_PLATFORM_OPTIONS,
} from '@/features/realtime/lib/valid-utterance-test-set';
import {
  VALID_SPEECH_EVALUATION_STORAGE_KEY,
  VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
  VALID_SPEECH_MAX_TRIGGER_MISS_RATE,
  VALID_SPEECH_RESPONSE_TIMEOUT_MS,
  buildValidSpeechExportPayload,
  createEmptyPlatformRun,
  evaluateValidationAttempt,
  evaluateTranscriptMatch,
  parseValidSpeechExportPayload,
  summarizeCrossPlatformLatencyVerification,
  summarizeCrossPlatformValidSpeechVerification,
  summarizeValidSpeechRun,
  upsertValidSpeechResult,
} from '@/features/realtime/lib/valid-speech-evaluation';
import { cn } from '@/shared/lib/cn';

const DEFAULT_PLATFORM_ID = VALID_UTTERANCE_PLATFORM_OPTIONS[0].id;
const RESPONSE_LATENCY_CASE_ID_SET = new Set(
  CHROME_RESPONSE_LATENCY_VALIDATION_CASES.map(({ id }) => id)
);

const createDefaultPlatformRuns = () =>
  VALID_UTTERANCE_PLATFORM_OPTIONS.reduce((runs, { id }) => {
    runs[id] = createEmptyPlatformRun({
      platformId: id,
      testSetVersion: CHROME_VALIDATION_TEST_SET_VERSION,
    });
    return runs;
  }, {});

const readStoredPlatformRuns = () => {
  if (typeof window === 'undefined') {
    return createDefaultPlatformRuns();
  }

  const rawValue = window.localStorage.getItem(
    VALID_SPEECH_EVALUATION_STORAGE_KEY
  );

  if (!rawValue) {
    return createDefaultPlatformRuns();
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return {
      ...createDefaultPlatformRuns(),
      ...parsedValue,
    };
  } catch (error) {
    console.error('Failed to read valid speech evaluation runs', error);
    return createDefaultPlatformRuns();
  }
};

const getTestCaseById = (testCaseId) =>
  CHROME_VALIDATION_TEST_SET.find(({ id }) => id === testCaseId) || null;

const findFirstPendingIndex = (results) => {
  const completedIds = new Set(results.map(({ testCaseId }) => testCaseId));
  const nextIndex = CHROME_VALIDATION_TEST_SET.findIndex(
    ({ id }) => !completedIds.has(id)
  );

  return nextIndex >= 0 ? nextIndex : 0;
};

const isSuppressionCase = (testCase) =>
  testCase?.expectedBehavior === VALIDATION_CASE_EXPECTATION.SUPPRESS;
const isResponseLatencyValidationCase = (testCase) =>
  RESPONSE_LATENCY_CASE_ID_SET.has(testCase?.id);

const getFailureReasonLabel = (failureReason) => {
  if (failureReason === 'no_transcript') {
    return '허용 전사가 발생하지 않았음';
  }

  if (failureReason === 'transcript_mismatch') {
    return '다른 전사로 인식됨';
  }

  if (failureReason === 'no_response') {
    return '전사는 통과했지만 응답 시작이 없음';
  }

  if (failureReason === 'response_without_matching_transcript') {
    return '응답은 시작됐지만 의도한 문장 매칭이 없음';
  }

  if (failureReason === 'unexpected_accepted_transcript') {
    return '허용 전사가 발생해서 억제 실패';
  }

  if (failureReason === 'unexpected_response_start') {
    return '응답 시작 이벤트가 발생해서 억제 실패';
  }

  return '원인 미상';
};

const getResultToneClasses = (status) => {
  if (status === 'pass') {
    return 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]';
  }

  return 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]';
};

const formatRate = (value) => `${Math.round(value * 100)}%`;
const formatPreciseRate = (value) => `${(value * 100).toFixed(1)}%`;

const formatLatency = (value) => {
  if (typeof value !== 'number') {
    return '-';
  }

  return `${value}ms`;
};

const getCrossPlatformVerdictLabel = (verdict) => {
  if (verdict === 'pass') {
    return 'PASS';
  }

  if (verdict === 'fail') {
    return 'FAIL';
  }

  return 'INCOMPLETE';
};

const getCrossPlatformVerdictClasses = (verdict) => {
  if (verdict === 'pass') {
    return 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]';
  }

  if (verdict === 'fail') {
    return 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]';
  }

  return 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)]';
};

const getCrossPlatformVerdictText = (verification) => {
  if (verification.verdict === 'pass') {
    return `두 플랫폼 양성 케이스 ${verification.completedTriggerCaseCount}/${verification.requiredTriggerCaseCount}건 기준으로 miss rate ${formatPreciseRate(
      verification.validUtteranceMissRate
    )}를 기록해서 허용치 ${formatRate(
      verification.maxTriggerMissRate
    )} 이하를 충족했음`;
  }

  if (verification.verdict === 'fail') {
    return `두 플랫폼 양성 케이스 ${verification.completedTriggerCaseCount}/${verification.requiredTriggerCaseCount}건 기준 miss rate가 ${formatPreciseRate(
      verification.validUtteranceMissRate
    )}여서 허용치 ${formatRate(verification.maxTriggerMissRate)}를 넘었음`;
  }

  return `교차 플랫폼 양성 케이스가 ${verification.completedTriggerCaseCount}/${verification.requiredTriggerCaseCount}건만 완료됐음. ${
    verification.missingPlatformIds.length > 0
      ? `${verification.missingPlatformIds.join(', ')} 플랫폼 결과를 더 채우면 판정 가능함`
      : '남은 케이스를 완료하면 판정 가능함'
  }`;
};

const getLatencyVerificationVerdictText = (verification) => {
  if (verification.verdict === 'pass') {
    return `대표 양성 문장 ${verification.completedCaseCount}/${verification.requiredCaseCount}건이 모두 ${formatLatency(
      verification.maxFirstResponseStartDelayMs
    )} 이하로 첫 응답을 시작했음`;
  }

  if (verification.verdict === 'fail') {
    return `대표 양성 문장 ${verification.completedCaseCount}/${verification.requiredCaseCount}건 중 ${verification.failedCaseCount}건이 실패했고, 이 중 ${verification.overBudgetCaseCount}건은 ${formatLatency(
      verification.maxFirstResponseStartDelayMs
    )} budget을 초과했음`;
  }

  return `대표 양성 문장 측정이 ${verification.completedCaseCount}/${verification.requiredCaseCount}건만 완료됐음. ${
    verification.missingPlatformIds.length > 0
      ? `${verification.missingPlatformIds.join(', ')} 플랫폼의 대표 문장을 더 측정하면 판정 가능함`
      : '남은 대표 문장을 더 측정하면 판정 가능함'
  }`;
};

const getImportErrorLabel = (errorCode) => {
  if (errorCode === 'invalid_json') {
    return 'JSON 파싱에 실패했음';
  }

  if (errorCode === 'invalid_shape') {
    return '지원하는 검증 export 형식이 아님';
  }

  if (errorCode === 'missing_platform_id') {
    return '플랫폼 식별자가 없음';
  }

  if (errorCode === 'missing_results') {
    return '실행 결과 배열이 없음';
  }

  if (errorCode === 'unknown_platform') {
    return '지원하지 않는 플랫폼 결과임';
  }

  if (errorCode === 'mismatched_test_set_version') {
    return '현재 하네스와 다른 테스트 세트 버전임';
  }

  return '가져오기 중 알 수 없는 오류가 발생했음';
};

const getStatusLabel = ({ result, testCase }) => {
  if (!result) {
    return '대기';
  }

  if (result.status === 'pass') {
    return '통과';
  }

  return isSuppressionCase(testCase) ? '오검출' : '미검출';
};

const getCaseExpectationLabel = (testCase) =>
  isSuppressionCase(testCase) ? '무반응 기대' : '자동응답 기대';

const getResultDetailText = ({ result, testCase }) => {
  if (!result) {
    return '아직 측정되지 않음';
  }

  if (result.status === 'pass') {
    return isSuppressionCase(testCase)
      ? '허용 전사와 응답 시작 없이 통과'
      : `${formatLatency(result.responseLatencyMs)}에 응답 시작`;
  }

  return getFailureReasonLabel(result.failureReason);
};

const getAttemptInstructions = (testCase) => {
  if (isSuppressionCase(testCase)) {
    if (testCase.executionMode === 'ambient-scenario') {
      return `"${testCase.prompt}" 시나리오를 재현하면 됨. 최대 ${Math.round(
        VALID_SPEECH_RESPONSE_TIMEOUT_MS / 1000
      )}초 동안 허용 전사와 응답 시작이 모두 없어야 통과함`;
    }

    return `"${testCase.prompt}" 문장을 평소 말버릇처럼 한 번 말해보면 됨. 최대 ${Math.round(
      VALID_SPEECH_RESPONSE_TIMEOUT_MS / 1000
    )}초 동안 자동응답이 없어야 통과함`;
  }

  return `"${testCase.prompt}" 문장을 자연스럽게 1회 말하면 됨. 허용 전사와 실제 응답 시작 이벤트를 기다리는 중임`;
};

const SummaryCard = ({ icon: Icon, label, tone, value }) => (
  <div
    className={cn(
      'rounded-2xl border px-4 py-3',
      tone === 'good'
        ? 'border-[var(--color-success)]/20 bg-[var(--color-success)]/5'
        : tone === 'warn'
          ? 'border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5'
          : 'border-[var(--color-gray-200)] bg-[var(--color-gray-50)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-800)]'
    )}
  >
    <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-gray-500)]">
      <Icon size={14} />
      <span>{label}</span>
    </div>
    <div className="text-xl font-semibold text-[var(--color-gray-900)] dark:text-white">
      {value}
    </div>
  </div>
);

const CrossPlatformVerdictCard = ({ verification }) => (
  <section
    className={cn(
      'mb-4 rounded-[28px] border p-4 shadow-sm sm:p-5',
      getCrossPlatformVerdictClasses(verification.verdict)
    )}
  >
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium opacity-80">
          Cross-platform valid speech miss-rate verdict
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">
          {getCrossPlatformVerdictLabel(verification.verdict)}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm opacity-80">유효 발화 miss rate</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">
          {formatPreciseRate(verification.validUtteranceMissRate)}
        </div>
      </div>
    </div>

    <p className="mt-4 text-sm opacity-90">
      {getCrossPlatformVerdictText(verification)}
    </p>

    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {verification.platformSummaries.map(({ platform, summary, triggerSummary }) => {
        const platformTriggerMissRate =
          triggerSummary.completed > 0
            ? triggerSummary.missed / triggerSummary.completed
            : 0;

        return (
          <div
            key={platform.id}
            className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-white/5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium">{platform.label}</div>
              <span className="text-xs opacity-80">
                양성 {triggerSummary.completed}/{triggerSummary.total}
              </span>
            </div>
            <div className="mt-2 text-sm opacity-90">
              전체 {summary.completedCount}/{summary.totalCount} · miss{' '}
              {formatPreciseRate(platformTriggerMissRate)}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

const ResponseLatencyVerdictCard = ({ verification }) => (
  <section
    className={cn(
      'mb-4 rounded-[28px] border p-4 shadow-sm sm:p-5',
      getCrossPlatformVerdictClasses(verification.verdict)
    )}
  >
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium opacity-80">
          Cross-platform first-response-start latency artifact
        </div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">
          {getCrossPlatformVerdictLabel(verification.verdict)}
        </div>
      </div>

      <div className="text-right">
        <div className="text-sm opacity-80">대표 문장 최대 지연</div>
        <div className="mt-2 text-3xl font-semibold tracking-tight">
          {formatLatency(verification.maxObservedFirstResponseStartDelayMs)}
        </div>
      </div>
    </div>

    <p className="mt-4 text-sm opacity-90">
      {getLatencyVerificationVerdictText(verification)}
    </p>

    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {verification.platformSummaries.map((platformSummary) => (
        <div
          key={platformSummary.platform.id}
          className="rounded-2xl border border-black/10 bg-black/5 px-4 py-3 dark:border-white/10 dark:bg-white/5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">
              {platformSummary.platform.label}
            </div>
            <span className="text-xs opacity-80">
              대표 {platformSummary.completedCaseCount}/
              {platformSummary.totalCaseCount}
            </span>
          </div>
          <div className="mt-2 text-sm opacity-90">
            평균 {formatLatency(platformSummary.averageFirstResponseStartDelayMs)}
            {' · '}최대{' '}
            {formatLatency(platformSummary.maxObservedFirstResponseStartDelayMs)}
          </div>
          <div className="mt-1 text-xs opacity-80">
            실패 {platformSummary.failedCaseCount} · budget 초과{' '}
            {platformSummary.overBudgetCaseCount}
          </div>
        </div>
      ))}
    </div>

    <ul className="mt-4 space-y-2 text-sm opacity-90">
      {CHROME_RESPONSE_LATENCY_EVALUATION_NOTES.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  </section>
);

const ResultRow = ({ result, testCase }) => {
  const isPending = !result;
  const isLatencyCase = isResponseLatencyValidationCase(testCase);
  const toneClasses = isPending
    ? 'border-[var(--color-gray-300)] bg-[var(--color-gray-100)] text-[var(--color-gray-500)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-800)] dark:text-[var(--color-gray-300)]'
    : getResultToneClasses(result.status);
  const statusLabel = getStatusLabel({ result, testCase });
  const transcriptText = result?.transcript || '-';
  const detailText = getResultDetailText({ result, testCase });

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--color-gray-200)] bg-white px-4 py-3 dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] md:grid-cols-[140px,1fr,140px]">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-gray-500)]">
          <span>
            {testCase.label} · {getCaseExpectationLabel(testCase)}
          </span>
          {isLatencyCase ? (
            <span className="rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]">
              1s latency
            </span>
          ) : null}
        </div>
        <div className="font-medium text-[var(--color-gray-900)] dark:text-white">
          {testCase.prompt}
        </div>
      </div>

      <div>
        <div className="text-xs text-[var(--color-gray-500)]">최근 전사</div>
        <div className="text-sm text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]">
          {transcriptText}
        </div>
        <div className="mt-1 text-xs text-[var(--color-gray-500)]">
          {detailText}
        </div>
      </div>

      <div className="flex items-center md:justify-end">
        <span className={cn('rounded-full border px-3 py-1 text-xs font-medium', toneClasses)}>
          {statusLabel}
        </span>
      </div>
    </div>
  );
};

const ValidSpeechEvaluationPanel = ({
  isSessionActive,
  isVoiceAutoReplyEnabled,
  latestAcceptedTranscript,
  latestResponseStartedEvent,
  startSession,
  updateVoiceAutoReplyEnabled,
}) => {
  const [selectedPlatformId, setSelectedPlatformId] =
    useState(DEFAULT_PLATFORM_ID);
  const [platformRuns, setPlatformRuns] = useState(createDefaultPlatformRuns);
  const [currentTestCaseIndex, setCurrentTestCaseIndex] = useState(0);
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [hasLoadedStoredRuns, setHasLoadedStoredRuns] = useState(false);
  const [runtimeNotice, setRuntimeNotice] = useState(
    '자연 발화 자동응답과 비의도 소리 억제를 함께 재는 Chrome 검증 하네스입니다.'
  );
  const importInputRef = useRef(null);

  useEffect(() => {
    setPlatformRuns(readStoredPlatformRuns());
    setHasLoadedStoredRuns(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredRuns || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      VALID_SPEECH_EVALUATION_STORAGE_KEY,
      JSON.stringify(platformRuns)
    );
  }, [hasLoadedStoredRuns, platformRuns]);

  const activeRun =
    platformRuns[selectedPlatformId] ||
    createEmptyPlatformRun({
      platformId: selectedPlatformId,
      testSetVersion: CHROME_VALIDATION_TEST_SET_VERSION,
    });
  const currentTestCase = CHROME_VALIDATION_TEST_SET[currentTestCaseIndex];
  const currentPlatform = VALID_UTTERANCE_PLATFORM_OPTIONS.find(
    ({ id }) => id === selectedPlatformId
  );

  const resultMap = useMemo(
    () =>
      activeRun.results.reduce((results, result) => {
        results[result.testCaseId] = result;
        return results;
      }, {}),
    [activeRun.results]
  );

  const currentResult = resultMap[currentTestCase.id] || null;
  const summary = useMemo(
    () =>
      summarizeValidSpeechRun({
        results: activeRun.results,
        testSet: CHROME_VALIDATION_TEST_SET,
      }),
    [activeRun.results]
  );
  const crossPlatformVerification = useMemo(
    () =>
      summarizeCrossPlatformValidSpeechVerification({
        platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
        platformRuns,
        testSet: CHROME_VALIDATION_TEST_SET,
      }),
    [platformRuns]
  );
  const crossPlatformLatencyVerification = useMemo(
    () =>
      summarizeCrossPlatformLatencyVerification({
        maxFirstResponseStartDelayMs:
          VALID_SPEECH_MAX_FIRST_RESPONSE_START_DELAY_MS,
        platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
        platformRuns,
        testSet: CHROME_RESPONSE_LATENCY_VALIDATION_CASES,
      }),
    [platformRuns]
  );

  const updatePlatformRun = (platformId, nextRun) => {
    setPlatformRuns((previousRuns) => ({
      ...previousRuns,
      [platformId]: {
        ...nextRun,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const moveToRecommendedCase = (results) => {
    const nextIndex = findFirstPendingIndex(results);
    setCurrentTestCaseIndex(nextIndex);
  };

  const finalizeAttempt = (attempt) => {
    const testCase = getTestCaseById(attempt.testCaseId);

    if (!testCase) {
      setActiveAttempt(null);
      return;
    }

    const nextResult = evaluateValidationAttempt({
      armedAtMs: attempt.armedAtMs,
      matchedTranscript: attempt.matchedTranscript,
      observedTranscript: attempt.observedTranscript,
      platformId: selectedPlatformId,
      responseLatencyMeasurement: attempt.responseLatencyMeasurement,
      responseStartedAtMs: attempt.responseStartedAtMs,
      testCase,
    });

    const nextResults = upsertValidSpeechResult({
      results: activeRun.results,
      nextResult,
    });
    const nextRun = {
      ...activeRun,
      results: nextResults,
    };

    updatePlatformRun(selectedPlatformId, nextRun);
    setActiveAttempt(null);

    if (nextResult.status === 'pass') {
      setRuntimeNotice(
        isSuppressionCase(testCase)
          ? `"${testCase.prompt}" 시나리오가 허용 전사와 응답 시작 없이 통과했음`
          : `"${testCase.prompt}" 문장이 ${formatLatency(
              nextResult.responseLatencyMs
            )} 만에 응답을 시작해서 통과했음`
      );
    } else {
      setRuntimeNotice(
        `"${testCase.prompt}" ${
          isSuppressionCase(testCase) ? '시나리오가 오검출' : '문장이 미검출'
        }로 기록됐음: ${getFailureReasonLabel(
          nextResult.failureReason
        )}`
      );
    }

    moveToRecommendedCase(nextResults);
  };

  useEffect(() => {
    if (!activeAttempt || !currentTestCase) {
      return;
    }

    if (
      isSuppressionCase(currentTestCase) &&
      (activeAttempt.observedTranscript || activeAttempt.responseStartedAtMs)
    ) {
      finalizeAttempt(activeAttempt);
      return;
    }

    if (
      !isSuppressionCase(currentTestCase) &&
      activeAttempt.matchedTranscript &&
      activeAttempt.responseStartedAtMs
    ) {
      finalizeAttempt(activeAttempt);
    }
  }, [activeAttempt, currentTestCase]);

  useEffect(() => {
    if (!activeAttempt) {
      return;
    }

    const remainingMs = activeAttempt.deadlineAtMs - Date.now();

    if (remainingMs <= 0) {
      finalizeAttempt(activeAttempt);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      finalizeAttempt(activeAttempt);
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeAttempt]);

  useEffect(() => {
    if (!activeAttempt || !latestAcceptedTranscript) {
      return;
    }

    if (latestAcceptedTranscript.observedAtMs < activeAttempt.armedAtMs) {
      return;
    }

    const testCase = getTestCaseById(activeAttempt.testCaseId);

    if (!testCase) {
      return;
    }

    setActiveAttempt((previousAttempt) => {
      if (!previousAttempt || previousAttempt.testCaseId !== testCase.id) {
        return previousAttempt;
      }

      const nextObservedTranscript =
        previousAttempt.observedTranscript || {
          audioSignals: latestAcceptedTranscript.audioSignals,
          observedAtMs: latestAcceptedTranscript.observedAtMs,
          reason: latestAcceptedTranscript.reason,
          transcript: latestAcceptedTranscript.transcript,
        };

      if (isSuppressionCase(testCase)) {
        return {
          ...previousAttempt,
          observedTranscript: nextObservedTranscript,
        };
      }

      const matchResult = evaluateTranscriptMatch({
        testCase,
        transcript: latestAcceptedTranscript.transcript,
      });

      if (!matchResult.isMatch || previousAttempt.matchedTranscript) {
        return {
          ...previousAttempt,
          observedTranscript: nextObservedTranscript,
        };
      }

      return {
        ...previousAttempt,
        matchedTranscript: {
          ...matchResult,
          audioSignals: latestAcceptedTranscript.audioSignals,
          observedAtMs: latestAcceptedTranscript.observedAtMs,
          reason: latestAcceptedTranscript.reason,
          transcript: latestAcceptedTranscript.transcript,
        },
        observedTranscript: nextObservedTranscript,
      };
    });
  }, [activeAttempt, latestAcceptedTranscript]);

  useEffect(() => {
    if (!activeAttempt || !latestResponseStartedEvent) {
      return;
    }

    if (latestResponseStartedEvent.observedAtMs < activeAttempt.armedAtMs) {
      return;
    }

    setActiveAttempt((previousAttempt) => {
      if (!previousAttempt) {
        return previousAttempt;
      }

      if (previousAttempt.responseStartedAtMs) {
        return previousAttempt;
      }

      return {
        ...previousAttempt,
        responseLatencyMeasurement:
          previousAttempt.responseLatencyMeasurement ||
          latestResponseStartedEvent.latencyMeasurement ||
          null,
        responseStartedAtMs: latestResponseStartedEvent.observedAtMs,
      };
    });
  }, [activeAttempt, latestResponseStartedEvent]);

  const handlePlatformChange = (event) => {
    const nextPlatformId = event.target.value;
    const nextPlatform =
      VALID_UTTERANCE_PLATFORM_OPTIONS.find(({ id }) => id === nextPlatformId) ||
      null;
    const nextRun =
      platformRuns[nextPlatformId] ||
      createEmptyPlatformRun({
        platformId: nextPlatformId,
        testSetVersion: CHROME_VALIDATION_TEST_SET_VERSION,
      });

    setSelectedPlatformId(nextPlatformId);
    setActiveAttempt(null);
    setRuntimeNotice(
      `${nextPlatform?.label || nextPlatformId} 환경의 최근 결과를 불러왔음. 아직 수행하지 않은 케이스부터 이어서 측정하면 됨`
    );
    moveToRecommendedCase(nextRun.results);
  };

  const handlePreviousCase = () => {
    setCurrentTestCaseIndex((previousIndex) =>
      Math.max(0, previousIndex - 1)
    );
  };

  const handleNextCase = () => {
    setCurrentTestCaseIndex((previousIndex) =>
      Math.min(CHROME_VALIDATION_TEST_SET.length - 1, previousIndex + 1)
    );
  };

  const handleResetRun = () => {
    const nextRun = createEmptyPlatformRun({
      platformId: selectedPlatformId,
      testSetVersion: CHROME_VALIDATION_TEST_SET_VERSION,
    });

    updatePlatformRun(selectedPlatformId, nextRun);
    setActiveAttempt(null);
    setRuntimeNotice(
      `${selectedPlatformId} 환경 결과를 초기화했음. 첫 미완료 케이스부터 다시 측정하면 됨`
    );
    setCurrentTestCaseIndex(0);
  };

  const handleOpenImportDialog = () => {
    if (!importInputRef.current) {
      return;
    }

    importInputRef.current.value = '';
    importInputRef.current.click();
  };

  const handleImportRunFiles = async (event) => {
    const fileList = Array.from(event.target.files || []);

    if (fileList.length === 0) {
      return;
    }

    try {
      const parsedRuns = await Promise.all(
        fileList.map(async (file) => {
          const parsedExport = parseValidSpeechExportPayload(await file.text());

          if (!parsedExport.ok) {
            throw new Error(parsedExport.error);
          }

          if (
            !VALID_UTTERANCE_PLATFORM_OPTIONS.some(
              ({ id }) => id === parsedExport.platformId
            )
          ) {
            throw new Error('unknown_platform');
          }

          if (
            parsedExport.run.testSetVersion &&
            parsedExport.run.testSetVersion !== CHROME_VALIDATION_TEST_SET_VERSION
          ) {
            throw new Error('mismatched_test_set_version');
          }

          return parsedExport;
        })
      );
      const importedRuns = parsedRuns.reduce((runs, parsedExport) => {
        runs[parsedExport.platformId] = parsedExport.run;
        return runs;
      }, {});
      const nextPlatformRuns = {
        ...platformRuns,
        ...importedRuns,
      };
      const nextVerification = summarizeCrossPlatformValidSpeechVerification({
        platformOptions: VALID_UTTERANCE_PLATFORM_OPTIONS,
        platformRuns: nextPlatformRuns,
        testSet: CHROME_VALIDATION_TEST_SET,
      });
      const firstImportedPlatformId = parsedRuns[0]?.platformId || selectedPlatformId;
      const firstImportedRun = nextPlatformRuns[firstImportedPlatformId];

      setPlatformRuns(nextPlatformRuns);
      setSelectedPlatformId(firstImportedPlatformId);
      setActiveAttempt(null);
      moveToRecommendedCase(firstImportedRun?.results || []);
      setRuntimeNotice(
        `${parsedRuns.length}개 export를 불러왔음. ${getCrossPlatformVerdictText(
          nextVerification
        )}`
      );
    } catch (error) {
      console.error('Failed to import valid speech evaluation exports', error);
      setRuntimeNotice(
        `JSON 가져오기에 실패했음: ${getImportErrorLabel(error.message)}`
      );
    }
  };

  const handleExportRun = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const exportPayload = buildValidSpeechExportPayload({
      artifacts: {
        crossPlatformLatencyVerification,
        crossPlatformValidSpeechVerification: crossPlatformVerification,
        currentPlatformLatencyVerification:
          crossPlatformLatencyVerification.platformSummaries.find(
            ({ platform }) => platform.id === selectedPlatformId
          ) || null,
      },
      platform: currentPlatform,
      run: activeRun,
      summary,
      testSetVersion: CHROME_VALIDATION_TEST_SET_VERSION,
      userAgent: window.navigator.userAgent,
    });
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const exportDate = new Date().toISOString().slice(0, 10);

    anchor.href = url;
    anchor.download = `${selectedPlatformId}-speech-validation-${exportDate}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleStartAttempt = async () => {
    if (activeAttempt) {
      return;
    }

    try {
      if (!isSessionActive) {
        await startSession();
      }

      if (!isVoiceAutoReplyEnabled) {
        updateVoiceAutoReplyEnabled(true);
      }

      const now = Date.now();
      setActiveAttempt({
        armedAtMs: now,
        deadlineAtMs: now + VALID_SPEECH_RESPONSE_TIMEOUT_MS,
        matchedTranscript: null,
        observedTranscript: null,
        responseLatencyMeasurement: null,
        responseStartedAtMs: null,
        testCaseId: currentTestCase.id,
      });
      setRuntimeNotice(getAttemptInstructions(currentTestCase));
    } catch (error) {
      console.error('Failed to start valid speech evaluation attempt', error);
      setRuntimeNotice(
        '세션 연결에 실패해서 이번 문장을 시작하지 못했음. 토큰 상태와 마이크 권한을 먼저 확인하면 됨'
      );
    }
  };

  const handleRetryCurrentCase = () => {
    handleStartAttempt();
  };

  return (
    <section className="rounded-[28px] border border-[var(--color-gray-200)] bg-[var(--color-bg-secondary)] p-4 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-bg-secondary)] sm:p-5">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-primary)]">
            <BarChart2 size={16} />
            <span>Chrome Speech Validation Harness</span>
          </div>
          <h2 className="text-xl font-semibold text-[var(--color-gray-900)] dark:text-white">
            Chrome 음성 자동응답 검증
          </h2>
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            Chrome on Windows/macOS에서 자연 발화는 자동응답되는지,
            TV/주변 대화/생활 소음은 그대로 무시되는지를 같은 마이크 경로로
            함께 확인합니다.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleResetRun}
            disabled={Boolean(activeAttempt)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-gray-200)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-gray-700)] transition-colors dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]',
              activeAttempt
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
            )}
          >
            <RotateCcw size={16} />
            <span>현재 플랫폼 초기화</span>
          </button>

          <button
            type="button"
            onClick={handleExportRun}
            className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-gray-200)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]"
          >
            <Download size={16} />
            <span>JSON 내보내기</span>
          </button>

          <button
            type="button"
            onClick={handleOpenImportDialog}
            disabled={Boolean(activeAttempt)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-gray-200)] bg-white px-4 py-3 text-sm font-medium text-[var(--color-gray-700)] transition-colors dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]',
              activeAttempt
                ? 'cursor-not-allowed opacity-50'
                : 'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
            )}
          >
            <Upload size={16} />
            <span>JSON 가져오기</span>
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            multiple
            onChange={handleImportRunFiles}
            className="hidden"
          />
        </div>
      </div>

      <CrossPlatformVerdictCard verification={crossPlatformVerification} />
      <ResponseLatencyVerdictCard
        verification={crossPlatformLatencyVerification}
      />

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={CheckCircle}
          label="자연 발화 리콜"
          tone="good"
          value={formatRate(summary.responseRecallRate)}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="비의도 억제율"
          tone="good"
          value={formatRate(summary.suppressionPassRate)}
        />
        <SummaryCard
          icon={Mic}
          label="완료/전체"
          tone="neutral"
          value={`${summary.completedCount}/${summary.totalCount}`}
        />
        <SummaryCard
          icon={Clock}
          label="평균 응답 시작"
          tone="neutral"
          value={formatLatency(summary.averageResponseLatencyMs)}
        />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[220px,1fr]">
        <div className="rounded-2xl border border-[var(--color-gray-200)] bg-white p-4 dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
          <label
            htmlFor="platform-select"
            className="mb-2 block text-xs font-medium text-[var(--color-gray-500)]"
          >
            대상 플랫폼
          </label>
          <select
            id="platform-select"
            value={selectedPlatformId}
            onChange={handlePlatformChange}
            disabled={Boolean(activeAttempt)}
            className="w-full rounded-xl border border-[var(--color-gray-200)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-gray-900)] outline-none transition-colors focus:border-[var(--color-primary)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-800)] dark:text-white"
          >
            {VALID_UTTERANCE_PLATFORM_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-[var(--color-gray-500)]">
            {currentPlatform?.notes}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-gray-200)] bg-white p-4 dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
          <div className="mb-2 text-xs font-medium text-[var(--color-gray-500)]">
            실행 메모
          </div>
          <p className="text-sm text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]">
            {runtimeNotice}
          </p>
          {!isVoiceAutoReplyEnabled ? (
            <p className="mt-2 text-xs text-[var(--color-warning)]">
              하네스를 시작하면 자동응답이 켜져서 응답 시작 이벤트까지 함께
              측정함
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid gap-3 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-2xl border border-[var(--color-gray-200)] bg-white p-4 dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-[var(--color-gray-500)]">
                현재 케이스 {currentTestCaseIndex + 1}/{CHROME_VALIDATION_TEST_SET.length}
              </div>
              <div className="text-lg font-semibold text-[var(--color-gray-900)] dark:text-white">
                {currentTestCase.prompt}
              </div>
            </div>

            <span className="rounded-full bg-[var(--color-gray-100)] px-3 py-1 text-xs font-medium text-[var(--color-gray-600)] dark:bg-[var(--color-gray-800)] dark:text-[var(--color-gray-300)]">
              {currentTestCase.label}
            </span>
          </div>

          <p className="text-sm text-[var(--color-gray-500)]">
            {currentTestCase.notes}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {currentTestCase.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePreviousCase}
              disabled={currentTestCaseIndex === 0 || Boolean(activeAttempt)}
              className={cn(
                'flex items-center gap-2 rounded-2xl border border-[var(--color-gray-200)] px-4 py-3 text-sm font-medium dark:border-[var(--color-gray-700)]',
                currentTestCaseIndex === 0 || activeAttempt
                  ? 'cursor-not-allowed bg-[var(--color-gray-100)] text-[var(--color-gray-400)] dark:bg-[var(--color-gray-800)]'
                  : 'bg-white text-[var(--color-gray-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]'
              )}
            >
              <ChevronLeft size={16} />
              <span>이전</span>
            </button>

            <button
              type="button"
              onClick={handleNextCase}
              disabled={
                currentTestCaseIndex === CHROME_VALIDATION_TEST_SET.length - 1 ||
                Boolean(activeAttempt)
              }
              className={cn(
                'flex items-center gap-2 rounded-2xl border border-[var(--color-gray-200)] px-4 py-3 text-sm font-medium dark:border-[var(--color-gray-700)]',
                currentTestCaseIndex === CHROME_VALIDATION_TEST_SET.length - 1 ||
                  activeAttempt
                  ? 'cursor-not-allowed bg-[var(--color-gray-100)] text-[var(--color-gray-400)] dark:bg-[var(--color-gray-800)]'
                  : 'bg-white text-[var(--color-gray-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]'
              )}
            >
              <span>다음</span>
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={handleStartAttempt}
              disabled={Boolean(activeAttempt)}
              className={cn(
                'flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white',
                activeAttempt
                  ? 'cursor-not-allowed bg-[var(--color-gray-300)]'
                  : 'gradient-primary shadow-sm hover:opacity-95'
              )}
            >
              <Play size={16} />
              <span>현재 케이스 측정</span>
            </button>

            <button
              type="button"
              onClick={handleRetryCurrentCase}
              disabled={Boolean(activeAttempt)}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium',
                activeAttempt
                  ? 'cursor-not-allowed border-[var(--color-gray-200)] bg-[var(--color-gray-100)] text-[var(--color-gray-400)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-800)]'
                  : 'border-[var(--color-gray-200)] bg-white text-[var(--color-gray-700)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-200)]'
              )}
            >
              <RotateCcw size={16} />
              <span>현재 케이스 재측정</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-gray-200)] bg-white p-4 dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
          <div className="mb-3 text-xs font-medium text-[var(--color-gray-500)]">
            현재 케이스 결과
          </div>
          {activeAttempt ? (
            <div className="rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--color-primary)]">
                <Mic size={16} />
                <span>측정 중</span>
              </div>
              <p className="text-sm text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]">
                {getAttemptInstructions(currentTestCase)}
              </p>
            </div>
          ) : currentResult ? (
            <div
              className={cn(
                'rounded-2xl border p-4',
                getResultToneClasses(currentResult.status)
              )}
            >
              <div className="mb-2 text-sm font-medium">
                {currentResult.status === 'pass'
                  ? '최근 측정 통과'
                  : isSuppressionCase(currentTestCase)
                    ? '최근 측정 오검출'
                    : '최근 측정 미검출'}
              </div>
              <p className="text-sm">
                전사: {currentResult.transcript || '(없음)'}
              </p>
              <p className="mt-2 text-xs">
                {getResultDetailText({
                  result: currentResult,
                  testCase: currentTestCase,
                })}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--color-gray-300)] p-4 text-sm text-[var(--color-gray-500)] dark:border-[var(--color-gray-700)]">
              아직 이 문장의 결과가 없음
            </div>
          )}

          <div className="mt-4 rounded-2xl bg-[var(--color-gray-50)] p-4 dark:bg-[var(--color-gray-800)]">
            <div className="mb-2 text-xs font-medium text-[var(--color-gray-500)]">
              실행 규칙
            </div>
            <ul className="space-y-2 text-sm text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]">
              {CHROME_VALIDATION_EVALUATION_NOTES.map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {CHROME_VALIDATION_TEST_SET.map((testCase) => (
          <ResultRow
            key={testCase.id}
            result={resultMap[testCase.id]}
            testCase={testCase}
          />
        ))}
      </div>
    </section>
  );
};

export default ValidSpeechEvaluationPanel;
