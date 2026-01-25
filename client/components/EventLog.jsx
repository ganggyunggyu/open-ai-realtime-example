import { User, Cpu, ChevronDown, ChevronUp, Mic, Code, Info } from 'react-feather';
import { useMemo, useState, useRef, useEffect } from 'react';

function extractTextContent(event) {
  if (event.type === 'response.done' && event.response?.output) {
    const transcripts = event.response.output
      .flatMap((item) => item.content || [])
      .filter((content) => content.transcript)
      .map((content) => content.transcript);
    return transcripts.length > 0 ? transcripts.join(' ') : null;
  }

  if (event.type === 'conversation.item.create' && event.item?.content) {
    const texts = event.item.content
      .filter((content) => content.type === 'input_text')
      .map((content) => content.text);
    if (texts.length > 0) return texts.join(' ');

    const audioTranscripts = event.item.content
      .filter((content) => content.type === 'input_audio' && content.transcript)
      .map((content) => content.transcript);
    if (audioTranscripts.length > 0) return audioTranscripts.join(' ');
  }

  if (
    event.type === 'response.output_audio_transcript.done' &&
    event.transcript
  ) {
    return event.transcript;
  }

  return null;
}

function isVoiceInput(event) {
  if (event.type === 'conversation.item.create' && event.item?.content) {
    return event.item.content.some((content) => content.type === 'input_audio');
  }
  return false;
}

