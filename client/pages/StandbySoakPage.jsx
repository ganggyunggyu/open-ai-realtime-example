import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Clock, RotateCcw } from 'react-feather';
import { useRealtimeSession } from '@/features/realtime/hooks/useRealtimeSession';
import {
  STANDBY_SOAK_DEFAULT_DURATION_MS,
  STANDBY_SOAK_PLATFORM_OPTIONS,
  STANDBY_SOAK_STORAGE_KEY,
  STANDBY_SOAK_TEST_PLAN_VERSION,
  appendStandbySoakEntry,
  createStandbySoakMeasurementEntry,
  createStandbySoakRun,
  formatStandbySoakDuration,
  formatStandbySoakTimestamp,
  getStandbySoakDurationMsFromSearch,
  getStandbySoakPlatform,
  getStandbySoakScenarioLabel,
  getStandbySoakSummary,
  normalizeStandbySoakRun,
} from '@/features/realtime/lib/standby-soak';
import { cn } from '@/shared/lib/cn';

const STANDBY_SOAK_LOG_LIMIT = 40;
const DEFAULT_PLATFORM_ID = STANDBY_SOAK_PLATFORM_OPTIONS[0]?.id || 'chrome-macos';

const getStandbySoakDurationMs = () => {
  if (typeof window === 'undefined') {
    return STANDBY_SOAK_DEFAULT_DURATION_MS;
  }

  return getStandbySoakDurationMsFromSearch(window.location.search);
};

const createFreshStandbySoakRun = (durationMs, platformId) =>
  createStandbySoakRun({
    durationMs,
    platformId,
    scenarioLabel: getStandbySoakScenarioLabel(durationMs),
  });

const createDefaultStandbySoakRuns = (durationMs) =>
  STANDBY_SOAK_PLATFORM_OPTIONS.reduce((runs, { id }) => {
    runs[id] = createFreshStandbySoakRun(durationMs, id);
    return runs;
  }, {});

const normalizeStoredStandbySoakRun = (storedRun, durationMs, platformId) => {
  if (!storedRun || typeof storedRun !== 'object') {
    return createFreshStandbySoakRun(durationMs, platformId);
  }

  return normalizeStandbySoakRun(storedRun, {
    durationMs,
    platformId,
    startedAt: storedRun.startedAt,
  });
};

const loadStoredStandbySoakRuns = (durationMs) => {
  if (typeof window === 'undefined') {
    return createDefaultStandbySoakRuns(durationMs);
  }

  try {
    const storedValue = window.localStorage.getItem(STANDBY_SOAK_STORAGE_KEY);
    const defaultRuns = createDefaultStandbySoakRuns(durationMs);

    if (!storedValue) {
      return defaultRuns;
    }

    const parsedValue = JSON.parse(storedValue);

    if (parsedValue && Array.isArray(parsedValue.entries)) {
      const platformId = parsedValue.platformId || DEFAULT_PLATFORM_ID;
      return {
        ...defaultRuns,
        [platformId]: normalizeStoredStandbySoakRun(
          parsedValue,
          durationMs,
          platformId
        ),
      };
    }

    if (!parsedValue || typeof parsedValue !== 'object') {
      return defaultRuns;
    }

    return STANDBY_SOAK_PLATFORM_OPTIONS.reduce((runs, { id }) => {
      runs[id] = normalizeStoredStandbySoakRun(parsedValue[id], durationMs, id);
      return runs;
    }, {});
  } catch (error) {
    console.error('[STANDBY_SOAK] 저장된 측정값 복원 실패', error);
    return createDefaultStandbySoakRuns(durationMs);
  }
};

const MetricCard = ({ icon: Icon, label, tone = 'neutral', value }) => {
  const toneClassName =
    tone === 'success'
      ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
      : tone === 'danger'
        ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]'
        : 'border-[var(--color-gray-200)] bg-white text-[var(--color-gray-700)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-100)]';

  return (
    <section className={cn('rounded-3xl border p-5 shadow-sm', toneClassName)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm opacity-80">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="rounded-2xl bg-black/5 p-3 dark:bg-white/5">
          <Icon size={20} />
        </div>
      </div>
    </section>
  );
};

