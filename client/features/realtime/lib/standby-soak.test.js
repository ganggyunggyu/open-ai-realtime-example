import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STANDBY_SOAK_DEFAULT_DURATION_MS,
  STANDBY_SOAK_PLATFORM_OPTIONS,
  appendStandbySoakEntry,
  createStandbySoakMeasurementEntry,
  createStandbySoakFixturePlan,
  createStandbySoakRun,
  getStandbySoakDurationMsFromSearch,
  getStandbySoakSummary,
  isStandbySoakPath,
} from './standby-soak.js';

test('standby soak path matcher only accepts standalone soak path', () => {
  assert.equal(isStandbySoakPath('/standby-soak'), true);
  assert.equal(isStandbySoakPath('/standby-soak/history'), true);
  assert.equal(isStandbySoakPath('/'), false);
});

test('turn start measurement entry is created from incoming speech start event', () => {
  const entry = createStandbySoakMeasurementEntry({
    direction: 'incoming',
    event: {
      audio_start_ms: 320,
      event_id: 'event_1',
      type: 'input_audio_buffer.speech_started',
    },
    measuredAt: '2026-03-31T00:00:00.000Z',
  });

  assert.deepEqual(entry, {
    detail: '320ms',
    eventId: 'event_1',
    eventType: 'input_audio_buffer.speech_started',
    kind: 'turn_started',
    recordedAt: '2026-03-31T00:00:00.000Z',
    source: 'incoming',
    transcript: null,
    trigger: null,
  });
});

test('response generation increments false activation count and fails immediately', () => {
  const run = createStandbySoakRun({
    startedAt: '2026-03-31T00:00:00.000Z',
  });
  const entry = createStandbySoakMeasurementEntry({
    direction: 'outgoing',
    event: {
      event_id: 'event_2',
      type: 'response.create',
    },
    measuredAt: '2026-03-31T00:05:00.000Z',
    meta: {
      trigger: 'voice_auto_reply',
    },
  });

  const nextRun = appendStandbySoakEntry(
    run,
    entry,
    new Date('2026-03-31T00:05:00.000Z').getTime()
  );

  assert.equal(nextRun.falseActivationCount, 1);
  assert.equal(nextRun.responseGenerationCount, 1);
  assert.equal(nextRun.turnStartCount, 0);
  assert.equal(nextRun.verdict, 'fail');
  assert.equal(nextRun.pass, false);
});

test('24 hour noise-only run passes when no false activations were recorded', () => {
  const run = createStandbySoakRun({
    startedAt: '2026-03-31T00:00:00.000Z',
  });

  const summary = getStandbySoakSummary(
    run,
    new Date('2026-04-01T00:00:00.000Z').getTime()
  );

  assert.equal(summary.verdict, 'pass');
  assert.equal(summary.pass, true);
  assert.equal(summary.falseActivationCount, 0);
  assert.equal(summary.scenarioComplete, true);
});

test('duration override falls back to 24 hours when query is missing or invalid', () => {
  assert.equal(
    getStandbySoakDurationMsFromSearch(''),
    STANDBY_SOAK_DEFAULT_DURATION_MS
  );
  assert.equal(
    getStandbySoakDurationMsFromSearch('?durationHours=1.5'),
    90 * 60 * 1000
  );
  assert.equal(
    getStandbySoakDurationMsFromSearch('?durationHours=invalid'),
    STANDBY_SOAK_DEFAULT_DURATION_MS
  );
});

test('standby soak fixture plan covers ambient noise, TV audio, and nearby conversation on both Chrome platforms', () => {
  const platformIds = STANDBY_SOAK_PLATFORM_OPTIONS.map(({ id }) => id).sort();

  assert.deepEqual(platformIds, ['chrome-macos', 'chrome-windows']);

  STANDBY_SOAK_PLATFORM_OPTIONS.forEach(({ id }) => {
    const fixturePlan = createStandbySoakFixturePlan({
      durationMs: 3_000,
      platformId: id,
    });

    assert.deepEqual(
      fixturePlan.map(({ id: fixtureId }) => fixtureId),
      [
        'ambient-noise-standby',
        'tv-audio-standby',
        'nearby-conversation-standby',
      ]
    );
    assert.deepEqual(
      fixturePlan.map(({ platformId }) => platformId),
      [id, id, id]
    );
    assert.ok(fixturePlan.some(({ tags }) => tags.includes('ambient-noise')));
    assert.ok(fixturePlan.some(({ tags }) => tags.includes('tv-audio')));
    assert.ok(
      fixturePlan.some(({ tags }) => tags.includes('nearby-conversation'))
    );
    assert.equal(
      fixturePlan.reduce((total, fixture) => total + fixture.durationMs, 0),
      3_000
    );
  });
});

