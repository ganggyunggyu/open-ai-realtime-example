import {
  DEFAULT_NOISE_REDUCTION_TYPE,
  DEFAULT_REALTIME_VOICE,
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEFAULT_TRANSCRIPTION_MODEL,
} from './constants.js';

const TRANSCRIPTION_PROMPT =
  'Primary language is Korean. Transcribe only clearly audible speech. If the audio is only noise or unclear, return an empty transcript instead of guessing.';

export const buildSessionUpdateEvent = ({ micSensitivity }) => ({
  type: 'session.update',
  session: {
    type: 'realtime',
    output_modalities: ['audio'],
    audio: {
      input: {
        noise_reduction: {
          type: DEFAULT_NOISE_REDUCTION_TYPE,
        },
        transcription: {
          language: DEFAULT_TRANSCRIPTION_LANGUAGE,
          model: DEFAULT_TRANSCRIPTION_MODEL,
          prompt: TRANSCRIPTION_PROMPT,
        },
        turn_detection: {
          type: 'server_vad',
          threshold: micSensitivity,
          prefix_padding_ms: 300,
          silence_duration_ms: 1200,
          create_response: false,
          interrupt_response: true,
        },
      },
      output: {
        voice: DEFAULT_REALTIME_VOICE,
      },
    },
    include: ['item.input_audio_transcription.logprobs'],
  },
});

export const buildResponseCreateEvent = () => ({
  type: 'response.create',
  response: {
    output_modalities: ['audio'],
  },
});

export const buildInputAudioBufferCommitEvent = () => ({
  type: 'input_audio_buffer.commit',
});

export const buildTextMessageEvent = (message) => ({
  type: 'conversation.item.create',
  item: {
    type: 'message',
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: message,
      },
    ],
  },
});