function formatEventSummary(event) {
  const isClient = event.event_id && !event.event_id.startsWith('event_');
  const summary = [];

  if (event.type === 'response.done' && event.response) {
    const { response } = event;
    summary.push({ label: '상태', value: response.status === 'completed' ? '완료' : response.status });

    if (response.usage) {
      const { usage } = response;
      summary.push({
        label: '토큰 사용량',
        value: `입력 ${usage.input_tokens?.toLocaleString() || 0} / 출력 ${usage.output_tokens?.toLocaleString() || 0} (총 ${usage.total_tokens?.toLocaleString() || 0})`
      });

      if (usage.input_token_details) {
        const details = usage.input_token_details;
        if (details.text_tokens > 0) {
          summary.push({ label: '텍스트 토큰', value: details.text_tokens.toLocaleString() });
        }
        if (details.audio_tokens > 0) {
          summary.push({ label: '오디오 토큰', value: details.audio_tokens.toLocaleString() });
        }
      }
    }

    if (response.audio?.output) {
      const audio = response.audio.output;
      summary.push({ label: '음성', value: audio.voice || '알 수 없음' });
      if (audio.format) {
        summary.push({ label: '오디오 형식', value: `${audio.format.type} (${(audio.format.rate / 1000).toFixed(0)}kHz)` });
      }
    }

    if (response.output_modalities) {
      summary.push({ label: '출력 형식', value: response.output_modalities.join(', ') });
    }
  }

  if (event.type === 'conversation.item.create' && event.item) {
    const { item } = event;
    summary.push({ label: '역할', value: item.role === 'user' ? '사용자' : item.role === 'assistant' ? 'AI' : item.role });
    summary.push({ label: '메시지 타입', value: item.type });

    if (item.content) {
      const contentTypes = item.content.map(c => {
        if (c.type === 'input_text') return '텍스트';
        if (c.type === 'input_audio') return '음성';
        return c.type;
      });
      summary.push({ label: '입력 형식', value: contentTypes.join(', ') });
    }
  }

  if (event.type === 'session.update' && event.session) {
    summary.push({ label: '이벤트', value: '세션 설정 업데이트' });
    if (event.session.input_audio_transcription) {
      summary.push({ label: '음성 인식', value: event.session.input_audio_transcription.model || '활성화' });
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

  if (summary.length === 0) {
    summary.push({ label: '이벤트 타입', value: event.type });
    if (event.event_id) {
      summary.push({ label: '발신', value: isClient ? '클라이언트' : '서버' });
    }
  }

  return summary;
}

function EventDetails({ event, viewMode }) {
  const summary = formatEventSummary(event);

  if (viewMode === 'summary') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-[var(--color-gray-50)] dark:bg-[var(--color-gray-800)] space-y-2">
        {summary.map(({ label, value }, index) => (
          <div key={index} className="flex items-start gap-2 text-sm">
            <span className="text-[var(--color-gray-500)] dark:text-[var(--color-gray-400)] min-w-[80px] flex-shrink-0">
              {label}
            </span>
            <span className="text-[var(--color-gray-700)] dark:text-[var(--color-gray-200)] break-all">
              {value}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === 'raw') {
    return (
      <div className="mt-2 p-3 rounded-xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] overflow-x-auto">
        <pre className="text-xs text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)] whitespace-pre-wrap font-mono">
          {JSON.stringify(event, null, 2)}
        </pre>
      </div>
    );
  }

  return null;
}

function ChatBubble({ event, timestamp }) {
  const [viewMode, setViewMode] = useState('closed');
  const isClient = event.event_id && !event.event_id.startsWith('event_');
  const textContent = extractTextContent(event);
  const isVoice = isVoiceInput(event);

  if (!textContent) return null;

  const cycleViewMode = () => {
    if (viewMode === 'closed') setViewMode('summary');
    else if (viewMode === 'summary') setViewMode('raw');
    else setViewMode('closed');
  };

  return (
    <div
      className={`flex gap-3 animate-fade-in ${isClient ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center ${
          isClient
            ? 'bg-[var(--color-primary)] text-white'
            : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-700)] text-[var(--color-gray-600)] dark:text-[var(--color-gray-300)]'
        }`}
      >
        {isClient ? <User size={16} /> : <Cpu size={16} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isClient ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl shadow-sm ${
            isClient
              ? 'bg-[var(--color-primary)] text-white rounded-tr-md'
              : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] text-[var(--color-gray-900)] dark:text-[var(--color-gray-100)] rounded-tl-md'
          }`}
        >
          {isVoice && (
            <div
              className={`flex items-center gap-1.5 text-xs mb-1.5 ${
                isClient
                  ? 'text-white/70'
                  : 'text-[var(--color-gray-500)]'
              }`}
            >
              <Mic size={12} />
              <span>음성 메시지</span>
            </div>
          )}
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {textContent}
          </p>
        </div>

        {/* Timestamp & Details Toggle */}
        <div
          className={`flex items-center gap-2 mt-1.5 text-xs text-[var(--color-gray-400)] ${
            isClient ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{timestamp}</span>
          <button
            onClick={cycleViewMode}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md transition-all duration-200 ${
              viewMode !== 'closed'
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'hover:bg-[var(--color-gray-100)] dark:hover:bg-[var(--color-gray-700)] hover:text-[var(--color-gray-600)] dark:hover:text-[var(--color-gray-300)]'
            }`}
          >
            {viewMode === 'closed' && (
              <>
                <Info size={12} />
                <span>상세</span>
              </>
            )}
            {viewMode === 'summary' && (
              <>
                <Code size={12} />
                <span>코드</span>
              </>
            )}
            {viewMode === 'raw' && (
              <>
                <ChevronUp size={12} />
                <span>닫기</span>
              </>
            )}
          </button>
        </div>

        {/* Event Details */}
        <EventDetails event={event} viewMode={viewMode} />
      </div>
    </div>
  );
}

function SystemEvent({ event, timestamp }) {
  const [viewMode, setViewMode] = useState('closed');

  const cycleViewMode = () => {
    if (viewMode === 'closed') setViewMode('summary');
    else if (viewMode === 'summary') setViewMode('raw');
    else setViewMode('closed');
  };

  return (
    <div className="flex justify-center animate-fade-in">
      <div className="max-w-[90%]">
        <button
          onClick={cycleViewMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition-colors ${
            viewMode !== 'closed'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] text-[var(--color-gray-500)] hover:bg-[var(--color-gray-200)] dark:hover:bg-[var(--color-gray-700)]'
          }`}
        >
          <span className="truncate max-w-[200px]">{event.type}</span>
          <span className="text-[var(--color-gray-400)]">{timestamp}</span>
          {viewMode === 'closed' && <Info size={12} />}
          {viewMode === 'summary' && <Code size={12} />}
          {viewMode === 'raw' && <ChevronUp size={12} />}
        </button>

        <EventDetails event={event} viewMode={viewMode} />
      </div>
    </div>
  );
}

export default function EventLog({ events }) {
  const [messagesOnly, setMessagesOnly] = useState(true);
  const containerRef = useRef(null);

  const filtered = useMemo(() => {
    if (!events || events.length === 0) return [];
    if (!messagesOnly) return events;

    const list = [];
    const seenResponseIds = new Set();

    for (const ev of events) {
      if (ev.type === 'conversation.item.create') {
        list.push(ev);
        continue;
      }
      if (ev.type === 'response.done') {
        const responseId = ev.response?.id;
        if (responseId && seenResponseIds.has(responseId)) {
          continue;
        }
        if (responseId) {
          seenResponseIds.add(responseId);
        }
        list.push(ev);
        continue;
      }
    }
    return list;
  }, [events, messagesOnly]);

  const eventsToDisplay = useMemo(() => {
    const deltaSeen = {};
    const result = [];

    filtered.forEach((event) => {
      if (event?.type?.endsWith('delta')) {
        if (deltaSeen[event.type]) return;
        deltaSeen[event.type] = true;
      }

      const textContent = extractTextContent(event);
      if (messagesOnly && textContent) {
        result.push(
          <ChatBubble
            key={event.event_id}
            event={event}
            timestamp={event.timestamp}
          />
        );
      } else if (!messagesOnly) {
        if (textContent) {
          result.push(
            <ChatBubble
              key={event.event_id}
              event={event}
              timestamp={event.timestamp}
            />
          );
        } else {
          result.push(
            <SystemEvent
              key={event.event_id}
              event={event}
              timestamp={event.timestamp}
            />
          );
        }
      }
    });

    return result;
  }, [filtered, messagesOnly]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter Toggle */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-gray-200)] dark:border-[var(--color-gray-700)]">
        <span className="text-sm font-medium text-[var(--color-gray-600)] dark:text-[var(--color-gray-400)]">
          {messagesOnly ? '대화 내역' : '전체 이벤트'}
        </span>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)]">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
              messagesOnly
                ? 'bg-white dark:bg-[var(--color-gray-700)] text-[var(--color-gray-900)] dark:text-white shadow-sm'
                : 'text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] dark:hover:text-[var(--color-gray-300)]'
            }`}
            onClick={() => setMessagesOnly(true)}
          >
            대화
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
              !messagesOnly
                ? 'bg-white dark:bg-[var(--color-gray-700)] text-[var(--color-gray-900)] dark:text-white shadow-sm'
                : 'text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] dark:hover:text-[var(--color-gray-300)]'
            }`}
            onClick={() => setMessagesOnly(false)}
          >
            전체
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 flex flex-col-reverse gap-4 overflow-y-auto"
      >
        {eventsToDisplay.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 mb-4 rounded-2xl bg-[var(--color-gray-100)] dark:bg-[var(--color-gray-800)] flex items-center justify-center">
              <Cpu size={28} className="text-[var(--color-gray-400)]" />
            </div>
            <p className="text-[var(--color-gray-500)] text-sm">
              대화를 시작해보세요
            </p>
            <p className="text-[var(--color-gray-400)] text-xs mt-1">
              음성이나 텍스트로 메시지를 보낼 수 있어요
            </p>
          </div>
        ) : (
          eventsToDisplay
        )}
      </div>
    </div>
  );
}