const MeasurementLogList = ({ entries }) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--color-gray-300)] bg-[var(--color-gray-50)] px-5 py-10 text-center text-sm text-[var(--color-gray-500)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-400)]">
        아직 기록된 turn start 또는 response generation 이벤트가 없음
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <article
          key={`${entry.kind}-${entry.recordedAt}-${entry.eventId || entry.eventType}`}
          className="rounded-3xl border border-[var(--color-gray-200)] bg-white p-4 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  entry.kind === 'response_generation'
                    ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                )}
              >
                {entry.kind === 'response_generation'
                  ? 'Response generation'
                  : 'Turn start'}
              </span>
              <span className="text-sm text-[var(--color-gray-500)]">
                {entry.eventType}
              </span>
            </div>
            <time className="text-sm text-[var(--color-gray-400)]">
              {formatStandbySoakTimestamp(entry.recordedAt)}
            </time>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)] sm:grid-cols-2">
            <p>fixture: {entry.fixtureLabel || '-'}</p>
            <p>source: {entry.source}</p>
            <p>trigger: {entry.trigger || '-'}</p>
            <p>detail: {entry.detail || '-'}</p>
            <p>transcript: {entry.transcript || '-'}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

const FixtureCoverageCard = ({ fixture }) => {
  const toneClassName =
    fixture.verdict === 'fail'
      ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10'
      : fixture.verdict === 'pass'
        ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10'
        : 'border-[var(--color-gray-200)] bg-white dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]';
  const statusLabel =
    fixture.verdict === 'fail'
      ? 'FAIL'
      : fixture.verdict === 'pass'
        ? 'PASS'
        : fixture.isActive
          ? 'RUNNING'
          : 'PENDING';
  const statusClassName =
    fixture.verdict === 'fail'
      ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
      : fixture.verdict === 'pass'
        ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
        : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]';

  return (
    <article className={cn('rounded-[2rem] border p-5 shadow-sm', toneClassName)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-primary)]">
            {fixture.label}
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--color-gray-900)] dark:text-white">
            {fixture.prompt}
          </p>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', statusClassName)}>
          {statusLabel}
        </span>
      </div>

      <p className="mt-3 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]">
        {fixture.notes}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {fixture.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-medium text-[var(--color-primary)]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)] sm:grid-cols-2">
        <p>duration: {formatStandbySoakDuration(fixture.durationMs)}</p>
        <p>response generations: {fixture.responseGenerationCount}</p>
        <p>turn starts: {fixture.turnStartCount}</p>
        <p>window: {fixture.isActive ? 'current fixture' : fixture.isComplete ? 'completed' : 'queued'}</p>
      </div>
    </article>
  );
};

const VerdictBanner = ({ platform, summary }) => {
  const verdictLabel =
    summary.verdict === 'pass'
      ? 'PASS'
      : summary.verdict === 'fail'
        ? 'FAIL'
        : 'RUNNING';
  const verdictClassName =
    summary.verdict === 'pass'
      ? 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]'
      : summary.verdict === 'fail'
        ? 'border-[var(--color-error)]/30 bg-[var(--color-error)]/10 text-[var(--color-error)]'
        : 'border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 text-[var(--color-warning)]';

  return (
    <section className={cn('rounded-[2rem] border p-6 shadow-sm', verdictClassName)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-80">
            {platform.label} standby fixture verdict
          </p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            {verdictLabel}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-80">Fixtures completed</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            {summary.completedFixtureCount}/{summary.totalFixtureCount}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm opacity-80">
        {summary.verdict === 'pass'
          ? 'ambient-noise, TV-audio, nearby-conversation 전 구간에서 unintended response 0건으로 통과'
          : summary.verdict === 'fail'
            ? 'fixture 구간 중 response generation 이 발생해 즉시 실패 판정'
            : '세 fixture를 순서대로 진행 중이며, 전체 standby 윈도우가 끝날 때까지 unintended response 0건이면 통과'}
      </p>
    </section>
  );
};

