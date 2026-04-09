import { VALID_UTTERANCE_PLATFORM_OPTIONS } from './valid-utterance-test-set.js';

export const STANDBY_SOAK_PATHNAME = '/standby-soak';
export const STANDBY_SOAK_STORAGE_KEY = 'standbySoakMeasurementRun';
export const STANDBY_SOAK_DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000;
export const STANDBY_SOAK_TEST_PLAN_VERSION = '2026-03-31-standby-soak-v1';
export const STANDBY_SOAK_PLATFORM_OPTIONS = VALID_UTTERANCE_PLATFORM_OPTIONS.map(
  (platform) => ({
    ...platform,
  })
);

const HOUR_IN_MS = 60 * 60 * 1000;
const TURN_START_EVENT_TYPES = new Set(['input_audio_buffer.speech_started']);
const RESPONSE_GENERATION_EVENT_TYPES = new Set(['response.create']);
const DEFAULT_STANDBY_SOAK_PLATFORM_ID =
  STANDBY_SOAK_PLATFORM_OPTIONS[0]?.id || 'chrome-macos';
const STANDBY_SOAK_FIXTURE_BLUEPRINTS = [
  {
    id: 'ambient-noise-standby',
    label: 'Ambient noise',
    notes:
      '생활 소음만 계속 들리는 기본 대기 구간으로, 허용 전사나 응답 시작 없이 유지되어야 합니다.',
    prompt:
      '키보드 타건, 컵 소리, 문 여닫기 같은 일상 배경 소음만 들리게 둡니다.',
    tags: ['ambient-noise', 'household'],
  },
  {
    id: 'tv-audio-standby',
    label: 'TV audio',
    notes:
      'TV 뉴스나 예능 대사가 평소 시청 볼륨으로 재생되어도 자동응답이 시작되면 안 됩니다.',
    prompt: 'TV 뉴스나 예능 대사를 평소 시청 볼륨으로 재생해 둡니다.',
    tags: ['tv-audio', 'ambient-noise'],
  },
  {
    id: 'nearby-conversation-standby',
    label: 'Nearby conversation',
    notes:
      '사용자를 향하지 않는 주변 대화가 들려도 응답하지 않아야 합니다.',
    prompt: '옆사람 둘의 짧은 대화가 계속 들리게 둡니다.',
    tags: ['nearby-conversation', 'incidental-speech'],
  },
];

const createIsoTimestamp = (value) => {
  if (typeof value === 'string') {
    return value;
  }

  return new Date(value).toISOString();
};

const getSafeStartedAtMs = (startedAt) => {
  const startedAtMs = new Date(startedAt).getTime();

  if (Number.isNaN(startedAtMs)) {
    return Date.now();
  }

  return startedAtMs;
};

const getSafeDurationMs = (durationMs) => {
  const parsedDurationMs =
    typeof durationMs === 'number'
      ? durationMs
      : Number.parseFloat(durationMs || '');

  if (!Number.isFinite(parsedDurationMs) || parsedDurationMs <= 0) {
    return STANDBY_SOAK_DEFAULT_DURATION_MS;
  }

  return Math.round(parsedDurationMs);
};

const getStandbySoakEntryRecordedAtMs = (entry) => {
  const recordedAtMs = new Date(entry?.recordedAt || '').getTime();

  if (Number.isNaN(recordedAtMs)) {
    return null;
  }

  return recordedAtMs;
};

const getStandbySoakEntryCounts = (entries = []) => ({
  falseActivationCount: entries.filter(
    ({ kind }) => kind === 'response_generation'
  ).length,
  responseGenerationCount: entries.filter(
    ({ kind }) => kind === 'response_generation'
  ).length,
  turnStartCount: entries.filter(({ kind }) => kind === 'turn_started').length,
});

