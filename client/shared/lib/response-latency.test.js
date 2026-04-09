import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeTurnLatencyMeasurement,
  createTurnLatencyMeasurement,
  formatTurnLatency,
  isTurnLatencyMeasurementComplete,
} from './response-latency.js';

test('creates a pending turn latency measurement from utterance end timing', () => {
  const measurement = createTurnLatencyMeasurement({
    transcript: '오늘 일정 정리해줘',
    turnId: 'turn-1',
    utteranceEndedAtMs: 10_200,
    utteranceEventId: 'event-user-1',
  });

  assert.deepEqual(measurement, {
    latencyMs: null,
    responseEventId: null,
    responseStartedAtMs: null,
    status: 'pending',
    transcript: '오늘 일정 정리해줘',
    turnId: 'turn-1',
    utteranceEndedAtMs: 10_200,
    utteranceEventId: 'event-user-1',
  });
});

test('completes a turn latency measurement when the first model response starts', () => {
  const measurement = createTurnLatencyMeasurement({
    transcript: '오늘 일정 정리해줘',
    turnId: 'turn-1',
    utteranceEndedAtMs: 10_200,
  });

  const completedMeasurement = completeTurnLatencyMeasurement({
    measurement,
    responseEventId: 'event-ai-1',
    responseStartedAtMs: 10_635,
  });

  assert.equal(isTurnLatencyMeasurementComplete(completedMeasurement), true);
  assert.equal(completedMeasurement.latencyMs, 435);
  assert.equal(formatTurnLatency(completedMeasurement), '435ms');
});

test('clamps negative latency values to zero when clocks arrive out of order', () => {
  const measurement = createTurnLatencyMeasurement({
    turnId: 'turn-1',
    utteranceEndedAtMs: 10_200,
  });

  const completedMeasurement = completeTurnLatencyMeasurement({
    measurement,
    responseStartedAtMs: 10_150,
  });

  assert.equal(completedMeasurement.latencyMs, 0);
});

test('does not format incomplete latency measurements', () => {
  const measurement = createTurnLatencyMeasurement({
    turnId: 'turn-1',
    utteranceEndedAtMs: 10_200,
  });

  assert.equal(isTurnLatencyMeasurementComplete(measurement), false);
  assert.equal(formatTurnLatency(measurement), null);
});
