export const createTimestamp = () =>
  new Date().toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const getLogTimestamp = () => `[${createTimestamp()}]`;

export const enrichOutgoingEvent = (event) => ({
  ...event,
  event_id: event.event_id || crypto.randomUUID(),
});

export const enrichIncomingEvent = (event) => ({
  ...event,
  timestamp: event.timestamp || createTimestamp(),
});

export const createVoiceDisplayEvent = (transcript, options = {}) => ({
  latencyMeasurement: options.latencyMeasurement || null,
  sourceEventId: options.sourceEventId || null,
  type: 'conversation.item.create',
  event_id: crypto.randomUUID(),
  timestamp: createTimestamp(),
  item: {
    type: 'message',
    role: 'user',
    content: [
      {
        type: 'input_audio',
        transcript,
      },
    ],
  },
});

export const getTranscriptText = (event) => event?.transcript?.trim() || '';