test('full standby run stays passing only when every fixture completes with zero unintended responses', () => {
  const startedAtMs = new Date('2026-03-31T00:00:00.000Z').getTime();
  let run = createStandbySoakRun({
    durationMs: 3_000,
    platformId: 'chrome-macos',
    startedAt: startedAtMs,
  });

  run = appendStandbySoakEntry(
    run,
    createStandbySoakMeasurementEntry({
      direction: 'incoming',
      event: {
        audio_start_ms: 120,
        event_id: 'event_ambient',
        type: 'input_audio_buffer.speech_started',
      },
      measuredAt: startedAtMs + 250,
    }),
    startedAtMs + 250
  );
  run = appendStandbySoakEntry(
    run,
    createStandbySoakMeasurementEntry({
      direction: 'incoming',
      event: {
        audio_start_ms: 180,
        event_id: 'event_tv',
        type: 'input_audio_buffer.speech_started',
      },
      measuredAt: startedAtMs + 1_250,
    }),
    startedAtMs + 1_250
  );
  run = appendStandbySoakEntry(
    run,
    createStandbySoakMeasurementEntry({
      direction: 'incoming',
      event: {
        audio_start_ms: 210,
        event_id: 'event_chat',
        type: 'input_audio_buffer.speech_started',
      },
      measuredAt: startedAtMs + 2_250,
    }),
    startedAtMs + 2_250
  );

  const summary = getStandbySoakSummary(run, startedAtMs + 3_000);

  assert.equal(summary.pass, true);
  assert.equal(summary.falseActivationCount, 0);
  assert.equal(summary.completedFixtureCount, 3);
  assert.deepEqual(
    summary.fixtureSummaries.map(({ id, turnStartCount, verdict }) => ({
      id,
      turnStartCount,
      verdict,
    })),
    [
      {
        id: 'ambient-noise-standby',
        turnStartCount: 1,
        verdict: 'pass',
      },
      {
        id: 'tv-audio-standby',
        turnStartCount: 1,
        verdict: 'pass',
      },
      {
        id: 'nearby-conversation-standby',
        turnStartCount: 1,
        verdict: 'pass',
      },
    ]
  );
});

test('response generation inside a fixture fails the standby run immediately', () => {
  const startedAtMs = new Date('2026-03-31T00:00:00.000Z').getTime();
  const run = createStandbySoakRun({
    durationMs: 3_000,
    platformId: 'chrome-windows',
    startedAt: startedAtMs,
  });
  const responseEntry = createStandbySoakMeasurementEntry({
    direction: 'outgoing',
    event: {
      event_id: 'event_response',
      type: 'response.create',
    },
    measuredAt: startedAtMs + 2_450,
    meta: {
      trigger: 'voice_auto_reply',
    },
  });

  const nextRun = appendStandbySoakEntry(run, responseEntry, startedAtMs + 2_450);
  const summary = getStandbySoakSummary(nextRun, startedAtMs + 2_450);

  assert.equal(summary.pass, false);
  assert.equal(summary.verdict, 'fail');
  assert.equal(summary.fixtureFailureCount, 1);
  assert.deepEqual(
    summary.fixtureSummaries.map(({ id, falseActivationCount, verdict }) => ({
      id,
      falseActivationCount,
      verdict,
    })),
    [
      {
        id: 'ambient-noise-standby',
        falseActivationCount: 0,
        verdict: 'pass',
      },
      {
        id: 'tv-audio-standby',
        falseActivationCount: 0,
        verdict: 'pass',
      },
      {
        id: 'nearby-conversation-standby',
        falseActivationCount: 1,
        verdict: 'fail',
      },
    ]
  );
});

test('response generation after the standby window is ignored for the completed verdict', () => {
  const startedAtMs = new Date('2026-03-31T00:00:00.000Z').getTime();
  const run = createStandbySoakRun({
    durationMs: 3_000,
    platformId: 'chrome-macos',
    startedAt: startedAtMs,
  });
  const responseEntry = createStandbySoakMeasurementEntry({
    direction: 'outgoing',
    event: {
      event_id: 'event_late_response',
      type: 'response.create',
    },
    measuredAt: startedAtMs + 4_000,
    meta: {
      trigger: 'voice_auto_reply',
    },
  });

  const nextRun = appendStandbySoakEntry(run, responseEntry, startedAtMs + 4_000);

  assert.equal(nextRun.entries.length, 0);
  assert.equal(nextRun.falseActivationCount, 0);
  assert.equal(getStandbySoakSummary(nextRun, startedAtMs + 4_000).pass, true);
});
