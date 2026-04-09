import {
  formatTurnLatency,
  isTurnLatencyMeasurementComplete,
} from '@/shared/lib/response-latency';

const ITEM_EVENT_TYPES = new Set([
  'conversation.item.create',
  'conversation.item.added',
  'conversation.item.created',
  'conversation.item.done',
  'response.output_item.done',
]);

const ASSISTANT_TEXT_EVENT_TYPES = new Set([
  'response.done',
  'response.output_text.done',
  'response.output_audio_transcript.done',
]);

const getTextFromContentArray = (contentArray = []) => {
  const texts = contentArray.flatMap((content) => {
    if (content.type === 'input_text' && content.text) {
      return [content.text];
    }

    if (content.type === 'input_audio' && content.transcript) {
      return [content.transcript];
    }

    if (content.type === 'output_text' && content.text) {
      return [content.text];
    }

    if (content.type === 'output_audio' && content.transcript) {
      return [content.transcript];
    }

    if (content.transcript) {
      return [content.transcript];
    }

    if (content.text) {
      return [content.text];
    }

    return [];
  });

  return texts.length > 0 ? texts.join(' ') : null;
};

export const extractTextContent = (event) => {
  if (event.type === 'response.done' && event.response?.output) {
    return getTextFromContentArray(
      event.response.output.flatMap((item) => item.content || [])
    );
  }

  if (ITEM_EVENT_TYPES.has(event.type) && event.item?.content) {
    return getTextFromContentArray(event.item.content);
  }

  if (
    event.type === 'response.output_audio_transcript.done' &&
    event.transcript
  ) {
    return event.transcript;
  }

  if (event.type === 'response.output_text.done' && event.text) {
    return event.text;
  }

  return null;
};

export const getRenderableMessageKey = (event) =>
  event.item?.id ||
  event.item_id ||
  event.response_id ||
  event.response?.output?.[0]?.id ||
  event.response?.id ||
  event.event_id;

export const getEventRole = (event) => {
  if (ITEM_EVENT_TYPES.has(event.type) && event.item?.role) {
    return event.item.role;
  }

  if (ASSISTANT_TEXT_EVENT_TYPES.has(event.type)) {
    return 'assistant';
  }

  return null;
};

export const isVoiceInputEvent = (event) => {
  if (!ITEM_EVENT_TYPES.has(event.type) || !event.item?.content) {
    return false;
  }

  return event.item.content.some((content) => content.type === 'input_audio');
};

export const formatEventSummary = (event) => {
  const isClient = event.event_id && !event.event_id.startsWith('event_');
  const summary = [];

  if (isTurnLatencyMeasurementComplete(event.latencyMeasurement)) {
    summary.push({
      label: '응답 시작 지연',
      value: formatTurnLatency(event.latencyMeasurement),
    });
  }

  if (event.type === 'response.done' && event.response) {
    const { response } = event;
    summary.push({
      label: '상태',
      value: response.status === 'completed' ? '완료' : response.status,
    });

    if (response.usage) {
      const { usage } = response;
      summary.push({
        label: '토큰 사용량',
        value: `입력 ${usage.input_tokens?.toLocaleString() || 0} / 출력 ${
          usage.output_tokens?.toLocaleString() || 0
        } (총 ${usage.total_tokens?.toLocaleString() || 0})`,
      });

      if (usage.input_token_details) {
        const details = usage.input_token_details;
        if (details.text_tokens > 0) {
          summary.push({
            label: '텍스트 토큰',
            value: details.text_tokens.toLocaleString(),
          });
        }
        if (details.audio_tokens > 0) {
          summary.push({
            label: '오디오 토큰',
            value: details.audio_tokens.toLocaleString(),
          });
        }
      }
    }

    if (response.audio?.output) {
      const audio = response.audio.output;
      summary.push({ label: '음성', value: audio.voice || '알 수 없음' });
      if (audio.format) {
        summary.push({
          label: '오디오 형식',
          value: `${audio.format.type} (${(audio.format.rate / 1000).toFixed(0)}kHz)`,
        });
      }
    }

    if (response.output_modalities) {
      summary.push({
        label: '출력 형식',
        value: response.output_modalities.join(', '),
      });
    }
  }

  if (ITEM_EVENT_TYPES.has(event.type) && event.item) {
    const { item } = event;
    summary.push({
      label: '역할',
      value:
        item.role === 'user'
          ? '사용자'
          : item.role === 'assistant'
            ? 'AI'
            : item.role,
    });
    summary.push({ label: '메시지 타입', value: item.type });

    if (item.content) {
      const contentTypes = item.content.map((content) => {
        if (content.type === 'input_text') {
          return '텍스트';
        }
        if (content.type === 'input_audio') {
          return '음성';
        }
        if (content.type === 'output_text') {
          return '텍스트 응답';
        }
        if (content.type === 'output_audio') {
          return '음성 응답';
        }
        return content.type;
      });
      summary.push({ label: '입력 형식', value: contentTypes.join(', ') });
    }
  }

  if (event.type === 'session.update' && event.session) {
    summary.push({ label: '이벤트', value: '세션 설정 업데이트' });

    const transcription =
      event.session.audio?.input?.transcription || event.session.input_audio_transcription;
    const turnDetection =
      event.session.audio?.input?.turn_detection || event.session.turn_detection;

    if (transcription) {
      summary.push({
        label: '음성 인식',
        value: transcription.model || '활성화',
      });
      if (transcription.language) {
        summary.push({ label: '인식 언어', value: transcription.language });
      }
    }

    if (turnDetection) {
      summary.push({
        label: '마이크 임계치',
        value: `${Math.round((turnDetection.threshold || 0) * 100)}%`,
      });
      summary.push({
        label: '자동 응답',
        value: turnDetection.create_response === false ? '비활성화' : '활성화',
      });
    }
  }

  if (event.type === 'output_audio_buffer.started') {
    summary.push({ label: '이벤트', value: 'AI 음성 출력 시작' });
  }

  if (event.type === 'output_audio_buffer.stopped') {
    summary.push({ label: '이벤트', value: 'AI 음성 출력 종료' });
  }

  if (event.type === 'conversation.item.input_audio_transcription.completed') {
    summary.push({ label: '이벤트', value: '음성 인식 완료' });
    if (event.transcript) {
      summary.push({ label: '인식 결과', value: event.transcript });
    }
  }

  if (event.type === 'response.output_text.done' && event.text) {
    summary.push({ label: '이벤트', value: '텍스트 응답 완료' });
    summary.push({ label: '응답', value: event.text });
  }

  if (
    event.type === 'response.output_audio_transcript.done' &&
    event.transcript
  ) {
    summary.push({ label: '이벤트', value: '음성 응답 자막 완료' });
    summary.push({ label: '자막', value: event.transcript });
  }

  if (event.type === 'error' && event.error) {
    summary.push({ label: '이벤트', value: '오류' });
    summary.push({
      label: '오류 코드',
      value: event.error.code || '알 수 없음',
    });
    summary.push({
      label: '메시지',
      value: event.error.message || '오류 메시지 없음',
    });
  }

  if (summary.length === 0) {
    summary.push({ label: '이벤트 타입', value: event.type });
    if (event.event_id) {
      summary.push({ label: '발신', value: isClient ? '클라이언트' : '서버' });
    }
  }

  return summary;
};