export const getStandbySoakPlatform = (platformId) =>
  STANDBY_SOAK_PLATFORM_OPTIONS.find(({ id }) => id === platformId) || {
    ...(STANDBY_SOAK_PLATFORM_OPTIONS[0] || {}),
    id: platformId || DEFAULT_STANDBY_SOAK_PLATFORM_ID,
    label:
      STANDBY_SOAK_PLATFORM_OPTIONS[0]?.label ||
      platformId ||
      DEFAULT_STANDBY_SOAK_PLATFORM_ID,
  };

export const isStandbySoakPath = (pathname = '') =>
  pathname === STANDBY_SOAK_PATHNAME ||
  pathname.startsWith(`${STANDBY_SOAK_PATHNAME}/`);

export const getStandbySoakDurationMsFromSearch = (search = '') => {
  const params = new URLSearchParams(search);
  const durationHours = Number.parseFloat(params.get('durationHours') || '');

  if (!Number.isFinite(durationHours) || durationHours <= 0) {
    return STANDBY_SOAK_DEFAULT_DURATION_MS;
  }

  return Math.round(durationHours * HOUR_IN_MS);
};

export const getStandbySoakScenarioLabel = (
  durationMs = STANDBY_SOAK_DEFAULT_DURATION_MS
) => {
  if (durationMs === STANDBY_SOAK_DEFAULT_DURATION_MS) {
    return '24시간 Chrome standby suppression 시나리오';
  }

  const durationHours = durationMs / HOUR_IN_MS;
  const roundedDuration =
    durationHours % 1 === 0 ? durationHours.toString() : durationHours.toFixed(1);

  return `${roundedDuration}시간 Chrome standby suppression 시나리오`;
};

export const createStandbySoakFixturePlan = ({
  durationMs = STANDBY_SOAK_DEFAULT_DURATION_MS,
  platformId = DEFAULT_STANDBY_SOAK_PLATFORM_ID,
} = {}) => {
  const safeDurationMs = getSafeDurationMs(durationMs);
  const safePlatformId = getStandbySoakPlatform(platformId).id;
  const fixtureCount = STANDBY_SOAK_FIXTURE_BLUEPRINTS.length;
  const baseDurationMs = Math.floor(safeDurationMs / fixtureCount);
  let remainingMs = safeDurationMs - baseDurationMs * fixtureCount;
  let elapsedMs = 0;

  return STANDBY_SOAK_FIXTURE_BLUEPRINTS.map((fixture) => {
    const fixtureDurationMs = baseDurationMs + (remainingMs > 0 ? 1 : 0);
    const startOffsetMs = elapsedMs;

    elapsedMs += fixtureDurationMs;
    if (remainingMs > 0) {
      remainingMs -= 1;
    }

    return {
      ...fixture,
      durationMs: fixtureDurationMs,
      endOffsetMs: elapsedMs,
      platformId: safePlatformId,
      startOffsetMs,
    };
  });
};

export const getStandbySoakFixtureAtElapsedMs = ({
  elapsedMs = 0,
  fixturePlan = [],
}) => {
  if (!Array.isArray(fixturePlan) || fixturePlan.length === 0) {
    return null;
  }

  const totalDurationMs =
    fixturePlan[fixturePlan.length - 1]?.endOffsetMs || fixturePlan.length;
  const normalizedElapsedMs = Math.min(
    Math.max(0, elapsedMs),
    Math.max(0, totalDurationMs - 1)
  );

  return (
    fixturePlan.find(
      ({ startOffsetMs, endOffsetMs }) =>
        normalizedElapsedMs >= startOffsetMs && normalizedElapsedMs < endOffsetMs
    ) || fixturePlan[fixturePlan.length - 1]
  );
};