const StandbySoakPage = () => {
  const [durationMs] = useState(getStandbySoakDurationMs);
  const [selectedPlatformId, setSelectedPlatformId] = useState(DEFAULT_PLATFORM_ID);
  const [platformRuns, setPlatformRuns] = useState(() =>
    loadStoredStandbySoakRuns(durationMs)
  );
  const [now, setNow] = useState(() => Date.now());
  const verdictRef = useRef(null);

  const activeRun =
    platformRuns[selectedPlatformId] ||
    createFreshStandbySoakRun(durationMs, selectedPlatformId);
  const currentPlatform = getStandbySoakPlatform(selectedPlatformId);
  const summary = getStandbySoakSummary(activeRun, now);
  const visibleEntries = activeRun.entries.slice(0, STANDBY_SOAK_LOG_LIMIT);
  const activeFixture =
    summary.fixtureSummaries.find(({ isActive }) => isActive) || null;

  const handleSessionEvent = ({ direction, event, meta }) => {
    const measuredAt = Date.now();
    const entry = createStandbySoakMeasurementEntry({
      direction,
      event,
      measuredAt,
      meta,
    });

    if (!entry) {
      return;
    }

    console.info('[STANDBY_SOAK][EVENT]', {
      ...entry,
      platformId: selectedPlatformId,
    });
    setPlatformRuns((previousRuns) => {
      const previousRun =
        previousRuns[selectedPlatformId] ||
        createFreshStandbySoakRun(durationMs, selectedPlatformId);

      return {
        ...previousRuns,
        [selectedPlatformId]: appendStandbySoakEntry(previousRun, entry, measuredAt),
      };
    });
  };

  const { isSessionActive, micLevel, startSession } = useRealtimeSession({
    forceVoiceAutoReplyEnabled: true,
    onSessionEvent: handleSessionEvent,
    shouldUseDailySchedule: false,
  });

  const handleResetRun = () => {
    setPlatformRuns((previousRuns) => ({
      ...previousRuns,
      [selectedPlatformId]: createFreshStandbySoakRun(durationMs, selectedPlatformId),
    }));
    setNow(Date.now());
  };

  const handlePlatformChange = (event) => {
    setSelectedPlatformId(event.target.value);
    setNow(Date.now());
  };

  useEffect(() => {
    const autoStartTimer = window.setTimeout(() => {
      startSession().catch((error) => {
        console.error('[STANDBY_SOAK] 세션 자동 시작 실패', error);
      });
    }, 0);

    return () => {
      window.clearTimeout(autoStartTimer);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STANDBY_SOAK_STORAGE_KEY,
      JSON.stringify(platformRuns)
    );
  }, [platformRuns]);

  useEffect(() => {
    const verdictKey = `${selectedPlatformId}:${summary.verdict}`;

    if (verdictRef.current === verdictKey) {
      return;
    }

    verdictRef.current = verdictKey;
    console.info('[STANDBY_SOAK][SUMMARY]', {
      completedFixtureCount: summary.completedFixtureCount,
      fixtureFailureCount: summary.fixtureFailureCount,
      platformId: selectedPlatformId,
      responseGenerationCount: summary.responseGenerationCount,
      runId: activeRun.runId,
      turnStartCount: summary.turnStartCount,
      verdict: summary.verdict,
    });
  }, [
    activeRun.runId,
    selectedPlatformId,
    summary.completedFixtureCount,
    summary.fixtureFailureCount,
    summary.responseGenerationCount,
    summary.turnStartCount,
    summary.verdict,
  ]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-8 text-[var(--color-gray-900)] dark:bg-[var(--color-bg)] dark:text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border border-[var(--color-gray-200)] bg-white/90 p-6 shadow-sm backdrop-blur dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-[var(--color-primary)]">
                Standby soak measurement
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Chrome Windows/macOS standby fixture 검증 경로
              </h1>
              <p className="mt-3 text-sm text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)]">
                브라우저 쪽 자동응답만 켠 상태에서 ambient-noise, TV-audio,
                nearby-conversation fixture 를 같은 마이크 경로로 재현하고,
                전체 standby 윈도우 동안 unintended response 0건인지
                플랫폼별로 반복 검증합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)]">
                <span className="mb-2 block">대상 플랫폼</span>
                <select
                  value={selectedPlatformId}
                  onChange={handlePlatformChange}
                  className="rounded-2xl border border-[var(--color-gray-200)] bg-white px-4 py-2 text-sm text-[var(--color-gray-700)] outline-none transition-colors focus:border-[var(--color-primary)] dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)] dark:text-[var(--color-gray-100)]"
                >
                  {STANDBY_SOAK_PLATFORM_OPTIONS.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleResetRun}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-[var(--color-gray-200)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] dark:border-[var(--color-gray-700)] dark:text-[var(--color-gray-200)]"
              >
                <RotateCcw size={16} />
                <span>현재 플랫폼 새 측정 시작</span>
              </button>
            </div>
          </div>
        </section>

        <VerdictBanner platform={currentPlatform} summary={summary} />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Clock}
            label="Elapsed"
            value={formatStandbySoakDuration(summary.elapsedMs)}
          />
          <MetricCard
            icon={Activity}
            label="Fixtures complete"
            tone={summary.completedFixtureCount === summary.totalFixtureCount ? 'success' : 'neutral'}
            value={`${summary.completedFixtureCount}/${summary.totalFixtureCount}`}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Response generations"
            tone={summary.responseGenerationCount > 0 ? 'danger' : 'success'}
            value={summary.responseGenerationCount}
          />
          <MetricCard
            icon={Clock}
            label="Remaining"
            tone={summary.verdict === 'pass' ? 'success' : 'neutral'}
            value={formatStandbySoakDuration(summary.remainingMs)}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {summary.fixtureSummaries.map((fixture) => (
            <FixtureCoverageCard key={fixture.id} fixture={fixture} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] border border-[var(--color-gray-200)] bg-white p-6 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">최근 측정 로그</h2>
                <p className="mt-1 text-sm text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)]">
                  최신 {visibleEntries.length}건 표시
                </p>
              </div>
              <p className="text-sm text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)]">
                시작 시각 {formatStandbySoakTimestamp(activeRun.startedAt)}
              </p>
            </div>

            <div className="mt-5">
              <MeasurementLogList entries={visibleEntries} />
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[2rem] border border-[var(--color-gray-200)] bg-white p-6 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
              <h2 className="text-xl font-semibold">Run metadata</h2>
              <div className="mt-4 space-y-3 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]">
                <p>platform: {currentPlatform.label}</p>
                <p>browser: {currentPlatform.browser}</p>
                <p>operating system: {currentPlatform.operatingSystem}</p>
                <p>fixture version: {STANDBY_SOAK_TEST_PLAN_VERSION}</p>
                <p>scenario: {activeRun.scenarioLabel}</p>
                <p>current fixture: {activeFixture?.label || 'completed'}</p>
                <p>session active: {isSessionActive ? 'yes' : 'no'}</p>
                <p>auto reply: forced on</p>
                <p>daily schedule: disabled for soak path</p>
                <p>mic level: {micLevel.toFixed(3)}</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--color-gray-200)] bg-white p-6 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
              <h2 className="text-xl font-semibold">Pass / fail rule</h2>
              <div className="mt-4 space-y-3 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]">
                <p>pass: 세 fixture 전체 종료 시점까지 response generation 0건</p>
                <p>fail: 어느 fixture 든 response generation 1건 이상 발생</p>
                <p>fixture set: ambient-noise, TV-audio, nearby-conversation</p>
                <p>reference count: falseActivationCount = responseGenerationCount</p>
              </div>
            </section>

            <section className="rounded-[2rem] border border-[var(--color-gray-200)] bg-white p-6 shadow-sm dark:border-[var(--color-gray-700)] dark:bg-[var(--color-gray-900)]">
              <h2 className="text-xl font-semibold">Execution note</h2>
              <div className="mt-4 space-y-3 text-sm text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]">
                <p>{currentPlatform.notes}</p>
                <p>
                  `?durationHours=` 쿼리를 붙이면 짧은 rehearsal 러닝으로도 같은
                  fixture 순서를 재현할 수 있습니다.
                </p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StandbySoakPage;
