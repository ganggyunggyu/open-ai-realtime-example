import {
  MIN_TRANSCRIPT_LENGTH,
  TRANSCRIPTION_DUPLICATE_WINDOW_MS,
} from './constants.js';

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

export const shouldAcceptTranscript = (
  event,
  previousTranscriptState,
  now = Date.now()
) => {
  const transcript = getTranscriptText(event);

  if (!transcript || transcript.length < MIN_TRANSCRIPT_LENGTH) {
    return false;
  }

  if (!/[A-Za-z0-9\u00C0-\u024F\u0400-\u04FF\u3040-\u30FF\u3400-\u9FBF\uAC00-\uD7A3]/.test(transcript)) {
    return false;
  }

  if (!previousTranscriptState) {
    return true;
  }

  const normalizedTranscript = transcript
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedPrevious = previousTranscriptState.transcript
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (
    normalizedTranscript === normalizedPrevious &&
    now - previousTranscriptState.timestamp < TRANSCRIPTION_DUPLICATE_WINDOW_MS
  ) {
    return false;
  }

  return true;
};