export const normalizeStandbySoakRun = (
  run,
  {
    durationMs = run?.durationMs,
    platformId = run?.platformId,
    startedAt = run?.startedAt,
  } = {}
) => {
  const safeDurationMs = getSafeDurationMs(durationMs);
  const safePlatformId = getStandbySoakPlatform(platformId).id;
  const normalizedStartedAt = createIsoTimestamp(startedAt || Date.now());

  return {
    durationMs: safeDurationMs,
    entries: Array.isArray(run?.entries) ? run.entries : [],
    falseActivationCount: run?.falseActivationCount || 0,
    fixturePlan: createStandbySoakFixturePlan({
      durationMs: safeDurationMs,
      platformId: safePlatformId,
    }),
    platformId: safePlatformId,
    responseGenerationCount: run?.responseGenerationCount || 0,
    runId: run?.runId || `standby-soak-${safePlatformId}-${normalizedStartedAt}`,
    scenarioLabel: run?.scenarioLabel || getStandbySoakScenarioLabel(safeDurationMs),
    startedAt: normalizedStartedAt,
    testPlanVersion: STANDBY_SOAK_TEST_PLAN_VERSION,
    turnStartCount: run?.turnStartCount || 0,
  };
};

const getStandbySoakScenarioEndMs = (run) =>
  getSafeStartedAtMs(run?.startedAt) + getSafeDurationMs(run?.durationMs);

const getStandbySoakInWindowEntries = (run) => {
  const scenarioEndMs = getStandbySoakScenarioEndMs(run);

  return (run?.entries || []).filter((entry) => {
    const recordedAtMs = getStandbySoakEntryRecordedAtMs(entry);

    return recordedAtMs !== null && recordedAtMs <= scenarioEndMs;
  });
};

const getStandbySoakEntryFixture = (run, entry) => {
  if (!entry) {
    return null;
  }

  if (entry.fixtureId) {
    return run.fixturePlan.find(({ id }) => id === entry.fixtureId) || null;
  }

  const recordedAtMs = getStandbySoakEntryRecordedAtMs(entry);

  if (recordedAtMs === null) {
    return null;
  }

  return getStandbySoakFixtureAtElapsedMs({
    elapsedMs: recordedAtMs - getSafeStartedAtMs(run.startedAt),
    fixturePlan: run.fixturePlan,
  });
};

export const createStandbySoakRun = ({
  durationMs = STANDBY_SOAK_DEFAULT_DURATION_MS,
  platformId = DEFAULT_STANDBY_SOAK_PLATFORM_ID,
  scenarioLabel = getStandbySoakScenarioLabel(durationMs),
  startedAt = Date.now(),
} = {}) =>
  normalizeStandbySoakRun(
    {
      durationMs,
      entries: [],
      falseActivationCount: 0,
      platformId,
      responseGenerationCount: 0,
      scenarioLabel,
      startedAt,
      turnStartCount: 0,
    },
    {
      durationMs,
      platformId,
      startedAt,
    }
  );

export const createStandbySoakMeasurementEntry = ({
  direction,
  event,
  measuredAt = Date.now(),
  meta = {},
}) => {
  if (!event?.type) {
    return null;
  }

  const recordedAt = createIsoTimestamp(measuredAt);

  if (direction === 'incoming' && TURN_START_EVENT_TYPES.has(event.type)) {
    return {
      detail:
        typeof event.audio_start_ms === 'number'
          ? `${event.audio_start_ms}ms`
          : null,
      eventId: event.event_id || null,
      eventType: event.type,
      kind: 'turn_started',
      recordedAt,
      source: direction,
      transcript: event.transcript || null,
      trigger: meta.trigger || null,
    };
  }

  if (direction === 'outgoing' && RESPONSE_GENERATION_EVENT_TYPES.has(event.type)) {
    return {
      detail: meta.reason || null,
      eventId: event.event_id || null,
      eventType: event.type,
      kind: 'response_generation',
      recordedAt,
      source: direction,
      transcript: meta.transcript || null,
      trigger: meta.trigger || null,
    };
  }

  return null;
};

