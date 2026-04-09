export const createTurnLatencyMeasurement = ({
  transcript = '',
  turnId,
  utteranceEndedAtMs,
  utteranceEventId = null,
}) => ({
  latencyMs: null,
  responseEventId: null,
  responseStartedAtMs: null,
  status: 'pending',
  transcript,
  turnId,
  utteranceEndedAtMs,
  utteranceEventId,
});

export const completeTurnLatencyMeasurement = ({
  measurement,
  responseEventId = null,
  responseStartedAtMs,
}) => {
  if (
    !measurement ||
    typeof measurement.utteranceEndedAtMs !== 'number' ||
    typeof responseStartedAtMs !== 'number'
  ) {
    return null;
  }

  return {
    ...measurement,
    latencyMs: Math.max(
      0,
      Math.round(responseStartedAtMs - measurement.utteranceEndedAtMs)
    ),
    responseEventId,
    responseStartedAtMs,
    status: 'completed',
  };
};

export const isTurnLatencyMeasurementComplete = (measurement) =>
  measurement?.status === 'completed' &&
  typeof measurement.latencyMs === 'number';

export const formatTurnLatency = (measurement) =>
  isTurnLatencyMeasurementComplete(measurement)
    ? `${measurement.latencyMs}ms`
    : null;