export const getStandbySoakSummary = (run, now = Date.now()) => {
  const normalizedRun = normalizeStandbySoakRun(run);
  const startedAtMs = getSafeStartedAtMs(normalizedRun.startedAt);
  const rawElapsedMs = Math.max(0, now - startedAtMs);
  const elapsedMs = Math.min(rawElapsedMs, normalizedRun.durationMs);
  const remainingMs = Math.max(0, normalizedRun.durationMs - elapsedMs);
  const scenarioComplete = rawElapsedMs >= normalizedRun.durationMs;
  const inWindowEntries = getStandbySoakInWindowEntries(normalizedRun);
  const {
    falseActivationCount,
    responseGenerationCount,
    turnStartCount,
  } = getStandbySoakEntryCounts(inWindowEntries);
  const fixtureSummaries = normalizedRun.fixturePlan.map((fixture) => {
    const fixtureEntries = inWindowEntries.filter((entry) => {
      const entryFixture = getStandbySoakEntryFixture(normalizedRun, entry);

      return entryFixture?.id === fixture.id;
    });
    const fixtureCounts = getStandbySoakEntryCounts(fixtureEntries);
    const isComplete = elapsedMs >= fixture.endOffsetMs;
    const isActive =
      !isComplete &&
      elapsedMs >= fixture.startOffsetMs &&
      elapsedMs < fixture.endOffsetMs;

    let verdict = 'pending';
    if (fixtureCounts.falseActivationCount > 0) {
      verdict = 'fail';
    } else if (isComplete) {
      verdict = 'pass';
    } else if (isActive || fixtureEntries.length > 0) {
      verdict = 'running';
    }

    return {
      ...fixture,
      ...fixtureCounts,
      isActive,
      isComplete,
      verdict,
    };
  });
  const fixtureFailureCount = fixtureSummaries.filter(
    ({ falseActivationCount: count }) => count > 0
  ).length;
  const completedFixtureCount = fixtureSummaries.filter(
    ({ isComplete }) => isComplete
  ).length;

  let verdict = 'running';
  if (falseActivationCount > 0) {
    verdict = 'fail';
  } else if (
    scenarioComplete &&
    completedFixtureCount === fixtureSummaries.length
  ) {
    verdict = 'pass';
  }

  return {
    completedFixtureCount,
    elapsedMs,
    falseActivationCount,
    fixtureFailureCount,
    fixtureSummaries,
    pass: verdict === 'pass',
    remainingMs,
    responseGenerationCount,
    scenarioComplete,
    totalFixtureCount: fixtureSummaries.length,
    turnStartCount,
    verdict,
  };
};

export const appendStandbySoakEntry = (run, entry, now = Date.now()) => {
  const normalizedRun = normalizeStandbySoakRun(run);
  const scenarioEndMs = getStandbySoakScenarioEndMs(normalizedRun);

  if (!entry || now > scenarioEndMs) {
    return {
      ...normalizedRun,
      ...getStandbySoakSummary(normalizedRun, Math.min(now, scenarioEndMs)),
    };
  }

  const fixture = getStandbySoakFixtureAtElapsedMs({
    elapsedMs: now - getSafeStartedAtMs(normalizedRun.startedAt),
    fixturePlan: normalizedRun.fixturePlan,
  });
  const nextEntry = {
    ...entry,
    fixtureId: entry.fixtureId || fixture?.id || null,
    fixtureLabel: entry.fixtureLabel || fixture?.label || null,
    platformId: normalizedRun.platformId,
  };
  const nextEntries = [nextEntry, ...normalizedRun.entries];
  const nextCounts = getStandbySoakEntryCounts(nextEntries);
  const nextRun = {
    ...normalizedRun,
    ...nextCounts,
    entries: nextEntries,
  };

  return {
    ...nextRun,
    ...getStandbySoakSummary(nextRun, now),
  };
};

export const formatStandbySoakDuration = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
};

export const formatStandbySoakTimestamp = (value) =>
  new Date(value).toLocaleString('ko-KR', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
  });
